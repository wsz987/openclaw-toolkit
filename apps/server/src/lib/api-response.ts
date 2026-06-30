import { NextResponse } from 'next/server';

export type ApiEnvelope<T> = {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
};

export function apiSuccess<T>(data: T, message = 'OK', init?: ResponseInit) {
  return NextResponse.json<ApiEnvelope<T>>({
    success: true,
    code: 'OK',
    message,
    data
  }, init);
}

export function apiError(code: string, message: string, status = 400, data: unknown = null) {
  return NextResponse.json<ApiEnvelope<unknown>>({
    success: false,
    code,
    message,
    data
  }, { status });
}
