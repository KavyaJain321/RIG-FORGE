import type { Server } from 'socket.io'

export function getSocketServer(): Server | null {
  const server = (global as any).__socketServer as Server | undefined
  return server ?? null
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  try {
    const server = getSocketServer()
    if (!server) return
    server.to(`user:${userId}`).emit(event, data)
  } catch {
    // Never throw — REST must remain the source of truth.
  }
}
