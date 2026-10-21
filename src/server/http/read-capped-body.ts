import { HttpError } from "./errors";

/**
 * Reads at most `maxBytes` of the request body and returns a fresh Request carrying those bytes,
 * so `.formData()` / `.json()` on it never buffer more than the cap. Content-Length is only a
 * first check: a missing or malformed one counts as over the cap, and the bytes are counted as
 * they arrive in case the header lies.
 */
export async function readCappedBody(
  req: Request,
  maxBytes: number,
  message = "Request body is too large"
): Promise<Request> {
  const tooLarge = () => new HttpError(413, "PAYLOAD_TOO_LARGE", message);

  const declared = req.headers.get("content-length");
  if (declared === null || !/^\d+$/.test(declared) || Number(declared) > maxBytes) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(req.headers);
  headers.set("content-length", String(total));
  return new Request(req.url, { method: req.method, headers, body });
}
