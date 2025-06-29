/**
 * Logger interface for dependency injection and testability
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Structured log context for better observability
 */
export interface LogContext {
  readonly component?: string;
  readonly operation?: string;
  readonly requestId?: string;
  readonly userId?: string;
  readonly repository?: string;
  readonly platform?: string;
  readonly duration?: number;
  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * Logger interface following dependency injection principles
 */
export interface ILogger {
  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log error message
   */
  error(message: string, context?: LogContext): void;

  /**
   * Log error with stack trace
   */
  errorWithStack(message: string, error: Error, context?: LogContext): void;

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): ILogger;

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean;

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void;
}

/**
 * Logger factory interface for creating loggers
 */
export interface ILoggerFactory {
  /**
   * Create a logger for a specific component
   */
  createLogger(component: string): ILogger;

  /**
   * Get the global logger instance
   */
  getGlobalLogger(): ILogger;

  /**
   * Configure the logging system
   */
  configure(options: LoggerOptions): void;
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  readonly level: LogLevel;
  readonly format?: 'json' | 'text';
  readonly includeTimestamp?: boolean;
  readonly includeLevel?: boolean;
  readonly colorize?: boolean;
  readonly output?: 'console' | 'file' | 'both';
  readonly logFile?: string;
  readonly maxFileSize?: number;
  readonly maxFiles?: number;
}
