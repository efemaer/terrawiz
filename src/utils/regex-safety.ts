import safeRegex from 'safe-regex';

const DEFAULT_MAX_REGEX_PATTERN_LENGTH = 256;

/**
 * Best-effort validation to prevent catastrophic backtracking patterns.
 */
export function isSafeRegexPattern(
  pattern: string,
  maxLength: number = DEFAULT_MAX_REGEX_PATTERN_LENGTH
): boolean {
  if (!pattern || pattern.length > maxLength) {
    return false;
  }

  try {
    return safeRegex(pattern);
  } catch {
    return false;
  }
}
