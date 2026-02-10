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

/** Maximum retries on HTTP 429 during polling. */
const MAX_POLL_429_RETRIES = 5;
/** Default backoff when no Retry-After header (seconds). */
const DEFAULT_RETRY_AFTER_S = 5;

function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_S * 1000;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) return Math.ceil(seconds) * 1000;
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : 1000;
  }
  return DEFAULT_RETRY_AFTER_S * 1000;
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

    let res: Response;
    let retried429 = false;
    for (let r429 = 0; r429 < MAX_POLL_429_RETRIES; r429++) {
      res = await fetch(url);
      if (res.status === 429 && r429 < MAX_POLL_429_RETRIES - 1) {
        const retryMs = parseRetryAfter(res.headers.get('Retry-After'));
        process.stderr.write(
          `  [429] Rate limited during poll, retrying in ${Math.ceil(retryMs / 1000)}s...\n`
        );
        await sleep(retryMs);
        retried429 = true;
        continue;
      }
      break;
    }

    if (!res!.ok) {
      throw new Error(`Poll request failed: HTTP ${res!.status}`);
    }
    const body = (await res!.json()) as OperationStatus;
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
