# @asdfsena/banded-queue

## 0.2.0

### Minor Changes

- 2fdb33f: Initial release. Tiered priority queue wrapper around BullMQ.
  - Define bands (tiers) with non-overlapping priority ranges
  - FIFO ordering within each band via Redis INCR counters
  - Priority wraps within band range when bandwidth exhausted
  - Passes through BullMQ job options (jobId, delay, etc)
  - Validates bands on construction (no empty, no duplicates, bandwidth >= 1)
  - Warns when total range exceeds BullMQ max priority
