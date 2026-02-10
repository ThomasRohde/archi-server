/**
 * Detect Commander-thrown usage/control-flow errors so command handlers can rethrow
 * them instead of wrapping them as runtime failures.
 */
export function isCommanderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { name?: unknown; code?: unknown };
  if (candidate.name === 'CommanderError') return true;
  if (typeof candidate.code === 'string' && candidate.code.startsWith('commander.')) {
    return true;
  }
  return false;
}
