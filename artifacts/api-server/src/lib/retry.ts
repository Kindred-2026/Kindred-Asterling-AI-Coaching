import { logger } from "./logger";

/** A failed call to an external provider. Only transient failures are retried. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

/** 429 and 5xx are transient; any other HTTP failure will not fix itself. */
export function providerHttpError(operation: string, status: number): ProviderRequestError {
  return new ProviderRequestError(
    `${operation} failed (${status})`,
    status,
    status === 429 || status >= 500,
  );
}

/** Tests set baseDelayMs to 0; production waits 1s, then 2s. */
export const retryPolicy = { attempts: 3, baseDelayMs: 1_000 };

/**
 * Runs `operation` until it succeeds, a non-retryable ProviderRequestError is
 * thrown, or the attempts run out. Network errors and timeouts are retried.
 */
export async function withRetries<T>(
  operation: () => Promise<T>,
  label: string,
  context: Record<string, unknown> = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      const retryable = err instanceof ProviderRequestError ? err.retryable : true;
      if (!retryable || attempt >= retryPolicy.attempts) throw err;
      logger.warn({ err, attempt, ...context }, `${label} failed; retrying`);
      await new Promise((resolve) =>
        setTimeout(resolve, retryPolicy.baseDelayMs * 2 ** (attempt - 1)),
      );
    }
  }
}
