/**
 * Mutable versions of VCS types for testing
 */

import {
  IacFileType,
  VcsPlatform,
  VcsRepository,
  VcsFileTreeItem,
  VcsOperationResult,
  VcsPagination,
  VcsRateLimit,
  VcsConfig,
  IacFile,
} from '../../src/types/vcs';

/**
 * Mutable version of IacFile for test builders
 */
export interface MutableIacFile {
  type: IacFileType;
  repository: string;
  path: string;
  content: string;
  url: string;
  sha?: string;
  size?: number;
}

/**
 * Mutable version of VcsRepository for test builders
 */
export interface MutableVcsRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  archived: boolean;
  private: boolean;
  url: string;
  cloneUrl: string;
}

/**
 * Mutable version of VcsConfig for test builders
 */
export interface MutableVcsConfig {
  platform: VcsPlatform;
  baseUrl?: string;
  auth: {
    token: string;
    tokenType?: 'bearer' | 'basic' | 'oauth';
  };
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  rateLimit?: {
    enabled: boolean;
    requestsPerMinute?: number;
  };
}

/**
 * Mutable version of VcsFileTreeItem for test builders
 */
export interface MutableVcsFileTreeItem {
  path: string;
  type: 'file' | 'directory';
  sha: string;
  size?: number;
  url: string;
}

/**
 * Mutable version of VcsOperationResult for test builders
 */
export interface MutableVcsOperationResult<T> {
  data: T;
  pagination?: VcsPagination;
  rateLimit?: VcsRateLimit;
  requestId?: string;
  cached?: boolean;
}

/**
 * Type conversion utilities
 */
export const TestTypeConverters = {
  toIacFile: (mutable: MutableIacFile): IacFile => mutable as IacFile,
  toVcsRepository: (mutable: MutableVcsRepository): VcsRepository => mutable as VcsRepository,
  toVcsConfig: (mutable: MutableVcsConfig): VcsConfig => mutable as VcsConfig,
  toVcsFileTreeItem: (mutable: MutableVcsFileTreeItem): VcsFileTreeItem =>
    mutable as VcsFileTreeItem,
  toVcsOperationResult: <T>(mutable: MutableVcsOperationResult<T>): VcsOperationResult<T> =>
    mutable as VcsOperationResult<T>,
};
