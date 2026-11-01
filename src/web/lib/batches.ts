/** The server accepts at most this many links (or ids) per write request. */
export const BATCH_SIZE = 25;

export function inBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
