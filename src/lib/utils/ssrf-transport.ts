/**
 * HTTP transport that checks the address at connect time.
 *
 * fetch() resolves DNS itself, so a pre-check (assertPublicUrl) followed by fetch() can be
 * defeated by a DNS server that answers differently the second time. Here the socket's own
 * `lookup` runs every resolved address through blockedIpReason, so the address that is
 * checked is the address that is connected to. No redirects are followed.
 */

import http from "http";
import https from "https";
import { lookup as dnsLookup } from "dns";
import type { LookupFunction } from "net";
import { Readable } from "stream";
import { blockedIpReason, UnsafeUrlError } from "./ssrf-rules";

export interface PinnedRequestInit {
  method: string;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

/** net.connect `lookup` option: resolve, then refuse unless every address is public. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
  dnsLookup(hostname, { all: true, verbatim: true, family }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    for (const { address } of addresses) {
      const reason = blockedIpReason(address);
      if (reason) {
        return callback(new UnsafeUrlError(`Host ${hostname} resolves to a ${reason}`) as NodeJS.ErrnoException, "", 0);
      }
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function toBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new Error("Unsupported request body type for SSRF-guarded fetch");
}

export function pinnedRequest(url: URL, init: PinnedRequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const payload = toBuffer(init.body);
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    init.headers.forEach((value, key) => {
      headers[key] = value;
    });
    if (payload && !headers["content-length"]) headers["content-length"] = String(payload.length);

    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      { method: init.method, headers, lookup: guardedLookup, signal: init.signal },
      (res) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((v) => responseHeaders.append(key, v));
          else if (value !== undefined) responseHeaders.set(key, value);
        }
        const status = res.statusCode ?? 0;
        const hasBody = !NULL_BODY_STATUSES.has(status) && init.method !== "HEAD";
        if (!hasBody) res.resume();
        resolve(
          new Response(hasBody ? (Readable.toWeb(res) as ReadableStream) : null, {
            status,
            statusText: res.statusMessage,
            headers: responseHeaders,
          })
        );
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}
