import { PrismaClient } from '@prisma/client'

/**
 * Prisma error codes that indicate the underlying connection went bad
 * (typical when Render's dyno cycles and the pgbouncer pool ends up
 * with stale TCP connections to Supabase). When we hit one of these,
 * we drop the pool, wait a moment, and retry the operation once.
 */
const RETRYABLE_CODES = new Set<string>([
  'P1001', // Can't reach database server
  'P1002', // Database server connection timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
])

const RETRY_DELAY_MS = 500

function makePrisma() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

  return base.$extends({
    name: 'auto-retry-on-stale-connection',
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args)
        } catch (err) {
          const e = err as { code?: string; name?: string }
          const isInitError = e?.name === 'PrismaClientInitializationError'
          const code = typeof e?.code === 'string' ? e.code : undefined
          const isRetryable = isInitError || (code !== undefined && RETRYABLE_CODES.has(code))

          if (!isRetryable) throw err

          // Drop the stale pool and retry once. Prisma reconnects lazily
          // on the next query, so the retry will use fresh connections.
          try {
            await base.$disconnect()
          } catch {
            // ignore — disconnect can race during shutdown, never fatal
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

          if (process.env.NODE_ENV === 'production') {
            console.warn(
              `[prisma] retried operation after ${code ?? e?.name ?? 'unknown error'} (non-fatal)`,
            )
          }

          return query(args)
        }
      },
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makePrisma> | undefined
}

export const prisma = globalForPrisma.prisma ?? makePrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
