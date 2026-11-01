/**
 * Link passwords: PBKDF2-SHA256 via WebCrypto, self-describing format
 * `pbkdf2$sha256$<iterations>$<salt base64>$<hash base64>`.
 * (Workers cap PBKDF2 at 100000 iterations.)
 */
const ITERATIONS = 100_000;
const KEY_BITS = 256;

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

export async function hashLinkPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyLinkPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, alg, iter, salt, hash] = stored.split("$");
    if (scheme !== "pbkdf2" || alg !== "sha256" || !iter || !salt || !hash) return false;
    const iterations = Number(iter);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
    const expected = fromB64(hash);
    const actual = await derive(password, fromB64(salt) as Uint8Array<ArrayBuffer>, iterations);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}
