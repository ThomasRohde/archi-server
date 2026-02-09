export function isCommanderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { name?: unknown; code?: unknown };
  if (candidate.name === 'CommanderError') return true;
  if (typeof candidate.code === 'string' && candidate.code.startsWith('commander.')) {
    return true;
  }
  return false;
}
