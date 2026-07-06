export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  get busy(): boolean {
    return this.pending > 0;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1;
    const run = async () => {
      try {
        return await task();
      } finally {
        this.pending -= 1;
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
