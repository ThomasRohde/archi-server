import { getConfig } from './config';

export interface CLIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    durationMs?: number;
  };
}

export function success<T>(data: T, durationMs?: number): CLIResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
  };
}

export function failure(code: string, message: string, details?: unknown): CLIResponse {
  return {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    metadata: { timestamp: new Date().toISOString() },
  };
}

export function print(response: CLIResponse): void {
  const config = getConfig();
  if (config.output === 'json') {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      console.log(formatText(response.data));
    } else {
      console.error(`Error [${response.error?.code}]: ${response.error?.message}`);
    }
  }
}

function formatText(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);
  return JSON.stringify(data, null, 2);
}

export function printRaw(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
