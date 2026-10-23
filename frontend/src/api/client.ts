import { isRecord } from '@/api/validation';

export class ApiError extends Error {
  constructor(
    message: string,
    public code = 'request_failed',
  ) {
    super(message);
  }
}

export async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
      throw new ApiError(
        body.error.message,
        typeof body.error.code === 'string' ? body.error.code : 'request_failed',
      );
    }
    throw new ApiError(`The service returned HTTP ${response.status}. Please try again.`);
  }
  return response.json();
}
