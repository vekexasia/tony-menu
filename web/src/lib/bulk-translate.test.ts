import { describe, expect, it } from "vitest";
import { runBulkTranslate } from "./bulk-translate";
import { ApiError } from "./api";

function harness() {
  const sleeps: number[] = [];
  const sleep = (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  };
  const progress: Array<{ done: number; success: number; failed: number; status?: string }> = [];
  const onProgress = (p: { done: number; success: number; failed: number; status?: string }) =>
    progress.push({ done: p.done, success: p.success, failed: p.failed, status: p.status });
  return { sleeps, sleep, progress, onProgress };
}

describe("runBulkTranslate", () => {
  it("translates every item, accumulates successes, throttles between items only", async () => {
    const h = harness();
    const written: Array<[string, string]> = [];
    const res = await runBulkTranslate(["a", "b", "c"], {
      translate: async (item) => `${item}-x`,
      onSuccess: (item, text) => written.push([item, text]),
      describe: (item) => item,
      onProgress: h.onProgress,
      inProgressStatus: "in-progress",
      autoPauseStatus: "paused",
      throttleMs: 10,
      sleep: h.sleep,
    });

    expect(res).toEqual({ success: 3, failed: 0 });
    expect(written).toEqual([["a", "a-x"], ["b", "b-x"], ["c", "c-x"]]);
    // throttle fires between items only: 3 items -> 2 sleeps
    expect(h.sleeps).toEqual([10, 10]);
  });

  it("counts empty/null results as failed without writing them", async () => {
    const h = harness();
    const written: string[] = [];
    const res = await runBulkTranslate(["a", "b"], {
      translate: async (item) => (item === "a" ? "" : "ok"),
      onSuccess: (item) => written.push(item),
      describe: (item) => item,
      onProgress: h.onProgress,
      inProgressStatus: "in-progress",
      autoPauseStatus: "paused",
      throttleMs: 1,
      sleep: h.sleep,
    });
    expect(res).toEqual({ success: 1, failed: 1 });
    expect(written).toEqual(["b"]);
  });

  it("on a 429 counts failed, pauses pauseMs, then continues to the next item (no retry)", async () => {
    const h = harness();
    const calls: string[] = [];
    const res = await runBulkTranslate(["a", "b"], {
      translate: async (item) => {
        calls.push(item);
        if (item === "a") throw new ApiError(429, "rate limited");
        return "ok";
      },
      onSuccess: () => {},
      describe: (item) => item,
      onProgress: h.onProgress,
      inProgressStatus: "in-progress",
      autoPauseStatus: "paused",
      throttleMs: 10,
      pauseMs: 60_000,
      sleep: h.sleep,
    });
    expect(res).toEqual({ success: 1, failed: 1 });
    // "a" is attempted once (no retry), then "b"
    expect(calls).toEqual(["a", "b"]);
    // a 60s pause happened, plus one 10ms throttle between the two items
    expect(h.sleeps).toContain(60_000);
    expect(h.sleeps).toContain(10);
    expect(h.progress.some((p) => p.status === "paused")).toBe(true);
  });

  it("does not pause on a non-429 error", async () => {
    const h = harness();
    const res = await runBulkTranslate(["a"], {
      translate: async () => {
        throw new Error("network");
      },
      onSuccess: () => {},
      describe: (item) => item,
      onProgress: h.onProgress,
      inProgressStatus: "in-progress",
      autoPauseStatus: "paused",
      throttleMs: 10,
      pauseMs: 60_000,
      sleep: h.sleep,
    });
    expect(res).toEqual({ success: 0, failed: 1 });
    expect(h.sleeps).toEqual([]); // single item: no throttle, no pause
  });

  it("returns zero counts and never sleeps for an empty work list", async () => {
    const h = harness();
    const res = await runBulkTranslate([], {
      translate: async () => "x",
      onSuccess: () => {},
      describe: () => "",
      onProgress: h.onProgress,
      inProgressStatus: "in-progress",
      autoPauseStatus: "paused",
      sleep: h.sleep,
    });
    expect(res).toEqual({ success: 0, failed: 0 });
    expect(h.sleeps).toEqual([]);
    expect(h.progress).toEqual([]);
  });
});
