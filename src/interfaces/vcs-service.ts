/**
 * VCS Service interfaces following the Interface Segregation Principle
 */

import {
  IacFile,
  VcsConfig,
  VcsFileDiscoveryOptions,
  VcsFileTreeItem,
  VcsOperationResult,
  VcsPagination,
  VcsRepository,
  VcsRepositoryFilter,
} from '../types/vcs';

/**
 * Repository discovery operations
 */
export interface IVcsRepositoryService {
  /**
   * Get a specific repository by owner and name
   */
  getRepository(owner: string, name: string): Promise<VcsOperationResult<VcsRepository>>;

  /**
   * Check if a repository exists and is accessible
   */
  repositoryExists(owner: string, name: string): Promise<boolean>;

  /**
   * Get repositories for an organization or user with filtering
   */
  getRepositories(
    owner: string,
    filter?: VcsRepositoryFilter,
    pagination?: VcsPagination
  ): Promise<VcsOperationResult<VcsRepository[]>>;

  /**
   * Get all repositories with automatic pagination
   */
  getAllRepositories(
    owner: string,
    filter?: VcsRepositoryFilter
  ): AsyncIterable<VcsOperationResult<VcsRepository[]>>;
}

/**
 * File operations within repositories
 */
export interface IVcsFileService {
  /**
   * Get file content by path
   */
  getFileContent(
    owner: string,
    repository: string,
    path: string,
    branch?: string
  ): Promise<VcsOperationResult<string>>;

  /**
   * Get file tree for a repository
   */
  getFileTree(
    owner: string,
    repository: string,
    branch?: string,
    recursive?: boolean
  ): Promise<VcsOperationResult<VcsFileTreeItem[]>>;

  /**
   * Check if a file exists
   */
  fileExists(owner: string, repository: string, path: string, branch?: string): Promise<boolean>;
}

/**
 * Infrastructure as Code specific file discovery
 */
export interface IVcsIacFileService {
  /**
   * Find IaC files in a single repository
   */
  findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<VcsOperationResult<IacFile[]>>;

  /**
   * Find IaC files across multiple repositories
   */
  findIacFilesInRepositories(
    repositories: VcsRepository[],
    options?: VcsFileDiscoveryOptions
  ): AsyncIterable<VcsOperationResult<IacFile[]>>;

  /**
   * Find all IaC files for an owner (organization or user)
   */
  findAllIacFiles(
    owner: string,
    repositoryFilter?: VcsRepositoryFilter,
    fileOptions?: VcsFileDiscoveryOptions
  ): AsyncIterable<VcsOperationResult<IacFile[]>>;
}

/**
 * Platform health and status operations
 */
export interface IVcsHealthService {
  /**
   * Check if the VCS platform is accessible
   */
  checkHealth(): Promise<boolean>;

  /**
   * Get current rate limit status
   */
  getRateLimit(): Promise<VcsOperationResult<any>>;

  /**
   * Test authentication
   */
  testAuthentication(): Promise<boolean>;
}

/**
 * Complete VCS service interface combining all operations
 */
export interface IVcsService
  extends IVcsRepositoryService,
    IVcsFileService,
    IVcsIacFileService,
    IVcsHealthService {
  /**
   * Get the platform configuration
   */
  readonly config: VcsConfig;

  /**
   * Get the platform name
   */
  readonly platformName: string;

  /**
   * Initialize the service (setup connections, validate config, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Cleanup resources (close connections, clear caches, etc.)
   */
  dispose(): Promise<void>;
}

/**
 * Factory interface for creating VCS services
 */
export interface IVcsServiceFactory {
  /**
   * Create a VCS service for the given configuration
   */
  createService(config: VcsConfig): Promise<IVcsService>;

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): string[];

  /**
   * Validate configuration for a platform
   */
  validateConfig(config: VcsConfig): Promise<boolean>;
}

/**
 * Cache interface for VCS operations
 */
export interface IVcsCache {
  /**
   * Get cached value
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set cached value with optional TTL
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Delete cached value
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cached values
   */
  clear(): Promise<void>;

  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>;
}

/**
 * Retry strategy interface for handling transient failures
 */
export interface IVcsRetryStrategy {
  /**
   * Execute operation with retry logic
   */
  execute<T>(operation: () => Promise<T>, context?: string): Promise<T>;

  /**
   * Check if an error should be retried
   */
  shouldRetry(error: Error, attemptNumber: number): boolean;

  /**
   * Calculate delay before next retry attempt
   */
  getRetryDelay(attemptNumber: number): number;
}
