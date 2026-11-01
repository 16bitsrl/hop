import { sha256Hex } from "./users";

/**
 * First-run setup and restore can require a shared secret (SETUP_TOKEN), so that nobody who finds a
 * fresh deployment first can claim it. True when no token is configured or the given one matches.
 */
export async function setupTokenOk(configured: string | undefined, given: string | null | undefined): Promise<boolean> {
  if (!configured) return true;
  if (!given) return false;
  // Compare digests so the check does not depend on how many leading characters match.
  const [a, b] = await Promise.all([sha256Hex(configured), sha256Hex(given)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
