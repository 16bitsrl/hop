import type { Platform } from "../platform/types";

/**
 * The address request limits are counted against. Production uses the platform's trusted client IP.
 * In the test environment nothing real is available, so a test picks its "address" with `x-test-ip`;
 * requests without it get a random one and never share a counter.
 */
export function limiterIp(platform: Platform, req: Request): string | null {
  if (!platform.config.testMode) return platform.clientIp(req);
  const given = req.headers.get("x-test-ip");
  if (given) return given;
  const n = crypto.getRandomValues(new Uint8Array(3));
  return `10.${n[0]}.${n[1]}.${n[2]}`;
}
