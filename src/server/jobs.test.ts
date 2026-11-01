import { describe, expect, it, vi } from "vitest";
import { runJobs } from "./jobs";

describe("runJobs", () => {
  it("runs every job even when an earlier one fails, and logs the failure", async () => {
    const calls: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await runJobs([
      { name: "first", run: async () => { calls.push("first"); throw new Error("boom"); } },
      { name: "second", run: async () => { calls.push("second"); } },
      { name: "third", run: () => { calls.push("third"); throw new Error("sync boom"); } },
      { name: "fourth", run: async () => { calls.push("fourth"); } },
    ]);
    expect(calls).toEqual(["first", "second", "third", "fourth"]);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
