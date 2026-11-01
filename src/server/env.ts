import type { Platform } from "./platform/types";
import type { user } from "./db/schema";

export type SessionUser = typeof user.$inferSelect;

export type AppEnv = {
  Variables: {
    platform: Platform;
    user: SessionUser | null;
    /** Set to "key" when the request was authenticated with a personal API key. */
    authVia?: "key";
  };
};
