/**
 * Server-side fetch that refuses private networks (SSRF protection).
 *
 * On Workers `fetch` cannot reach private networks anyway, so only the hostname check applies.
 * In a container it can: the Node entry registers a transport that checks the addresses the
 * socket really connects to (no DNS rebinding gap). Redirects are followed by hand and every
 * hop goes through the same checks.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type Bytes = number[];

function parseIpv4(s: string): Bytes | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((n) => n <= 255) ? b : null;
}

/** Parses an IPv6 literal (no brackets) into 16 bytes. */
function parseIpv6(input: string): Bytes | null {
  const s = input.split("%")[0]!;
  if (!s.includes(":")) return null;
  let tail: Bytes = [];
  let text = s;
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...rest] : head;
  const bytes: Bytes = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 255);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function privateIpv4([a, b, c]: Bytes): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 || // multicast, reserved, broadcast
    (a === 100 && b! >= 64 && b! <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function privateIpv6(b: Bytes): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((v) => v === 0);
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return privateIpv4(b.slice(12)); // ::ffff:a.b.c.d
  if (zeros(0, 12)) return true; // ::, ::1 and the deprecated ::a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    // 64:ff9b::/96 maps IPv4 (NAT64); 64:ff9b:1::/48 is local use
    return zeros(4, 12) ? privateIpv4(b.slice(12)) : true;
  }
  if (b[0] === 0x20 && b[1] === 0x02) return privateIpv4(b.slice(2, 6)); // 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && (b[2] === 0 || (b[2] === 0x0d && b[3] === 0xb8))) return true; // Teredo, documentation
  if (b[0] === 0x01 && zeros(1, 8)) return true; // 100::/64 discard
  // fc00::/7 unique local, fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast
  return (b[0]! & 0xfe) === 0xfc || (b[0] === 0xfe && ((b[1]! & 0xc0) === 0x80 || (b[1]! & 0xc0) === 0xc0)) || b[0] === 0xff;
}

/** True for an IP literal (v4 or v6, brackets allowed) in a private, loopback, link-local or reserved range. */
export function isPrivateIp(ip: string): boolean {
  const s = ip.replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(s);
  if (v4) return privateIpv4(v4);
  const v6 = parseIpv6(s);
  return v6 ? privateIpv6(v6) : false;
}

/** Hosts a server-side fetch must never reach: local names and private IP literals. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return isPrivateIp(h);
}

export type SafeFetchInit = { method?: string; headers?: Record<string, string>; signal?: AbortSignal };

/** Performs one request without following redirects. Replaced on Node to pin the connected address. */
export type Transport = (url: URL, init: SafeFetchInit, opts: { allowPrivate: boolean }) => Promise<Response>;

let transport: Transport = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, signal: init.signal, redirect: "manual" });

/** Called by the Node entry. */
export function setSafeFetchTransport(t: Transport) {
  transport = t;
}

export interface SafeFetchOptions extends SafeFetchInit {
  /** Skip the private network checks. Only for the test environment. */
  allowPrivate?: boolean;
  /** Redirects to follow (default 5). */
  maxRedirects?: number;
  /** Replaces the transport (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Fetches `url`, following up to `maxRedirects` redirects (5 by default) and re-checking every hop.
 * Throws `UnsafeUrlError` for a refused address, protocol or too many redirects. Other failures
 * (network, timeout) throw whatever `fetch` throws. The caller owns the response body.
 */
export async function safeFetch(url: string | URL, opts: SafeFetchOptions = {}): Promise<Response> {
  const allowPrivate = opts.allowPrivate ?? false;
  const max = opts.maxRedirects ?? 5;
  const impl = opts.fetchImpl;
  const send: Transport = impl
    ? (u, init) => impl(u, { method: init.method, headers: init.headers, signal: init.signal, redirect: "manual" })
    : transport;
  let current = new URL(url);
  let method = opts.method ?? "GET";
  for (let hop = 0; ; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new UnsafeUrlError("unsupported_protocol");
    if (!allowPrivate && isPrivateHost(current.hostname)) throw new UnsafeUrlError("private_address");
    const res = await send(current, { method, headers: opts.headers, signal: opts.signal }, { allowPrivate });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    void res.body?.cancel().catch(() => {});
    if (hop >= max) throw new UnsafeUrlError("too_many_redirects");
    current = new URL(location, current);
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) method = "GET";
  }
}
