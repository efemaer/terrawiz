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
 * API Configuration Constants
 */
export const API_DEFAULTS = {
  GITHUB_PER_PAGE: 100,
  GITLAB_MAX_PAGES: 10,
  GITLAB_PER_PAGE: 100,
  REQUEST_TIMEOUT: 30000,
} as const;

/**
 * File Extension Constants
 */
export const FILE_EXTENSIONS = {
  TERRAFORM: ['.tf', '.tfvars'],
  TERRAGRUNT: ['.hcl'],
  TERRAFORM_LOCK: '.terraform.lock.hcl',
} as const;

/**
 * Progress Reporting Thresholds
 */
export const PROGRESS_THRESHOLDS = {
  LARGE_FILE_SET: 10,
  PROGRESS_INTERVAL: 10,
} as const;

/**
 * VCS Platform Constants
 */
export const VCS_CONSTANTS = {
  GITHUB_API_VERSION: '2022-11-28',
  GITLAB_API_VERSION: 'v4',
  DEFAULT_BRANCH_NAMES: ['main', 'master', 'develop'],
} as const;

/**
 * Log levels for debugging
 */
export const LOG_LEVELS = {
  DEBUG: 3,
  INFO: 2,
  WARN: 1,
  ERROR: 0,
} as const;
