/** Error thrown for every non-2xx answer. `code` is the server's `error` string (see i18n `errors` namespace). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields: string[] = [],
  ) {
    super(code);
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

/**
 * Typed fetch helper for the JSON API.
 *   const { users } = await api<{ users: User[] }>("/api/users");
 *   await api("/api/me", { method: "PATCH", body: { name } });
 */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
    signal: opts.signal,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? `http_${res.status}`;
    const fields = (data as { fields?: string[] } | null)?.fields ?? [];
    throw new ApiError(res.status, code, fields);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
