/**
 * Simplified base VCS service focusing on common business logic patterns
 */

import {
  IacFile,
  IacFileType,
  VcsRepository,
  VcsRepositoryFilter,
  VcsFileDiscoveryOptions,
  VcsError,
  VcsErrorType,
  VcsPlatform,
} from '../types';
import { Logger } from '../services/logger';
import { processConcurrentlySettled } from '../utils/concurrent';
import { getIacFileType } from '../utils/file-type-detector';
import { DEFAULT_MAX_RETRIES, MAX_BACKOFF_MS, BASE_BACKOFF_MS } from '../constants';

/**
 * Configuration for VCS services
 */
export interface BaseVcsConfig {
  readonly platform: VcsPlatform;
  readonly debug?: boolean;
  readonly skipArchived?: boolean;
  readonly maxRetries?: number;
  readonly cacheEnabled?: boolean;
}

/**
 * Abstract base class for VCS services with common patterns and utilities
 */
export abstract class BaseVcsService {
  protected logger!: Logger;
  protected readonly config: BaseVcsConfig;
  protected readonly repoCache = new Map<string, VcsRepository | null>();
  protected readonly processedRepoCache = new Set<string>();

  constructor(config: BaseVcsConfig) {
    this.config = config;

    // Initialize logger with appropriate level and component
    const logLevel = config.debug ? 3 : 2; // DEBUG : INFO
    Logger.getInstance({ level: logLevel });
    // Note: this.logger will be set in child class constructor after platformName is available
  }

  /**
   * Initialize logger - should be called by child classes after platformName is set
   */
  protected initializeLogger(): void {
    this.logger = Logger.forComponent(this.platformName);
  }

  /**
   * Get the platform name (must be implemented by subclasses)
   */
  abstract get platformName(): string;

  /**
   * Get concurrency limits - can be overridden by subclasses
   */
  protected getConcurrencyLimits(): { repos: number; files: number } {
    return { repos: 1, files: 1 }; // Default to sequential processing
  }

