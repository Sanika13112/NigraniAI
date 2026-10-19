/**
 * Central HTTP client.
 * - Access token kept in memory only; the refresh token is an HttpOnly cookie set by the server.
 * - One silent refresh + retry on 401.
 * - Timeouts, bounded retries for safe (GET) requests, X-Trace-Id for request correlation.
 * - Failures are always surfaced as ApiError; nothing is ever replaced with fake data.
 */

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiError extends Error {
  status: number;
  details: string[];
  traceId: string | null;
  constructor(status: number, message: string, details: string[] = [], traceId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.traceId = traceId;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Registered by AuthContext: obtains a new access token or returns null when the session ended. */
export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Retries are only ever applied to GET requests. */
  retries?: number;
  /** Set false for auth endpoints so a 401 does not trigger a refresh loop. */
  authRetry?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function parseError(res: Response): Promise<ApiError> {
  const traceId = res.headers.get('X-Trace-Id');
  let message = '';
  let details: string[] = [];
  try {
    const data = await res.json();
    message = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : '';
    if (Array.isArray(data?.details)) details = data.details.filter((d: unknown) => typeof d === 'string');
  } catch {
    /* non-JSON error body */
  }
  if (!message) {
    message =
      res.status === 401
        ? 'Please sign in to continue.'
        : res.status === 403
          ? 'You do not have permission to do that.'
          : res.status === 404
            ? 'We could not find what you were looking for.'
            : res.status === 429
              ? 'Too many attempts. Please wait a moment and try again.'
              : res.status >= 500
                ? 'Something went wrong on our side. Please try again.'
                : 'The request could not be completed.';
  }
  return new ApiError(res.status, message, details, traceId ?? res.headers.get('x-trace-id'));
}

async function refreshOnce(): Promise<string | null> {
  if (!refreshHandler) return null;
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const maxRetries = method === 'GET' ? (options.retries ?? 2) : 0;
  let attempt = 0;
  let refreshed = false;

  for (;;) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    const headers: Record<string, string> = { Accept: 'application/json', 'X-Trace-Id': newId() };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (options.signal?.aborted) throw new ApiError(0, 'Request cancelled');
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(400 * 3 ** (attempt - 1));
        continue;
      }
      const timedOut = (err as Error)?.name === 'AbortError';
      throw new ApiError(
        0,
        timedOut
          ? 'The server took too long to respond. Please try again.'
          : "Can't reach ShopSmart right now. Check your connection and try again.",
      );
    }
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);

    if (res.status === 401 && options.authRetry !== false && !refreshed && refreshHandler) {
      refreshed = true;
      const token = await refreshOnce();
      if (token) continue;
    }

    if (!res.ok) {
      if ([502, 503, 504].includes(res.status) && attempt < maxRetries) {
        attempt += 1;
        await sleep(400 * 3 ** (attempt - 1));
        continue;
      }
      throw await parseError(res);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'The server sent a response we could not read.');
    }
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
