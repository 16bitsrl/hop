/** What is wrong with AUTH_SECRET, or null when it is fine. Shared by Node and Workers. */
export function authSecretProblem(secret: string | undefined): string | null {
  const value = secret?.trim();
  if (!value) return "AUTH_SECRET is required (at least 32 random characters, e.g. `openssl rand -base64 32`)";
  if (value.length < 32) return "AUTH_SECRET is too short: use at least 32 characters";
  return null;
}
