import { describe, expect, it } from "vitest";
import { parseCsv, splitCsv } from "./csv";

describe("splitCsv", () => {
  const file = (n: number) => ["url,title", ...Array.from({ length: n }, (_, i) => `https://example.com/${i},"Title, ${i}"`)].join("\n");

  it("cuts a file into batches that each keep the header", () => {
    const parts = splitCsv(file(60), 25);
    expect(parts.map((p) => p.lineOffset)).toEqual([0, 25, 50]);
    expect(parts.map((p) => parseCsv(p.csv).length - 1)).toEqual([25, 25, 10]);
    for (const p of parts) expect(parseCsv(p.csv)[0]).toEqual(["url", "title"]);
  });

  it("keeps quoted commas, quotes and line breaks intact", () => {
    const text = 'url,notes\nhttps://a.test,"one, ""two""\nthree"\nhttps://b.test,plain\n';
    const parts = splitCsv(text, 1);
    expect(parts).toHaveLength(2);
    expect(parseCsv(parts[0]!.csv)[1]).toEqual(["https://a.test", 'one, "two"\nthree']);
  });

  it("reads semicolon files and hands them over as commas", () => {
    const parts = splitCsv("url;title\nhttps://a.test;A\n", 25);
    expect(parseCsv(parts[0]!.csv)).toEqual([["url", "title"], ["https://a.test", "A"]]);
  });

  it("returns a file without rows as it is, so the server can explain what is wrong", () => {
    expect(splitCsv("url\n", 25)).toEqual([{ csv: "url\n", lineOffset: 0 }]);
  });
});
