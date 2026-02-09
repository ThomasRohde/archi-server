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
      const code = response.error?.code ?? 'UNKNOWN';
      const message = response.error?.message ?? 'Unknown error';
      console.error(`Error [${code}]: ${message}`);
      const detailsText = formatErrorDetails(response.error?.details);
      if (detailsText) {
        console.error(detailsText);
      }
    }
  }
}

function formatTable(rows: Record<string, unknown>[], indent = ''): string {
  if (rows.length === 0) return `${indent}(empty)`;
  const keys = Object.keys(rows[0]);

  const columnLimitFor = (key: string): number => {
    const lower = key.toLowerCase();
    const numericColumn = rows.every((row) =>
      row[key] === null || row[key] === undefined || typeof row[key] === 'number'
    );
    if (numericColumn) return 7;
    if (lower === 'id' || lower.endsWith('id') || lower.includes('id')) return 14;
    if (lower.endsWith('type') || lower === 'type') return 24;
    if (lower.includes('name')) return 24;
    if (lower.includes('documentation') || lower.includes('message') || lower.includes('hint')) {
      return 36;
    }
    return 20;
  };

  const truncate = (str: string, key: string, maxWidth: number): string => {
    if (str.length <= maxWidth) return str;
    const lower = key.toLowerCase();
    if ((lower === 'id' || lower.endsWith('id') || lower.includes('id')) && maxWidth >= 8) {
      return str.slice(0, maxWidth - 2) + '..';
    }
    return str.slice(0, maxWidth - 3) + '...';
  };

  // Helper to convert cell values to strings, handling objects/arrays
  const cellToString = (val: unknown, key: string): string => {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return `<array[${val.length}]>`;
    if (typeof val === 'object') return '<object>';

    return truncate(String(val), key, columnLimitFor(key));
  };

  const widths = keys.map((k) =>
    Math.max(
      Math.min(k.length, columnLimitFor(k)),
      ...rows.map((r) => cellToString(r[k], k).length)
    )
  );
  const header = keys
    .map((k, i) => truncate(k.toUpperCase(), k, widths[i]).padEnd(widths[i]))
    .join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) =>
    keys.map((k, i) => cellToString(r[k], k).padEnd(widths[i])).join('  ')
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

function formatErrorDetails(details: unknown, indent = '  '): string {
  if (details === null || details === undefined) return '';

  const formatPathErrors = (rows: Array<{ path?: unknown; message?: unknown; hint?: unknown }>): string => {
    return rows
      .map((row) => {
        const path = typeof row.path === 'string' && row.path.length > 0 ? row.path : '(unknown path)';
        const message =
          typeof row.message === 'string' && row.message.length > 0
            ? row.message
            : 'validation error';
        const hint = typeof row.hint === 'string' && row.hint.length > 0 ? row.hint : null;
        return hint
          ? `${indent}${path}: ${message}\n${indent}  Hint: ${hint}`
          : `${indent}${path}: ${message}`;
      })
      .join('\n');
  };

  if (Array.isArray(details)) {
    if (details.length === 0) return '';
    const pathErrors = details.filter(
      (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
    ) as Array<{ path?: unknown; message?: unknown; hint?: unknown }>;
    if (pathErrors.length === details.length) {
      return formatPathErrors(pathErrors);
    }
    return `${indent}details:\n${formatText(details, indent + '  ')}`;
  }

  if (typeof details === 'object') {
    const record = details as Record<string, unknown>;
    const detailLines: string[] = [];

    for (const [key, value] of Object.entries(record)) {
      if (key === 'errors' && Array.isArray(value)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        detailLines.push(`${indent}${key}:`);
        detailLines.push(formatText(value, indent + '  '));
      } else {
        detailLines.push(`${indent}${key}: ${value}`);
      }
    }

    if (Array.isArray(record.errors) && record.errors.length > 0) {
      const pathErrors = record.errors.filter(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
      ) as Array<{ path?: unknown; message?: unknown; hint?: unknown }>;
      if (pathErrors.length > 0) {
        detailLines.push(`${indent}errors:`);
        detailLines.push(formatPathErrors(pathErrors));
      } else {
        detailLines.push(`${indent}errors:`);
        detailLines.push(formatText(record.errors, indent + '  '));
      }
    }

    return detailLines.join('\n');
  }

  return `${indent}${String(details)}`;
}

export function printRaw(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
