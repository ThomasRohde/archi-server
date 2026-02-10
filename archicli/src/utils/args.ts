/**
 * Normalized validation error used by option parsers so callers can consistently
 * map bad user input to CLI exit code 1 with structured output.
 */
export class ArgumentValidationError extends Error {
  readonly code = 'INVALID_ARGUMENT';

  constructor(message: string) {
    super(message);
    this.name = 'ArgumentValidationError';
  }
}

const STRICT_INT_RE = /^-?\d+$/;

/**
 * Parse an integer without accepting loose numeric formats such as "1.2" or "1e3".
 */
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

/**
 * Parse any finite numeric value (including decimals) and reject NaN/Infinity.
 */
function parseStrictNumber(raw: string, optionName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ArgumentValidationError(`${optionName} must be a number, got '${raw}'`);
  }
  return value;
}

/**
 * Parse and validate a strictly positive integer option.
 */
export function parsePositiveInt(raw: string, optionName: string): number {
  const value = parseStrictInteger(raw, optionName);
  if (value < 1) {
    throw new ArgumentValidationError(`${optionName} must be a positive integer, got '${raw}'`);
  }
  return value;
}

/**
 * Parse and validate a non-negative integer option.
 */
export function parseNonNegativeInt(raw: string, optionName: string): number {
  const value = parseStrictInteger(raw, optionName);
  if (value < 0) {
    throw new ArgumentValidationError(`${optionName} must be a non-negative integer, got '${raw}'`);
  }
  return value;
}

/**
 * Parse and validate a bounded floating-point option.
 */
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
