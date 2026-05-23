import { Queue, type JobsOptions } from "bullmq";
import Redis from "ioredis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BandInput {
  name: string;
  bandwidth: number;
}

interface BandConfig {
  name: string;
  bandwidth: number;
  offset: number; // auto-computed, start of range (1-indexed)
}

export interface BandedQueueOptions {
  bands: BandInput[];
  redis: Redis;
}

// ─── BandedQueue ──────────────────────────────────────────────────────────────

/**
 * BandedQueue is a BullMQ Queue abstraction layer for tiered job priority.
 *
 * Each band (tier) gets an exclusive numeric priority range.
 * Jobs within a band are assigned incrementing priorities via Redis INCR,
 * guaranteeing FIFO ordering within a tier.
 *
 * Example with bandwidth=1000:
 *   vip   → priority [1,    1000]
 *   pro   → priority [1001, 2000]
 *   basic → priority [2001, 3000]
 *   free  → priority [3001, 8000]
 *
 * Lower priority number = processed first (BullMQ convention).
 * Band order in config = priority order (first = highest priority).
 */
class BandedQueue<T = unknown> {
  private _queue: Queue<T>;
  private _redis: Redis;
  private _bands: Map<string, BandConfig>;
  private _counterKeyPrefix: string;

  constructor(queue: Queue<T>, options: BandedQueueOptions) {
    this._queue = queue;
    this._redis = options.redis;
    this._bands = BandedQueue.computeBands(options.bands);
    this._counterKeyPrefix = `banded-queue:${queue.name}`;

    this._validate(options.bands);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a job to the queue under a specific band.
   * Priority is auto-assigned based on band range + Redis counter.
   */
  async add(bandName: string, data: T, opts?: JobsOptions): Promise<void> {
    const band = this._bands.get(bandName);
    if (!band) {
      throw new Error(
        `Band "${bandName}" not found. Available bands: ${[...this._bands.keys()].join(", ")}`,
      );
    }

    const priority = await this._nextPriority(band);

    await this._queue.add(
      bandName as Parameters<Queue<T>["add"]>[0],
      data as Parameters<Queue<T>["add"]>[1],
      {
        ...opts,
        priority,
      },
    );
  }

  /**
   * Expose underlying BullMQ Queue for worker/QueueEvents setup.
   */
  getQueue(): Queue<T> {
    return this._queue;
  }

  /**
   * Get computed band configs (useful for debugging/logging).
   */
  getBands(): BandConfig[] {
    return [...this._bands.values()];
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Get next priority number within a band via Redis INCR + wrap.
   *
   * Formula:
   *   raw      = INCR counter          (1, 2, 3, ...)
   *   offset   = (raw - 1) % bandwidth (0-indexed within band)
   *   priority = band.offset + offset
   */
  private async _nextPriority(band: BandConfig): Promise<number> {
    const key = `${this._counterKeyPrefix}:${band.name}`;
    const raw = await this._redis.incr(key);
    const offset = (raw - 1) % band.bandwidth;
    return band.offset + offset;
  }

  /**
   * Auto-compute band offsets from order in config array.
   * First band in array = highest priority (lowest number).
   * Offsets start at 1 (avoid collision with BullMQ default priority 0).
   */
  private static computeBands(inputs: BandInput[]): Map<string, BandConfig> {
    const map = new Map<string, BandConfig>();
    let cursor = 1;

    for (const input of inputs) {
      map.set(input.name, {
        name: input.name,
        bandwidth: input.bandwidth,
        offset: cursor,
      });
      cursor += input.bandwidth;
    }

    return map;
  }

  private _validate(inputs: BandInput[]): void {
    if (inputs.length === 0) {
      throw new Error("BandedQueue requires at least one band.");
    }

    const names = inputs.map((b) => b.name);
    const unique = new Set(names);
    if (unique.size !== names.length) {
      throw new Error("Band names must be unique.");
    }

    for (const band of inputs) {
      if (band.bandwidth < 1) {
        throw new Error(`Band "${band.name}" bandwidth must be >= 1.`);
      }
    }

    // Warn if total range exceeds BullMQ max priority (2^21 - 1 = 2_097_152)
    const totalRange = inputs.reduce((sum, b) => sum + b.bandwidth, 0);
    if (totalRange > 2_097_151) {
      console.warn(
        `[BandedQueue] Total priority range (${totalRange}) exceeds BullMQ max (2_097_151). Reduce bandwidth values.`,
      );
    }
  }
}

export { BandedQueue };
