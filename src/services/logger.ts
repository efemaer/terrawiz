/**
 * Log levels in order of increasing verbosity
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Configuration options for the logger
 */
export interface LoggerOptions {
  /** Log level threshold - messages below this level will not be shown */
  level: LogLevel;
  /** Component name to include in log messages */
  component?: string;
  /** Optional prefixes for each log level */
  prefixes?: Record<LogLevel, string>;
  /** Whether to include timestamps in log messages */
  timestamps?: boolean;
}

/**
 * Centralized logger for application-wide consistent logging
 */
export class Logger {
  private static instance: Logger;
  private level: LogLevel;
  private component: string;
  private prefixes: Record<LogLevel, string>;
  private useTimestamps: boolean;

  /**
   * Create a new Logger instance
   * @param options Logger configuration options
   */
  private constructor(options: LoggerOptions) {
    this.level = options.level;
    this.component = options.component || '';
    this.useTimestamps = options.timestamps || false;
    this.prefixes = options.prefixes || {
      [LogLevel.ERROR]: '[ERROR]',
      [LogLevel.WARN]: '[WARN]',
      [LogLevel.INFO]: '[INFO]',
      [LogLevel.DEBUG]: '[DEBUG]',
    };
  }

  /**
   * Get the singleton Logger instance, creating it if necessary
   * @param options Optional configuration to update the logger
   */
  public static getInstance(options?: Partial<LoggerOptions>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger({
        level: LogLevel.INFO,
        timestamps: true,
        ...options,
      });
    } else if (options) {
      if (options.level !== undefined) {
        Logger.instance.level = options.level;
      }
      if (options.timestamps !== undefined) {
        Logger.instance.useTimestamps = options.timestamps;
      }
      if (options.prefixes) {
        Logger.instance.prefixes = { ...Logger.instance.prefixes, ...options.prefixes };
      }
    }

    return Logger.instance;
  }

  /**
   * Create a new logger instance with a specific component name
   * @param component The component name for this logger instance
   */
  public static forComponent(component: string): Logger {
    const mainInstance = Logger.getInstance();

    return new Logger({
      level: mainInstance.level,
      component,
      timestamps: mainInstance.useTimestamps,
      prefixes: mainInstance.prefixes,
    });
  }

  /**
   * Format a message with the appropriate prefix, component, and timestamp
   */
  private formatMessage(level: LogLevel, message: string): string {
    const prefix = this.prefixes[level];
    const timestamp = this.useTimestamps ? `[${new Date().toISOString()}] ` : '';
    const componentPrefix = this.component ? `[${this.component}] ` : '';
    return `${timestamp}${prefix} ${componentPrefix}${message}`;
  }

  /**
   * Log a message if the current log level allows it
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level > this.level) {
      return;
    }

    const formatted = this.formatMessage(level, message);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted, ...args);
        break;
      case LogLevel.WARN:
        console.warn(formatted, ...args);
        break;
      case LogLevel.INFO:
      case LogLevel.DEBUG:
      default:
        console.log(formatted, ...args);
        break;
    }
  }

  /**
   * Set the current log level
   */
  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * Log an error with a proper stack trace
   */
  public errorWithStack(message: string, error: Error): void {
    this.error(`${message}: ${error.message}`);
    if (error.stack) {
      this.error(error.stack);
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an informational message
   */
  public info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}
