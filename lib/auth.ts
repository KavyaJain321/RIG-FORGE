import { type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const COOKIE_NAME = 'forge-token'

const BCRYPT_ROUNDS = 12

export interface TokenPayload {
  userId: string
  email: string
  role: string
  isOnboarding: boolean
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured')
  }
  return secret
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: TokenPayload): string | null {
  try {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
  } catch {
    return null
  }
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'userId' in decoded &&
      'email' in decoded &&
      'role' in decoded
    ) {
      return decoded as TokenPayload
    }
    return null
  } catch {
    return null
  }
}

export function getTokenFromCookies(request: NextRequest): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null
}
