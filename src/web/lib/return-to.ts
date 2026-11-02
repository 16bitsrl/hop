/** The page someone asked for before being sent to sign in, so they land there afterwards. */

const KEY = "hop-return-to";

/** Only paths inside the app: never another site ("//host" or a full address). */
export function safeAppPath(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : null;
}

export function rememberReturnTo(path: string) {
  try {
    if (safeAppPath(path) && path !== "/" && path !== "/links") sessionStorage.setItem(KEY, path);
  } catch {
    /* storage can be unavailable: then the sign-in just opens the links */
  }
}

/** Where to go after signing in: `next` from the address, else the remembered page, else the links. */
export function takeReturnTo(next?: unknown): string {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* see above */
  }
  return safeAppPath(next) ?? safeAppPath(stored) ?? "/links";
}
