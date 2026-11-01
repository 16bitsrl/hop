import { describe, expect, it } from "vitest";
import { readBodyCapped } from "./body";

const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://x.test/", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

describe("readBodyCapped", () => {
  it("reads a body under the limit", async () => {
    const out = await readBodyCapped(request(new Uint8Array([1, 2, 3])), 10);
    expect(out && [...out]).toEqual([1, 2, 3]);
  });

  it("refuses by content-length without reading anything", async () => {
    let pulled = false;
    const body = new ReadableStream({ pull(c) { pulled = true; c.enqueue(new Uint8Array(5)); } }, { highWaterMark: 0 });
    const out = await readBodyCapped(request(body, { "content-length": "1000" }), 10);
    expect(out).toBeNull();
    expect(pulled).toBe(false);
  });

  it("stops reading a body that lies about its size or has none, as soon as the limit is passed", async () => {
    let chunks = 0;
    const endless = new ReadableStream({ pull(c) { chunks++; c.enqueue(new Uint8Array(1024)); } }, { highWaterMark: 0 });
    const out = await readBodyCapped(request(endless), 4096);
    expect(out).toBeNull();
    expect(chunks).toBeLessThan(20);
  });

  it("treats a missing body as empty", async () => {
    const out = await readBodyCapped(new Request("http://x.test/", { method: "POST" }), 10);
    expect(out?.byteLength).toBe(0);
  });
});
