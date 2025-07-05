/**
 * Common types for VCS (Version Control System) operations
 */

/**
 * Supported VCS platforms
 */
export enum VcsPlatform {
  GITHUB = 'github',
  GITHUB_ENTERPRISE = 'github-enterprise',
  GITLAB = 'gitlab',
  GITLAB_SELF_HOSTED = 'gitlab-self-hosted',
  BITBUCKET = 'bitbucket',
  BITBUCKET_SERVER = 'bitbucket-server',
  LOCAL = 'local',
}

/**
 * Type of Infrastructure as Code file
 */
export type IacFileType = 'terraform' | 'terragrunt';

/**
 * Repository information structure (platform agnostic)
 */
export interface VcsRepository {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly archived: boolean;
  readonly private: boolean;
  readonly url: string;
  readonly cloneUrl: string;
}

/**
 * Infrastructure as Code file representation
 */
export interface IacFile {
  readonly type: IacFileType;
  readonly repository: string;
  readonly path: string;
  readonly content: string;
  readonly url: string;
  readonly sha?: string;
  readonly size?: number;
}

/**
 * File tree item representation
 */
export interface VcsFileTreeItem {
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly sha: string;
  readonly size?: number;
  readonly url: string;
}

/**
 * VCS authentication configuration
 */
export interface VcsAuthConfig {
  readonly token: string;
  readonly tokenType?: 'bearer' | 'basic' | 'oauth';
}

/**
 * VCS platform configuration
 */
export interface VcsConfig {
  readonly platform: VcsPlatform;
  readonly baseUrl?: string; // For self-hosted instances
  readonly auth: VcsAuthConfig;
  readonly timeout?: number;
  readonly retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  readonly rateLimit?: {
    enabled: boolean;
    requestsPerMinute?: number;
  };
}

/**
 * Repository filtering options
 */
export interface VcsRepositoryFilter {
  readonly skipArchived?: boolean;
  readonly namePattern?: RegExp;
  readonly visibility?: 'public' | 'private' | 'all';
  readonly maxRepositories?: number;
}

/**
 * File discovery options
 */
export interface VcsFileDiscoveryOptions {
  readonly fileTypes: IacFileType[];
  readonly maxFiles?: number;
  readonly excludePatterns?: RegExp[];
  readonly includePatterns?: RegExp[];
}

/**
 * Pagination information for API responses
 */
export interface VcsPagination {
  readonly page: number;
  readonly perPage: number;
  readonly totalPages?: number;
  readonly totalItems?: number;
  readonly hasNext: boolean;
  readonly nextPageToken?: string;
}

/**
 * Rate limit information
 */
export interface VcsRateLimit {
  readonly remaining: number;
  readonly total: number;
  readonly resetAt: Date;
  readonly resource?: string;
}

/**
 * VCS operation result with metadata
 */
export interface VcsOperationResult<T> {
  readonly data: T;
  readonly pagination?: VcsPagination;
  readonly rateLimit?: VcsRateLimit;
  readonly requestId?: string;
  readonly cached?: boolean;
}

/**
 * Error types for VCS operations
 */
export enum VcsErrorType {
  AUTHENTICATION_FAILED = 'authentication_failed',
  AUTHORIZATION_FAILED = 'authorization_failed',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  NETWORK_ERROR = 'network_error',
  INVALID_CONFIGURATION = 'invalid_configuration',
  PLATFORM_ERROR = 'platform_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * VCS-specific error with detailed information
 */
export class VcsError extends Error {
  constructor(
    message: string,
    public readonly type: VcsErrorType,
    public readonly platform: VcsPlatform,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'VcsError';
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.retryable || this.type === VcsErrorType.RATE_LIMIT_EXCEEDED;
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    switch (this.type) {
      case VcsErrorType.AUTHENTICATION_FAILED:
        return 'Authentication failed. Please check your token or credentials.';
      case VcsErrorType.AUTHORIZATION_FAILED:
        return 'Access denied. You may not have permission to access this resource.';
      case VcsErrorType.RESOURCE_NOT_FOUND:
        return 'The requested resource was not found.';
      case VcsErrorType.RATE_LIMIT_EXCEEDED:
        return 'Rate limit exceeded. Please wait before making more requests.';
      case VcsErrorType.NETWORK_ERROR:
        return 'Network error occurred. Please check your connection.';
      case VcsErrorType.INVALID_CONFIGURATION:
        return 'Invalid configuration. Please check your settings.';
      default:
        return this.message;
    }
  }
}

/**
 * Simple VCS service interface for the simplified architecture
 * (Keeping only the essential interfaces we actually use)
 */
export interface IVcsService {
  readonly platformName: string;

  repositoryExists(owner: string, name: string): Promise<boolean | null>;
  getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]>;
  findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]>;
  findAllIacFiles(
    owner: string,
    repositoryFilter?: VcsRepositoryFilter,
    fileOptions?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]>;
}
