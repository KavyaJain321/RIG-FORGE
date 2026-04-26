/**
 * Fetch wrapper that auto-retries on transient server errors.
 *
 * Why: on Render free tier, the dyno occasionally cycles and Prisma's
 * connection pool ends up holding stale connections. The first request
 * after that returns 500 in ~5–10s, then subsequent requests succeed.
 * This wrapper hides that blip from the end user by silently retrying
 * once after a short delay.
 */

const RETRYABLE_STATUS = new Set([500, 502, 503, 504])

export interface FetchWithRetryOptions extends RequestInit {
  /** Number of additional attempts after the first one. Default 1. */
  retries?: number
  /** Delay between attempts, in milliseconds. Default 2000ms. */
  retryDelayMs?: number
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { retries = 1, retryDelayMs = 2000, ...init } = options

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      // 4xx (including 401) is a real client outcome — don't retry.
      // 5xx is potentially transient — retry once if we have budget.
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
      return res
    } catch (err) {
      // Network-level failure (offline, DNS, TLS) — treat as retryable.
      lastError = err
      if (attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
    }
  }

  // Exhausted retries — surface the original error so the caller can
  // show a message. If the last attempt threw, rethrow it; otherwise
  // we shouldn't reach here because the loop would have returned.
  throw lastError ?? new Error('fetchWithRetry: exhausted retries with no response')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
