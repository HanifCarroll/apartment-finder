function envPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const DEFAULT_CONCURRENCY = envPositiveInteger("OPENAI_MODEL_CONCURRENCY", 10);
export const DEFAULT_LISTING_CONCURRENCY = envPositiveInteger("LISTING_SCAN_CONCURRENCY", 10);

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<() => void> {
    if (active < concurrency) {
      active += 1;
      return release;
    }

    await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    return release;
  }

  function release() {
    active -= 1;
    queue.shift()?.();
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    const releaseSlot = await acquire();
    try {
      return await fn();
    } finally {
      releaseSlot();
    }
  };
}

const limitModelCall = createLimiter(DEFAULT_CONCURRENCY);

export async function withGlobalModelCallSlot<T>(fn: () => Promise<T>): Promise<T> {
  return limitModelCall(fn);
}
