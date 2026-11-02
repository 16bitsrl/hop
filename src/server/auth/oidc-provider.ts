export type OidcProvider = "google" | "microsoft" | "other";

/** Which well-known provider a configuration address belongs to, to show its symbol on the sign-in button. */
export function oidcProvider(discoveryUrl: string): OidcProvider {
  let host: string;
  try {
    host = new URL(discoveryUrl).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === "accounts.google.com") return "google";
  if (host === "login.microsoftonline.com") return "microsoft";
  return "other";
}
