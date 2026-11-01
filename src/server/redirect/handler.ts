import type { Context } from "hono";
import type { AppEnv } from "../env";

/** Entry point for every request on a short domain. */
export async function handleShortDomain(c: Context<AppEnv>): Promise<Response> {
  return c.text("Not found", 404);
}
