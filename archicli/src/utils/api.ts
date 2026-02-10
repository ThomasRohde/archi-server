import { getConfig } from './config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Maximum retries on HTTP 429 (Too Many Requests). */
const MAX_429_RETRIES = 5;
/** Default backoff when no Retry-After header (seconds). */
const DEFAULT_RETRY_AFTER_S = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse Retry-After header value to milliseconds.
 * Supports both seconds (integer) and HTTP-date formats.
 */
function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_S * 1000;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) return Math.ceil(seconds) * 1000;
  // Try as HTTP-date
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : 1000;
  }
  return DEFAULT_RETRY_AFTER_S * 1000;
}

/**
 * Shared HTTP request wrapper with verbose logging, JSON parsing, and 429 retry policy.
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  if (config.verbose) {
    const out = process.stdout.isTTY ? process.stdout : process.stderr;
    out.write(`[${method}] ${url}\n`);
    if (body) out.write(JSON.stringify(body, null, 2) + '\n');
  }

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new Error(
        `Could not connect to server at ${config.baseUrl}. Is the Archi Model API Server running? (${err})`
      );
    }

    // Auto-retry on 429 with backoff
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const retryMs = parseRetryAfter(res.headers.get('Retry-After'));
      process.stderr.write(
        `  [429] Rate limited on ${method} ${path}, retrying in ${Math.ceil(retryMs / 1000)}s (attempt ${attempt + 1}/${MAX_429_RETRIES})...\n`
      );
      await sleep(retryMs);
      continue;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } })?.error;
      throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `HTTP ${res.status}`);
    }

    return data as T;
  }

  // Should not reach here, but TypeScript needs a return
  throw new ApiError(429, 'TooManyRequests', `Rate limited after ${MAX_429_RETRIES} retries on ${method} ${path}`);
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}
