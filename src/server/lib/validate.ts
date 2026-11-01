import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** Parses and validates a JSON body. Throws a 400 with `{ error: "invalid_request", fields }`. */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => null);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join("."));
    throw new HTTPException(400, { res: c.json({ error: "invalid_request", fields }, 400) });
  }
  return result.data;
}

export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 502, error: string) {
  return c.json({ error }, status);
}
