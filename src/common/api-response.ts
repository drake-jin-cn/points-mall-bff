export interface ApiResponse<T = null> {
  code: string;
  message: string;
  data: T;
  traceId?: string;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { code: 'OK', message: 'success', data };
}

export function err(code: string, message: string, traceId: string): ApiResponse<null> {
  return { code, message, data: null, traceId };
}
