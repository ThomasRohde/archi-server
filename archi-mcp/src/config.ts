export interface AppConfig {
  apiBaseUrl: string;
  requestTimeoutMs: number;
}

function readNumberEnv(name: string, fallback: number, min: number, max?: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  if (value < min) {
    return fallback;
  }

  if (max !== undefined && value > max) {
    return fallback;
  }

  return value;
}

export function loadConfig(): AppConfig {
  const apiBaseUrl = process.env.ARCHI_API_BASE_URL?.trim() || 'http://127.0.0.1:8765';

  return {
    apiBaseUrl,
    requestTimeoutMs: readNumberEnv('ARCHI_API_TIMEOUT_MS', 30000, 1000, 120000),
  };
}