  // Abstract methods that must be implemented by concrete classes
  abstract repositoryExists(owner: string, name: string): Promise<boolean | null>;
  abstract getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]>;
  abstract getSingleRepository(owner: string, repo: string): Promise<VcsRepository | null>;
  abstract findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]>;

  /**
   * Template method for finding all IaC files across repositories
   */
  async findAllIacFiles(
    owner: string,
    repositoryFilter?: VcsRepositoryFilter,
    fileOptions?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    this.logger.info(`Starting IaC file discovery for ${owner}`);

    try {
      // Step 1: Get all repositories
      const repositories = await this.getRepositories(owner, repositoryFilter);

      if (repositories.length === 0) {
        this.logger.info(`No repositories found for ${owner}`);
        return [];
      }

      this.logger.info(`Found ${repositories.length} repositories to scan`);

      // Step 2: Process repositories in parallel
      const concurrency = this.getConcurrencyLimits();
      this.logger.debug(`Processing repositories with concurrency limit: ${concurrency.repos}`);

      const processingResult = await processConcurrentlySettled(
        repositories,
        async (repository, index) => {
          this.logger.info(
            `Processing repository ${index + 1}/${repositories.length}: ${repository.fullName}`
          );

          const files = await this.findIacFilesInRepository(repository, fileOptions);

          const terraformCount = files.filter(f => f.type === 'terraform').length;
          const terragruntCount = files.filter(f => f.type === 'terragrunt').length;

          this.logger.info(
            `Repository ${repository.fullName}: ${files.length} IaC files ` +
              `(${terraformCount} Terraform, ${terragruntCount} Terragrunt)`
          );

          return files;
        },
        concurrency.repos
      );

      // Collect all successful results
      const allIacFiles: IacFile[] = [];
      for (const result of processingResult.results) {
        if (result !== null) {
          allIacFiles.push(...result);
        }
      }

      // Log any errors encountered
      processingResult.errors.forEach((error, index) => {
        if (error !== null) {
          this.logger.errorWithStack(
            `Failed to process repository ${repositories[index].fullName}`,
            error
          );
        }
      });

      this.logger.info(
        `Repository processing completed: ${processingResult.successCount}/${repositories.length} successful, ` +
          `${processingResult.errorCount} failed`
      );

      // Final summary
      const totalTerraform = allIacFiles.filter(f => f.type === 'terraform').length;
      const totalTerragrunt = allIacFiles.filter(f => f.type === 'terragrunt').length;

      this.logger.info(
        `Completed IaC file discovery: ${allIacFiles.length} total files ` +
          `(${totalTerraform} Terraform, ${totalTerragrunt} Terragrunt) across ${repositories.length} repositories`
      );

      return allIacFiles;
    } catch (error) {
      this.handleError(error, 'findAllIacFiles', { owner });
      throw error;
    }
  }

  /**
   * Helper method to execute operations with simple retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.config.maxRetries || DEFAULT_MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing ${operationName} (attempt ${attempt}/${maxRetries})`);
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          this.logger.error(`Operation ${operationName} failed after ${maxRetries} attempts`);
          break;
        }

        // Simple exponential backoff
        const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
        this.logger.warn(`Operation ${operationName} failed, retrying in ${delay}ms`, {
          attempt,
          error: lastError.message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(lastError?.message || 'Operation failed after retries');
  }

  /**
   * Helper method to get cached result or execute operation
   */
  protected getCachedRepository(cacheKey: string): VcsRepository | null | undefined {
    if (!this.config.cacheEnabled) {
      return undefined;
    }
    return this.repoCache.get(cacheKey);
  }

  /**
   * Helper method to cache repository result
   */
  protected setCachedRepository(cacheKey: string, repository: VcsRepository | null): void {
    if (this.config.cacheEnabled) {
      this.repoCache.set(cacheKey, repository);
    }
  }

  /**
   * Helper method to validate owner and repository names
   */
  protected validateOwnerAndRepo(owner: string, repo: string): void {
    if (!owner || typeof owner !== 'string' || owner.trim() === '') {
      throw new VcsError(
        'Owner name is required and must be a non-empty string',
        VcsErrorType.INVALID_CONFIGURATION,
        this.config.platform
      );
    }

    if (!repo || typeof repo !== 'string' || repo.trim() === '') {
      throw new VcsError(
        'Repository name is required and must be a non-empty string',
        VcsErrorType.INVALID_CONFIGURATION,
        this.config.platform
      );
    }
  }

  /**
   * Helper method to filter repositories based on criteria
   */
  protected filterRepositories(
    repositories: VcsRepository[],
    filter?: VcsRepositoryFilter
  ): VcsRepository[] {
    if (!filter) {
      return repositories;
    }

    let filtered = repositories;

    // Skip archived repositories if configured
    if (filter.skipArchived !== false) {
      filtered = filtered.filter(repo => !repo.archived);
    }

    // Filter by name pattern
    if (filter.namePattern) {
      filtered = filtered.filter(repo => filter.namePattern!.test(repo.name));
    }

    // Filter by visibility
    if (filter.visibility && filter.visibility !== 'all') {
      const isPrivate = filter.visibility === 'private';
      filtered = filtered.filter(repo => repo.private === isPrivate);
    }

    // Apply max repositories limit
    if (filter.maxRepositories && filter.maxRepositories > 0) {
      filtered = filtered.slice(0, filter.maxRepositories);
    }

    return filtered;
  }

  /**
   * Helper method to determine IaC file type from path
   */
  protected getIacFileType(path: string): IacFileType | null {
    return getIacFileType(path);
  }

  /**
   * Helper method to check if a file path should be included based on options
   */
  protected shouldIncludeFile(path: string, options?: VcsFileDiscoveryOptions): boolean {
    if (!options) {
      return true;
    }

    // Check file type
    const fileType = this.getIacFileType(path);
    if (!fileType) {
      return false;
    }

    if (options.fileTypes && !options.fileTypes.includes(fileType)) {
      return false;
    }

    // Check exclude patterns
    if (options.excludePatterns && options.excludePatterns.some(pattern => pattern.test(path))) {
      return false;
    }

    // Check include patterns
    if (options.includePatterns && !options.includePatterns.some(pattern => pattern.test(path))) {
      return false;
    }

    return true;
  }

  /**
   * Helper method to create a standard cache key
   */
  protected createCacheKey(...params: string[]): string {
    const sanitizedParams = params.map(p => p.replace(/[^a-zA-Z0-9-_]/g, '_'));
    return sanitizedParams.join(':');
  }

  /**
   * Helper method to handle platform-specific errors and convert them to VcsError
   */
  protected handleError(
    error: unknown,
    operation: string,
    context?: Record<string, unknown>
  ): never {
    this.logger.error(`Error in ${operation}`, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });

    // If it's already a VcsError, just re-throw it
    if (error instanceof VcsError) {
      throw error;
    }

    // Handle HTTP errors from platform APIs
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response
    ) {
      const response = error.response as { status: number; statusText?: string };
      const status = response.status;
      const message = error instanceof Error ? error.message : 'HTTP Error';

      let errorType: VcsErrorType;
      let retryable = false;

      switch (status) {
        case 401:
          errorType = VcsErrorType.AUTHENTICATION_FAILED;
          break;
        case 403:
          errorType = VcsErrorType.AUTHORIZATION_FAILED;
          break;
        case 404:
          errorType = VcsErrorType.RESOURCE_NOT_FOUND;
          break;
        case 429:
          errorType = VcsErrorType.RATE_LIMIT_EXCEEDED;
          retryable = true;
          break;
        default:
          errorType = VcsErrorType.PLATFORM_ERROR;
          retryable = status >= 500; // Server errors are retryable
      }

      throw new VcsError(
        message,
        errorType,
        this.config.platform,
        status,
        error instanceof Error ? error : undefined,
        retryable
      );
    }

    // Handle network errors
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
    ) {
      throw new VcsError(
        error instanceof Error ? error.message : 'Network error',
        VcsErrorType.NETWORK_ERROR,
        this.config.platform,
        undefined,
        error instanceof Error ? error : undefined,
        true // Network errors are typically retryable
      );
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new VcsError(
      errorMessage,
      VcsErrorType.UNKNOWN_ERROR,
      this.config.platform,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}
