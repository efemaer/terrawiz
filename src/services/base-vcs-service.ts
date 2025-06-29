/**
 * Base VCS service implementation following SOLID principles
 */

import {
  IacFile,
  IacFileType,
  VcsConfig,
  VcsFileDiscoveryOptions,
  VcsFileTreeItem,
  VcsOperationResult,
  VcsPagination,
  VcsRateLimit,
  VcsRepository,
  VcsRepositoryFilter,
} from '../types/vcs';
import { IVcsService, IVcsCache, IVcsRetryStrategy } from '../interfaces/vcs-service';
import { ILogger } from '../interfaces/logger';
import { IHttpClient } from '../interfaces/http-client';

/**
 * Abstract base class for VCS services implementing common functionality
 *
 * This class follows the Template Method pattern and provides:
 * - Common error handling and logging
 * - Retry logic with exponential backoff
 * - Caching for expensive operations
 * - Rate limiting and throttling
 * - Standard validation and sanitization
 */
export abstract class BaseVcsService implements IVcsService {
  protected readonly logger: ILogger;
  protected readonly httpClient: IHttpClient;
  protected readonly cache?: IVcsCache;
  protected readonly retryStrategy?: IVcsRetryStrategy;

  constructor(
    public readonly config: VcsConfig,
    httpClient: IHttpClient,
    logger: ILogger,
    cache?: IVcsCache,
    retryStrategy?: IVcsRetryStrategy
  ) {
    this.httpClient = httpClient;
    this.logger = logger.child({ platform: config.platform });
    this.cache = cache;
    this.retryStrategy = retryStrategy;
  }

  /**
   * Get the platform name
   */
  abstract get platformName(): string;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing VCS service', { platform: this.platformName });

    try {
      await this.setupHttpClient();
      await this.validateConfiguration();
      await this.testConnection();

      this.logger.info('VCS service initialized successfully', { platform: this.platformName });
    } catch (error) {
      this.logger.errorWithStack('Failed to initialize VCS service', error as Error, {
        platform: this.platformName,
      });
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing VCS service', { platform: this.platformName });

    if (this.cache) {
      await this.cache.clear();
    }

    this.logger.info('VCS service disposed', { platform: this.platformName });
  }

  /**
   * Setup HTTP client with platform-specific configuration
   */
  protected abstract setupHttpClient(): Promise<void>;

  /**
   * Validate platform-specific configuration
   */
  protected abstract validateConfiguration(): Promise<void>;

  /**
   * Test connection to the platform
   */
  protected abstract testConnection(): Promise<void>;

  // Abstract methods that must be implemented by concrete classes
  abstract getRepository(owner: string, name: string): Promise<VcsOperationResult<VcsRepository>>;
  abstract repositoryExists(owner: string, name: string): Promise<boolean>;
  abstract getRepositories(
    owner: string,
    filter?: VcsRepositoryFilter,
    pagination?: VcsPagination
  ): Promise<VcsOperationResult<VcsRepository[]>>;
  abstract getAllRepositories(
    owner: string,
    filter?: VcsRepositoryFilter
  ): AsyncIterable<VcsOperationResult<VcsRepository[]>>;
  abstract getFileContent(
    owner: string,
    repository: string,
    path: string,
    branch?: string
  ): Promise<VcsOperationResult<string>>;
  abstract getFileTree(
    owner: string,
    repository: string,
    branch?: string,
    recursive?: boolean
  ): Promise<VcsOperationResult<VcsFileTreeItem[]>>;
  abstract fileExists(
    owner: string,
    repository: string,
    path: string,
    branch?: string
  ): Promise<boolean>;
  abstract findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<VcsOperationResult<IacFile[]>>;
  abstract findIacFilesInRepositories(
    repositories: VcsRepository[],
    options?: VcsFileDiscoveryOptions
  ): AsyncIterable<VcsOperationResult<IacFile[]>>;
  abstract findAllIacFiles(
    owner: string,
    repositoryFilter?: VcsRepositoryFilter,
    fileOptions?: VcsFileDiscoveryOptions
  ): AsyncIterable<VcsOperationResult<IacFile[]>>;
  abstract checkHealth(): Promise<boolean>;
  abstract getRateLimit(): Promise<VcsOperationResult<VcsRateLimit>>;
  abstract testAuthentication(): Promise<boolean>;

