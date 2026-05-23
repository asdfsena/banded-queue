import { describe, it, expect, beforeEach, vi } from "vitest";
import { BandedQueue, type BandInput } from ".";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn();
const mockQueue = {
  name: "render-jobs-test",
  add: mockQueueAdd,
} as any;

let redisCounter: Record<string, number> = {};
const mockRedis = {
  incr: vi.fn(async (key: string) => {
    redisCounter[key] = (redisCounter[key] ?? 0) + 1;
    return redisCounter[key];
  }),
} as any;

const DEFAULT_BANDS: BandInput[] = [
  { name: "vip", bandwidth: 1000 },
  { name: "pro", bandwidth: 1000 },
  { name: "basic", bandwidth: 1000 },
  { name: "free", bandwidth: 5000 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueue(bands = DEFAULT_BANDS): BandedQueue {
  return new BandedQueue(mockQueue, { bands, redis: mockRedis });
}

function getLastPriority(): number {
  const lastCall = mockQueueAdd.mock.calls.at(-1);
  return lastCall?.[2]?.priority;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BandedQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisCounter = {};
  });

  // ─── Band offset computation ─────────────────────────────────────────────

  describe("band offset computation", () => {
    it("computes offsets correctly from bandwidth", () => {
      const q = makeQueue();
      const bands = q.getBands();

      expect(bands.find((b) => b.name === "vip")?.offset).toBe(1);
      expect(bands.find((b) => b.name === "pro")?.offset).toBe(1001);
      expect(bands.find((b) => b.name === "basic")?.offset).toBe(2001);
      expect(bands.find((b) => b.name === "free")?.offset).toBe(3001);
    });

    it("first band offset always starts at 1", () => {
      const q = makeQueue([{ name: "only", bandwidth: 500 }]);
      const firstBand = q.getBands()[0];
      if (!firstBand) throw new Error("no first band");
      expect(firstBand.offset).toBe(1);
    });
  });

  // ─── Priority assignment ─────────────────────────────────────────────────

  describe("priority assignment", () => {
    it("first vip job gets priority 1", async () => {
      const q = makeQueue();
      await q.add("vip", {});
      expect(getLastPriority()).toBe(1);
    });

    it("second vip job gets priority 2", async () => {
      const q = makeQueue();
      await q.add("vip", {});
      await q.add("vip", {});
      expect(getLastPriority()).toBe(2);
    });

    it("first pro job gets priority 1001", async () => {
      const q = makeQueue();
      await q.add("pro", {});
      expect(getLastPriority()).toBe(1001);
    });

    it("vip priority always lower than pro", async () => {
      const q = makeQueue();
      await q.add("vip", {});
      const vipPriority = getLastPriority();
      await q.add("pro", {});
      const proPriority = getLastPriority();
      expect(vipPriority).toBeLessThan(proPriority);
    });

    it("band priority ranges do not overlap", async () => {
      const q = makeQueue();
      const bands = q.getBands();

      for (let i = 0; i < bands.length - 1; i++) {
        const current = bands[i];
        if (!current) throw new Error("no current band");
        const next = bands[i + 1];
        if (!next) throw new Error("no next band");
        const currentEnd = current.offset + current.bandwidth - 1;
        expect(currentEnd).toBeLessThan(next.offset);
      }
    });
  });

  // ─── Wrap around ─────────────────────────────────────────────────────────

  describe("wrap around", () => {
    it("wraps back to offset after bandwidth exhausted", async () => {
      const q = makeQueue([{ name: "vip", bandwidth: 2 }]);

      await q.add("vip", {}); // counter=1 → priority 1
      await q.add("vip", {}); // counter=2 → priority 2
      await q.add("vip", {}); // counter=3 → (3-1)%2=0 → priority 1 (wrap)

      const calls: any = mockQueueAdd.mock.calls;
      expect(calls[0][2].priority).toBe(1);
      expect(calls[1][2].priority).toBe(2);
      expect(calls[2][2].priority).toBe(1); // wrapped
    });

    it("wrap stays within band range", async () => {
      const bandwidth = 3;
      const q = makeQueue([{ name: "vip", bandwidth }]);

      for (let i = 0; i < bandwidth * 3; i++) {
        await q.add("vip", {});
        const priority = getLastPriority();
        expect(priority).toBeGreaterThanOrEqual(1);
        expect(priority).toBeLessThanOrEqual(bandwidth);
      }
    });
  });

  // ─── Redis counter key ───────────────────────────────────────────────────

  describe("redis counter key", () => {
    it("uses queue name in counter key", async () => {
      const q = makeQueue();
      await q.add("vip", {});
      expect(mockRedis.incr).toHaveBeenCalledWith(
        "banded-queue:render-jobs-test:vip",
      );
    });

    it("uses separate counter per band", async () => {
      const q = makeQueue();
      await q.add("vip", {});
      await q.add("pro", {});

      const keys = mockRedis.incr.mock.calls.map((c: any) => c[0]);
      expect(keys).toContain("banded-queue:render-jobs-test:vip");
      expect(keys).toContain("banded-queue:render-jobs-test:pro");
    });
  });

  // ─── opts passthrough ────────────────────────────────────────────────────

  describe("opts passthrough", () => {
    it("passes jobId and delay through to queue.add", async () => {
      const q = makeQueue();
      await q.add("vip", { foo: "bar" }, { jobId: "job-1", delay: 5000 });

      const lastCall: any = mockQueueAdd.mock.calls.at(-1);
      expect(lastCall[2].jobId).toBe("job-1");
      expect(lastCall[2].delay).toBe(5000);
    });

    it("priority from BandedQueue overrides any priority in opts", async () => {
      const q = makeQueue();
      await q.add("free", {}, { priority: 1 }); // tries to override with 1
      // free band offset = 3001, so priority should be >= 3001
      expect(getLastPriority()).toBeGreaterThanOrEqual(3001);
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  describe("validation", () => {
    it("throws on empty bands array", () => {
      expect(() => makeQueue([])).toThrow("at least one band");
    });

    it("throws on duplicate band names", () => {
      expect(() =>
        makeQueue([
          { name: "vip", bandwidth: 1000 },
          { name: "vip", bandwidth: 500 },
        ]),
      ).toThrow("unique");
    });

    it("throws on bandwidth < 1", () => {
      expect(() => makeQueue([{ name: "vip", bandwidth: 0 }])).toThrow(
        "bandwidth must be >= 1",
      );
    });

    it("throws on unknown band name in add()", async () => {
      const q = makeQueue();
      await expect(q.add("unknown", {})).rejects.toThrow(
        'Band "unknown" not found',
      );
    });

    it("warns when total range exceeds BullMQ max", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      makeQueue([{ name: "vip", bandwidth: 2_097_152 }]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("exceeds BullMQ max"),
      );
      consoleSpy.mockRestore();
    });
  });

  // ─── getQueue ────────────────────────────────────────────────────────────

  describe("getQueue()", () => {
    it("returns underlying queue", () => {
      const q = makeQueue();
      expect(q.getQueue()).toBe(mockQueue);
    });
  });
});
