import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";

/** Better Auth client: sign in/out, password change and reset, passkeys, single sign-on. */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
