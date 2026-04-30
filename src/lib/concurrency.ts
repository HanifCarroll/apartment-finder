function envPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const DEFAULT_CONCURRENCY = envPositiveInteger("OPENAI_MODEL_CONCURRENCY", 25);
export const DEFAULT_LISTING_CONCURRENCY = envPositiveInteger("LISTING_SCAN_CONCURRENCY", 20);
export const DEFAULT_MODEL_CALLS_PER_MINUTE = envPositiveInteger("OPENAI_MODEL_CALLS_PER_MINUTE", 240);

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPacer(callsPerMinute: number) {
  const intervalMs = Math.ceil(60_000 / callsPerMinute);
  let nextStartAt = 0;
  let chain = Promise.resolve();

  return async function pace(): Promise<void> {
    chain = chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, nextStartAt - now);
      nextStartAt = Math.max(now, nextStartAt) + intervalMs;
      if (waitMs > 0) await delay(waitMs);
    });
    return chain;
  };
}

const limitModelCall = createLimiter(DEFAULT_CONCURRENCY);
const paceModelCall = createPacer(DEFAULT_MODEL_CALLS_PER_MINUTE);

export async function withGlobalModelCallSlot<T>(fn: () => Promise<T>): Promise<T> {
  return limitModelCall(async () => {
    await paceModelCall();
    return fn();
  });
}
