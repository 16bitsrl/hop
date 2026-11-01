/**
 * Client address from an X-Forwarded-For value, behind exactly one trusted reverse proxy.
 * The proxy appends the address it saw to whatever the client sent, so the rightmost entry is the
 * only one that cannot be forged; everything to its left is client-controlled.
 */
export function forwardedClientIp(header: string | null | undefined): string | null {
  const parts = (header ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : null;
}