  /**
   * Helper method to execute operations with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, string | number | boolean>
  ): Promise<T> {
    const operationContext = {
      operation: operationName,
      platform: this.platformName,
      ...context,
    };

    if (this.retryStrategy) {
      this.logger.debug(`Executing operation with retry: ${operationName}`, operationContext);
      return this.retryStrategy.execute(operation, operationName);
    } else {
      this.logger.debug(`Executing operation: ${operationName}`, operationContext);
      return operation();
    }
  }

  /**
   * Helper method to get cached result or execute operation
   */
  protected async getCachedOrExecute<T>(
    cacheKey: string,
    operation: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    if (this.cache) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== null) {
        this.logger.debug('Cache hit', { cacheKey });
        return cached;
      }
    }

    const result = await operation();

    if (this.cache && result !== null && result !== undefined) {
      await this.cache.set(cacheKey, result, ttlMs);
      this.logger.debug('Cache set', { cacheKey, ttlMs });
    }

    return result;
  }

  /**
   * Helper method to validate owner and repository names
   */
  protected validateOwnerAndRepo(owner: string, repo: string): void {
    if (!owner || typeof owner !== 'string' || owner.trim() === '') {
      throw new Error('Owner name is required and must be a non-empty string');
    }

    if (!repo || typeof repo !== 'string' || repo.trim() === '') {
      throw new Error('Repository name is required and must be a non-empty string');
    }
  }

  /**
   * Helper method to validate file path
   */
  protected validateFilePath(path: string): void {
    if (!path || typeof path !== 'string' || path.trim() === '') {
      throw new Error('File path is required and must be a non-empty string');
    }

    // Basic path traversal protection
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid file path: path traversal detected');
    }
  }

  /**
   * Helper method to filter IaC files by type and patterns
   */
  protected filterIacFiles(
    files: VcsFileTreeItem[],
    options?: VcsFileDiscoveryOptions
  ): VcsFileTreeItem[] {
    if (!options) {
      return files;
    }

    let filtered = files;

    // Filter by file types
    if (options.fileTypes && options.fileTypes.length > 0) {
      filtered = filtered.filter(file => {
        const isTerraform = options.fileTypes.includes('terraform') && file.path?.endsWith('.tf');
        const isTerragrunt =
          options.fileTypes.includes('terragrunt') && file.path?.endsWith('.hcl');
        return isTerraform || isTerragrunt;
      });
    }

    // Apply exclude patterns
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      filtered = filtered.filter(file => {
        return !options.excludePatterns!.some(pattern => pattern.test(file.path));
      });
    }

    // Apply include patterns
    if (options.includePatterns && options.includePatterns.length > 0) {
      filtered = filtered.filter(file => {
        return options.includePatterns!.some(pattern => pattern.test(file.path));
      });
    }

    // Apply max files limit
    if (options.maxFiles && options.maxFiles > 0) {
      filtered = filtered.slice(0, options.maxFiles);
    }

    return filtered;
  }

  /**
   * Helper method to determine IaC file type from path
   */
  protected getIacFileType(path: string): IacFileType | null {
    if (path.endsWith('.tf')) {
      return 'terraform';
    }
    if (path.endsWith('.hcl')) {
      return 'terragrunt';
    }
    return null;
  }

  /**
   * Helper method to create a standard cache key
   */
  protected createCacheKey(operation: string, ...params: string[]): string {
    const sanitizedParams = params.map(p => p.replace(/[^a-zA-Z0-9-_]/g, '_'));
    return `${this.platformName}:${operation}:${sanitizedParams.join(':')}`;
  }

  /**
   * Helper method to handle platform-specific errors
   */
  protected handleError(
    error: unknown,
    operation: string,
    context?: Record<string, string | number | boolean>
  ): never {
    const errorContext = {
      operation,
      platform: this.platformName,
      ...context,
    };

    // Type guard for HTTP error
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response
    ) {
      // HTTP error response
      const response = error.response as { status: number; statusText?: string };
      const status = response.status;
      const statusText = response.statusText || 'Unknown Error';

      this.logger.error(`HTTP error in ${operation}`, {
        ...errorContext,
        statusCode: status,
        statusText,
      });

      // Handle common HTTP error codes
      switch (status) {
        case 401:
          throw new Error('Authentication failed. Please check your token.');
        case 403:
          throw new Error('Access forbidden. You may not have permission to access this resource.');
        case 404:
          throw new Error('Resource not found.');
        case 429:
          throw new Error('Rate limit exceeded. Please wait before making more requests.');
        default:
          throw new Error(`HTTP ${status}: ${statusText}`);
      }
    } else if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      // Network or system error
      const networkError = error as { code: string; message: string };
      this.logger.error(`Network error in ${operation}`, {
        ...errorContext,
        code: networkError.code,
      });

      throw new Error(`Network error: ${networkError.message}`);
    } else {
      // Other error
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      this.logger.errorWithStack(`Unexpected error in ${operation}`, errorToLog, errorContext);
      throw errorToLog;
    }
  }
}
