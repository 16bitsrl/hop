import { ApiError } from "../../lib/api";

/** Reads a hop backup (NDJSON, optionally gzipped) in the browser and sends it to the server in chunks. */

const CHUNK_ROWS = 400;

type Row = { t: string; r: Record<string, string | number | null> };
type Line = { format?: string; version?: number; t?: string; r?: Row["r"]; end?: boolean; counts?: Record<string, number> };

async function post(path: string, body: unknown, token?: string): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-restore-token": token } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { error?: string }) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `http_${res.status}`);
  return data;
}

export class InvalidBackupError extends Error {}

/** Counts the data lines of a backup without keeping them (for the progress bar). */
async function* lines(file: File): AsyncGenerator<string> {
  let stream: ReadableStream<Uint8Array> = file.stream();
  if (/\.gz$/i.test(file.name) || file.type === "application/gzip") {
    stream = stream.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  const reader = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += value;
    let nl = rest.indexOf("\n");
    while (nl >= 0) {
      const line = rest.slice(0, nl);
      rest = rest.slice(nl + 1);
      if (line.trim()) yield line;
      nl = rest.indexOf("\n");
    }
  }
  if (rest.trim()) yield rest;
}

/** Restores the file. Throws ApiError (server refused) or InvalidBackupError (not a hop backup). */
export async function restoreBackup(file: File, onProgress: (done: number, total: number) => void): Promise<void> {
  // First pass: validate the header and the footer, and count the rows.
  let total = 0;
  let header = false;
  let counts: Record<string, number> | null = null;
  try {
    for await (const raw of lines(file)) {
      const line = JSON.parse(raw) as Line;
      if (!header) {
        if (line.format !== "hop-backup" || line.version !== 1) throw new InvalidBackupError();
        header = true;
      } else if (line.end) counts = line.counts ?? {};
      else if (line.t) total++;
    }
  } catch (e) {
    if (e instanceof InvalidBackupError || e instanceof ApiError) throw e;
    throw new InvalidBackupError();
  }
  if (!header || !counts) throw new InvalidBackupError();

  const { token } = (await post("/api/restore/start", {})) as { token: string };
  let done = 0;
  let batch: Row[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await post("/api/restore/rows", { rows: batch }, token);
    done += batch.length;
    batch = [];
    onProgress(done, total);
  };
  onProgress(0, total);
  for await (const raw of lines(file)) {
    const line = JSON.parse(raw) as Line;
    if (!line.t || !line.r) continue;
    batch.push({ t: line.t, r: line.r });
    if (batch.length >= CHUNK_ROWS) await flush();
  }
  await flush();
  await post("/api/restore/finish", { counts }, token);
}
