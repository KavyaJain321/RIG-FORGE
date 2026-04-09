import { NextResponse } from 'next/server'

import type { ApiResponse } from '@/lib/types'

/**
 * Wraps a successful payload in the standard ApiResponse envelope.
 * All API routes must use this — never call NextResponse.json directly.
 */
export function successResponse<T>(
  data: T,
  status = 200
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = { data, error: null }
  return NextResponse.json(body, { status })
}

/**
 * Wraps an error message in the standard ApiResponse envelope.
 * All API routes must use this — never call NextResponse.json directly.
 */
export function errorResponse(
  message: string,
  status: number
): NextResponse<ApiResponse<never>> {
  const body: ApiResponse<never> = { data: null, error: message }
  return NextResponse.json(body, { status })
}
