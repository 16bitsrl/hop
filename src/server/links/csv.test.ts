import { describe, expect, it } from "vitest";
import { parseCsv, readCsvRows, splitTags } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, commas, doubled quotes and newlines inside fields", () => {
    expect(parseCsv('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4\n')).toEqual([
      ["a", "b,c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("skips blank lines and the BOM, and keeps empty trailing cells", () => {
    expect(parseCsv("﻿a,b\n\n1,\n")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });

  it("supports a semicolon delimiter", () => {
    expect(parseCsv("a;b\n1;2", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("readCsvRows", () => {
  it("maps columns by header in any order and validates rows", () => {
    const { rows, error } = readCsvRows(
      ["slug,URL,tags", 'ok,https://example.com/a,"x; y|z"', "bad slug,https://example.com/b,", "ok,https://example.com/c,", "fine,ftp://nope,"].join("\n"),
    );
    expect(error).toBeUndefined();
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    expect(rows[0]).toMatchObject({ slug: "ok", url: "https://example.com/a", tags: ["x", "y", "z"], errors: [] });
    expect(rows[1]!.errors).toEqual(["invalid_slug"]);
    expect(rows[2]!.errors).toEqual(["slug_duplicate"]);
    expect(rows[3]!.errors).toEqual(["invalid_url"]);
  });

  it("detects semicolon-separated files", () => {
    const { rows } = readCsvRows("url;slug\nhttps://example.com;abc");
    expect(rows[0]).toMatchObject({ url: "https://example.com", slug: "abc" });
  });

  it("treats the same slug on different domains as different", () => {
    const { rows } = readCsvRows("url,slug,domain\nhttps://a.test,x,one.test\nhttps://b.test,x,two.test");
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("reports structural problems", () => {
    expect(readCsvRows("").error).toBe("csv_empty");
    expect(readCsvRows("slug,title\nx,y").error).toBe("csv_missing_url");
    const many = "url\n" + Array.from({ length: 501 }, () => "https://a.test").join("\n");
    expect(readCsvRows(many).error).toBe("csv_too_many_rows");
  });

  it("splits tags", () => {
    expect(splitTags(" a, b;c|a ,, ")).toEqual(["a", "b", "c"]);
  });
});
