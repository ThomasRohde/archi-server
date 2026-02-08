import { getConfig } from './config';

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onProgress?: (status: string, attempt: number) => void;
}

export interface OperationErrorDetails {
  message?: string;
  opIndex?: number;
  opNumber?: number;
  path?: string;
  op?: string;
  field?: string;
  reference?: string;
  hint?: string;
  change?: Record<string, unknown>;
}

export interface OperationStatus {
  operationId: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  result?: unknown[];
  error?: string;
  errorDetails?: OperationErrorDetails | null;
  message?: string;
  durationMs?: number;
}

export async function pollUntilDone(
  operationId: string,
  options: PollOptions = {}
): Promise<OperationStatus> {
  const { intervalMs = 500, timeoutMs = 60_000, onProgress } = options;
  const config = getConfig();
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    const url = `${config.baseUrl}/ops/status?opId=${encodeURIComponent(operationId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Poll request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as OperationStatus;
    onProgress?.(body.status, attempt);

    if (body.status === 'complete' || body.status === 'error') {
      return body;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timeout: operation ${operationId} did not complete within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
