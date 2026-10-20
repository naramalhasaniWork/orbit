/**
 * Address rules shared by the SSRF pre-check (ssrf.ts) and the connect-time guard
 * (ssrf-transport.ts).
 *
 * ORBIT_ALLOW_PRIVATE_TARGETS=true lifts the private-range checks for self-hosters testing
 * local apps, but link-local (169.254/16, fe80::/10) stays blocked: that range holds cloud
 * metadata endpoints.
 */

import { BlockList, isIP } from "net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type Family = "ipv4" | "ipv6";

function buildList(subnets: Array<[string, number, Family]>): BlockList {
  const list = new BlockList();
  for (const [net, prefix, family] of subnets) {
    list.addSubnet(net, prefix, family);
  }
  return list;
}

/** Always blocked: cloud metadata lives in link-local space. */
const LINK_LOCAL = buildList([
  ["169.254.0.0", 16, "ipv4"],
  ["fe80::", 10, "ipv6"],
]);

/** Blocked unless ORBIT_ALLOW_PRIVATE_TARGETS=true. */
const PRIVATE = buildList([
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"], // CGNAT
  ["127.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.0.2.0", 24, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"], // multicast
  ["240.0.0.0", 4, "ipv4"], // reserved + broadcast
  ["::", 128, "ipv6"],
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"], // unique local
  ["ff00::", 8, "ipv6"], // multicast
  ["100::", 64, "ipv6"],
  ["2001:db8::", 32, "ipv6"],
]);

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".localdomain"];

function allowPrivateTargets(): boolean {
  return process.env.ORBIT_ALLOW_PRIVATE_TARGETS === "true";
}

/** Expand any IPv6 text form into 8 16-bit groups. */
function ipv6Groups(address: string): number[] {
  let addr = address.split("%")[0];
  const v4Tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const o = v4Tail[1].split(".").map(Number);
    addr = addr.slice(0, -v4Tail[1].length) +
      `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const [head, tail] = addr.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - headParts.length - tailParts.length;
  return [...headParts, ...Array<string>(fill).fill("0"), ...tailParts].map((g) => parseInt(g, 16));
}

/** IPv4 embedded in a mapped/compatible/NAT64 IPv6 address, if any. */
function embeddedIpv4(address: string): string | null {
  const g = ipv6Groups(address);
  const leadingZero = g.slice(0, 5).every((x) => x === 0);
  const mapped = leadingZero && g[5] === 0xffff; // ::ffff:a.b.c.d
  const compatible = leadingZero && g[5] === 0 && (g[6] !== 0 || g[7] > 1); // ::a.b.c.d
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0); // 64:ff9b::/96
  if (!mapped && !compatible && !nat64) return null;
  return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
}

/** Why an IP literal is not allowed, or null if it is a public address. */
export function blockedIpReason(address: string): string | null {
  const family = isIP(address);
  if (family === 0) return "not a valid IP address";
  const type: Family = family === 4 ? "ipv4" : "ipv6";

  if (type === "ipv6") {
    const v4 = embeddedIpv4(address);
    if (v4) return blockedIpReason(v4);
  }

  if (LINK_LOCAL.check(address, type)) return "link-local address";
  if (!allowPrivateTargets() && PRIVATE.check(address, type)) {
    return "loopback, private or reserved address";
  }
  return null;
}

export function blockedHostnameReason(hostname: string): string | null {
  if (allowPrivateTargets()) return null;
  if (hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return "internal hostname";
  }
  return null;
}
