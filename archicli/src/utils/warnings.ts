const runtimeWarnings: string[] = [];

function normalize(message: string): string {
  return message.trim();
}

/**
 * Reset process-level warning state at the beginning of each CLI invocation.
 */
export function resetWarnings(): void {
  runtimeWarnings.length = 0;
}

/**
 * Register a non-fatal warning so it can be emitted in structured output.
 */
export function addWarning(message: string): void {
  const normalized = normalize(message);
  if (normalized.length === 0) return;
  if (!runtimeWarnings.includes(normalized)) {
    runtimeWarnings.push(normalized);
  }
}

/**
 * Read and clear all currently captured warnings.
 */
export function consumeWarnings(): string[] {
  if (runtimeWarnings.length === 0) return [];
  const current = [...runtimeWarnings];
  runtimeWarnings.length = 0;
  return current;
}
