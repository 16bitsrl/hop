import { describe, expect, it } from "vitest";
import { checkDatabase, healthReport } from "./health";
import type { DB } from "../platform/types";

describe("healthReport", () => {
  it("is 200 when the database answers", () => {
    expect(healthReport(true)).toEqual({ status: 200, body: { ok: true, db: true } });
  });
  it("is 503 when it does not", () => {
    expect(healthReport(false)).toEqual({ status: 503, body: { ok: false, db: false } });
  });
});

describe("checkDatabase", () => {
  it("is true when the query returns a row", async () => {
    expect(await checkDatabase({ all: async () => [{ ok: 1 }] } as unknown as DB)).toBe(true);
  });
  it("is false when the query throws", async () => {
    expect(
      await checkDatabase({
        all: async () => {
          throw new Error("down");
        },
      } as unknown as DB),
    ).toBe(false);
  });
  it("is false when the query hangs", async () => {
    expect(await checkDatabase({ all: () => new Promise(() => {}) } as unknown as DB, 20)).toBe(false);
  });
});
