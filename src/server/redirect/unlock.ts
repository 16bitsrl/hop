/** Signed "password entered" cookie, scoped to one link on one domain. */
const TTL_SECONDS = 4 * 60 * 60;

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function unlockCookieName(linkId: string): string {
  return `hop_unlock_${linkId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export async function createUnlockCookie(secret: string, linkId: string, domainId: string, secure: boolean) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = await sign(secret, `unlock|${domainId}|${linkId}|${exp}`);
  return (
    `${unlockCookieName(linkId)}=${exp}.${sig}; Max-Age=${TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax` +
    (secure ? "; Secure" : "")
  );
}

export async function hasValidUnlock(
  secret: string,
  cookieHeader: string | null,
  linkId: string,
  domainId: string,
): Promise<boolean> {
  if (!cookieHeader) return false;
  const name = unlockCookieName(linkId);
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k !== name) continue;
    const [expStr, sig] = rest.join("=").split(".");
    const exp = Number(expStr);
    if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    return sig === (await sign(secret, `unlock|${domainId}|${linkId}|${exp}`));
  }
  return false;
}
