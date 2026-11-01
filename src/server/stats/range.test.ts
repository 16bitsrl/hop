import { describe, expect, it } from "vitest";
import { bucketKeys, chooseBucket, isValidTimeZone, offsetAt, offsetSegments } from "./range";

const H = 3_600_000;
const D = 24 * H;

describe("time zones", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("computes offsets including daylight saving", () => {
    expect(offsetAt("Europe/Rome", Date.UTC(2026, 0, 15, 12))).toBe(H);
    expect(offsetAt("Europe/Rome", Date.UTC(2026, 6, 15, 12))).toBe(2 * H);
    expect(offsetAt("Asia/Kolkata", Date.UTC(2026, 0, 15))).toBe(5.5 * H);
    expect(offsetAt("America/Los_Angeles", Date.UTC(2026, 5, 10))).toBe(-7 * H);
  });

  it("finds the exact daylight saving transition inside a range", () => {
    // Europe/Rome springs forward on 2026-03-29 at 01:00 UTC.
    const segs = offsetSegments("Europe/Rome", Date.UTC(2026, 2, 20), Date.UTC(2026, 3, 5));
    expect(segs).toEqual([
      { start: Date.UTC(2026, 2, 20), offset: H },
      { start: Date.UTC(2026, 2, 29, 1), offset: 2 * H },
    ]);
  });

  it("returns one segment when nothing changes", () => {
    expect(offsetSegments("Asia/Tokyo", Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31))).toHaveLength(1);
  });
});

describe("buckets", () => {
  it("uses hours up to two days, days up to about a year, months beyond", () => {
    const to = Date.UTC(2026, 5, 10);
    expect(chooseBucket(to - 24 * H, to)).toBe("hour");
    expect(chooseBucket(to - 2 * D, to)).toBe("hour");
    expect(chooseBucket(to - 3 * D, to)).toBe("day");
    expect(chooseBucket(to - 365 * D, to)).toBe("day");
    expect(chooseBucket(to - 900 * D, to)).toBe("month");
  });

  it("lists every local day, empty ones included", () => {
    const from = Date.UTC(2026, 5, 9, 22); // 2026-06-10 00:00 in Rome
    const to = Date.UTC(2026, 5, 12, 10);
    expect(bucketKeys("day", from, to, "Europe/Rome")).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
    expect(bucketKeys("day", from, to, "America/Los_Angeles")).toEqual([
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
    ]);
  });

  it("lists every local hour", () => {
    const from = Date.UTC(2026, 5, 10, 10, 30);
    const to = Date.UTC(2026, 5, 10, 13, 10);
    expect(bucketKeys("hour", from, to, "UTC")).toEqual([
      "2026-06-10T10",
      "2026-06-10T11",
      "2026-06-10T12",
      "2026-06-10T13",
    ]);
    expect(bucketKeys("hour", from, to, "Asia/Kolkata")[0]).toBe("2026-06-10T16");
  });

  it("lists months", () => {
    expect(bucketKeys("month", Date.UTC(2025, 10, 20), Date.UTC(2026, 1, 3), "UTC")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});
