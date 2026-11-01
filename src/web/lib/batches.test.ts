import { describe, expect, it } from "vitest";
import { inBatches } from "./batches";

describe("inBatches", () => {
  it("cuts a list into pieces of at most the given size", () => {
    expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inBatches([], 2)).toEqual([]);
    expect(inBatches(Array.from({ length: 51 }, (_, i) => i)).map((b) => b.length)).toEqual([25, 25, 1]);
  });
});
