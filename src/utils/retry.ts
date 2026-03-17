export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs } = options;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw error;
      }
      const backoff =
        baseDelayMs * 2 ** (attempt - 1) +
        Math.floor(Math.random() * (baseDelayMs / 2));
      // eslint-disable-next-line no-console
      console.warn(
        `Retry attempt ${attempt}/${maxAttempts} after error: ${
          (error as Error).message
        }`,
      );
      await sleep(backoff);
    }
  }
}
