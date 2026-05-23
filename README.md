# banded-queue

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=fff)](https://bun.sh)
[![BullMQ](https://img.shields.io/badge/BullMQ-FF6F00?logo=redis&logoColor=fff)](https://bullmq.io/)
[![Vitest](https://img.shields.io/badge/Vitest-6B9F3A?logo=vitest&logoColor=fff)](https://vitest.dev/)
[![License](https://img.shields.io/github/license/asdfsena/banded-queue)](LICENSE)

Tiered priority queue on BullMQ. Assigns non-overlapping priority ranges (bands) to job tiers. FIFO within tier. Redis INCR counters wrap around when bandwidth exhausted.

## Install

```
bun install
```

Requires Bun runtime.

## Quick start

```typescript
import { BandedQueue } from "banded-queue";
import { Queue } from "bullmq";
import Redis from "ioredis";

const redis = new Redis();
const queue = new Queue("render-jobs", { connection: redis });
const bq = new BandedQueue(queue, {
  bands: [
    { name: "vip", bandwidth: 1000 },
    { name: "pro", bandwidth: 1000 },
    { name: "basic", bandwidth: 1000 },
    { name: "free", bandwidth: 5000 },
  ],
  redis,
});

await bq.add("vip", { userId: 1 }); // priority=1
await bq.add("pro", { userId: 2 }); // priority=1001
```

Bands in array order = priority order. First = highest priority (lowest BullMQ priority number).

## API

| Method     | Signature                                  | Notes                                                                                                                     |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `add`      | `(bandName, data, opts?) => Promise<void>` | Auto-assigns priority. Throws on unknown band. Passes `opts` through (jobId, delay, etc) but always overrides `priority`. |
| `getQueue` | `() => Queue<T>`                           | Underlying BullMQ Queue for worker/QueueEvents setup.                                                                     |
| `getBands` | `() => BandConfig[]`                       | Computed bands with offsets (debug/logging).                                                                              |

## Development

| Command                        | Action                             |
| ------------------------------ | ---------------------------------- |
| `bun test`                     | Run vitest (no config file needed) |
| `npx prettier --write <files>` | Format with Prettier (defaults)    |
| `npx changeset`                | Add versioning entry               |

Pre-commit hook: `bun test` → `prettier --write` on staged files → `git update-index --again`. Tests must pass before commit.

## Runtime dependency

- Redis (via `bullmq` + `ioredis`). Tests mock Redis — no instance needed for development.
- BullMQ max priority: 2,097,151. Warns if total bandwidth exceeds limit.
