/**
 * Default concurrency settings
 */
export const DEFAULT_REPO_CONCURRENCY = 5;
export const DEFAULT_FILE_CONCURRENCY = 10;

/**
 * Retry configuration
 */
export const DEFAULT_MAX_RETRIES = 3;
export const MAX_BACKOFF_MS = 10000;
export const BASE_BACKOFF_MS = 1000;

/**
 * Directories to skip during filesystem traversal
 */
export const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  '.terraform',
  '.terragrunt-cache',
  'dist',
  'build',
  'target',
  '.vscode',
  '.idea',
  '__pycache__',
  '.DS_Store',
];

/**
 * Log levels for debugging
 */
export const LOG_LEVELS = {
  DEBUG: 3,
  INFO: 2,
  WARN: 1,
  ERROR: 0,
} as const;
