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

function formatTable(rows: Record<string, unknown>[], indent = ''): string {
  if (rows.length === 0) return `${indent}(empty)`;
  const keys = Object.keys(rows[0]);

  // Helper to convert cell values to strings, handling objects/arrays
  const cellToString = (val: unknown, maxWidth = 80): string => {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return `<array[${val.length}]>`;
    if (typeof val === 'object') return '<object>';

    const str = String(val);
    if (str.length > maxWidth) {
      return str.substring(0, maxWidth - 3) + '...';
    }
    return str;
  };

  const maxWidth = 80;
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => cellToString(r[k], maxWidth).length))
  );
  const header = keys.map((k, i) => k.toUpperCase().padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) =>
    keys.map((k, i) => cellToString(r[k], maxWidth).padEnd(widths[i])).join('  ')
  );
  return [indent + header, indent + sep, ...body.map((b) => indent + b)].join('\n');
}

function formatText(data: unknown, indent = ''): string {
  if (data === undefined || data === null) return '';
  if (typeof data !== 'object') return String(data);
  if (Array.isArray(data)) {
    if (data.length === 0) return `${indent}(empty)`;
    if (typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return formatTable(data as Record<string, unknown>[], indent);
    }
    return data.map((v) => `${indent}- ${v}`).join('\n');
  }
  const obj = data as Record<string, unknown>;
  return Object.entries(obj)
    .map(([k, v]) => {
      if (v === null || typeof v !== 'object') return `${indent}${k}: ${v}`;
      if (Array.isArray(v)) {
        if (v.length === 0) return `${indent}${k}: (empty)`;
        if (typeof v[0] === 'object' && v[0] !== null && !Array.isArray(v[0])) {
          return `${indent}${k}:\n${formatTable(v as Record<string, unknown>[], indent + '  ')}`;
        }
        return `${indent}${k}:\n${v.map((item) => `${indent}  - ${item}`).join('\n')}`;
      }
      return `${indent}${k}:\n${formatText(v, indent + '  ')}`;
    })
    .join('\n');
}

export function printRaw(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
