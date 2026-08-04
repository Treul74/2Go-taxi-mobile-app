/**
 * Generic retry helper for transient InsForge/network failures. See
 * audit_export/audit_04-08-26_07-37_insforge-start-trip-timeout.md — the
 * InsForge SDK does not retry its own client-side 30s AbortController
 * timeout, and none of this app's InsForge service functions throw (they
 * resolve to `{ ..., errorMessage }`, since postgrest-js swallows fetch
 * rejections into that shape unless `.throwOnError()` is used — see
 * @supabase/postgrest-js's PostgrestBuilder.then()). `withRetry` covers both
 * cases: a thrown error, or a resolved value the caller flags as transient
 * via `isRetryable`.
 *
 * Only retries failures that look transient (timeout, dropped connection,
 * abort, network unreachable). Auth/permission/not-found/validation/business
 * failures are left alone by default — they only retry if a caller's
 * `isRetryable` predicate explicitly says so.
 */

// Matches the exact strings this app's error paths produce, e.g.
// "InsForgeError: Request timed out after 30000ms" (SDK timeout),
// "FetchError: request to ... failed, reason: socket hang up" / "ECONNRESET"
// (dropped connection), "AbortError: ..." (caller-initiated cancellation).
const TRANSIENT_MESSAGE_PATTERN =
  /timed?\s?out|ECONNRESET|socket hang up|network request failed|network[\s-]?(unavailable|unreachable|error)|failed to fetch|\babort/i;

export function isTransientFailureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return TRANSIENT_MESSAGE_PATTERN.test(message);
}

function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string };
  if (err.name === 'AbortError') return true;
  return isTransientFailureMessage(err.message);
}

export interface RetryAttemptInfo {
  /** The attempt about to run (2, 3, ... — the first try is attempt 1 and never reported here). */
  attempt: number;
  /** Total attempts allowed, including the first try. */
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

export interface RetryOptions<T> {
  /** Retries after the first attempt. Total attempts = maxRetries + 1. Default 2. */
  maxRetries?: number;
  /** Base delay for exponential backoff. Default 500ms. */
  baseDelayMs?: number;
  /** Backoff ceiling. Default 4000ms. */
  maxDelayMs?: number;
  /**
   * Inspects a *resolved* value to decide whether it represents a transient
   * failure worth retrying (needed for this codebase's `{ errorMessage }`
   * service functions, which resolve rather than throw). Thrown errors are
   * always classified internally and don't need this.
   */
  isRetryable?: (result: T) => boolean;
  /** Label used in dev-only log lines, e.g. "Trip Start". */
  label?: string;
  /** Called before each retry (not on the first attempt). */
  onRetry?: (info: RetryAttemptInfo) => void;
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function devLog(...args: unknown[]) {
  if (__DEV__) {
    console.log('[withRetry]', ...args);
  }
}

/**
 * Runs `operation`, retrying with exponential backoff on transient failures
 * only. Non-transient failures (thrown or resolved) are returned/rethrown
 * immediately on the first attempt.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions<T> = {}): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    maxDelayMs = 4000,
    isRetryable,
    label = 'request',
    onRetry,
  } = options;

  const maxAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    devLog(`${label}: attempt ${attempt} of ${maxAttempts}`);
    try {
      const result = await operation();
      const transient = isRetryable?.(result) ?? false;

      if (!transient) {
        if (attempt > 1) devLog(`${label}: succeeded on attempt ${attempt}`);
        return result;
      }
      if (attempt === maxAttempts) {
        devLog(`${label}: still failing after ${maxAttempts} attempts, giving up`);
        return result;
      }

      const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      devLog(`${label}: transient failure on attempt ${attempt}, retrying in ${delayMs}ms`);
      onRetry?.({ attempt: attempt + 1, maxAttempts, delayMs, reason: 'transient-result' });
      await sleep(delayMs);
    } catch (error) {
      const transient = isTransientError(error);
      if (!transient || attempt === maxAttempts) {
        devLog(
          `${label}: ${attempt === maxAttempts ? 'exhausted attempts' : 'non-transient error'} — rethrowing`,
          error
        );
        throw error;
      }

      const reason = error instanceof Error ? error.message : String(error);
      const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      devLog(`${label}: transient error on attempt ${attempt} (${reason}), retrying in ${delayMs}ms`);
      onRetry?.({ attempt: attempt + 1, maxAttempts, delayMs, reason });
      await sleep(delayMs);
    }
  }

  // Unreachable — the loop always returns or throws by the last iteration.
  throw new Error(`${label}: retry loop exited unexpectedly`);
}
