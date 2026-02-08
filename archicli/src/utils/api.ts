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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `HTTP ${res.status}`);
  }

  return data as T;
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

export function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}
