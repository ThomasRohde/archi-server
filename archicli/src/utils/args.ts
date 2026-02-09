export class ArgumentValidationError extends Error {
  readonly code = 'INVALID_ARGUMENT';

  constructor(message: string) {
    super(message);
    this.name = 'ArgumentValidationError';
  }
}

const STRICT_INT_RE = /^-?\d+$/;

function parseStrictInteger(raw: string, optionName: string): number {
  if (!STRICT_INT_RE.test(raw.trim())) {
    throw new ArgumentValidationError(`${optionName} must be an integer, got '${raw}'`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ArgumentValidationError(`${optionName} must be a safe integer, got '${raw}'`);
  }

  return value;
}

function parseStrictNumber(raw: string, optionName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ArgumentValidationError(`${optionName} must be a number, got '${raw}'`);
  }
  return value;
}

export function parsePositiveInt(raw: string, optionName: string): number {
  const value = parseStrictInteger(raw, optionName);
  if (value < 1) {
    throw new ArgumentValidationError(`${optionName} must be a positive integer, got '${raw}'`);
  }
  return value;
}

export function parseNonNegativeInt(raw: string, optionName: string): number {
  const value = parseStrictInteger(raw, optionName);
  if (value < 0) {
    throw new ArgumentValidationError(`${optionName} must be a non-negative integer, got '${raw}'`);
  }
  return value;
}

export function parseBoundedFloat(
  raw: string,
  optionName: string,
  min: number,
  max: number
): number {
  const value = parseStrictNumber(raw, optionName);
  if (value < min || value > max) {
    throw new ArgumentValidationError(`${optionName} must be between ${min} and ${max}, got '${raw}'`);
  }
  return value;
}
