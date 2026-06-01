// Bounds how many expensive operations run at once, with a bounded wait queue.
// BNancy is a single process (CLAUDE.md keeps it single-instance so the in-process
// mutex can serialize money mutations), so an unbounded burst of CPU-heavy ffmpeg
// renders could starve the deposit watcher and Safe/pool work. This caps that.
//
// acquire() resolves true once a slot is held (run, then release() in a finally);
// it resolves false when both the active slots and the queue are full, so the
// caller can back off instead of piling up unbounded work.
export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number
  ) {}

  async acquire(): Promise<boolean> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return true;
    }
    if (this.waiters.length >= this.maxQueued) return false;
    // A release() hands the slot directly to us (active is not decremented and
    // re-incremented), which prevents a fresh acquire() from racing in between.
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return true;
  }

  release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) {
      next(); // pass the held slot to the next waiter; active unchanged
    } else if (this.active > 0) {
      this.active--;
    }
  }
}
