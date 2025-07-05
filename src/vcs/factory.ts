import { VcsPlatform } from '../types';
import { GitHubService, GitHubServiceConfig } from './github';
import { BaseVcsService } from './base';

/**
 * Configuration for VCS service factory
 */
export interface VcsServiceFactoryConfig {
  platform: VcsPlatform;
  debug?: boolean;
  skipArchived?: boolean;
  maxRetries?: number;
  cacheEnabled?: boolean;

  // GitHub-specific options
  githubToken?: string;
  useRateLimit?: boolean;
  repoPattern?: string;
  iacFileTypes?: readonly ('terraform' | 'terragrunt')[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}

/**
 * Factory for creating VCS service instances based on platform
 */
export class VcsServiceFactory {
  /**
   * Create a VCS service instance for the specified platform
   */
  static createService(config: VcsServiceFactoryConfig): BaseVcsService {
    switch (config.platform) {
      case VcsPlatform.GITHUB:
        return VcsServiceFactory.createGitHubService(config);

      case VcsPlatform.LOCAL:
        throw new Error(
          `Local filesystem scanning is now handled by LocalFilesystemScanner. ` +
            `VCS factory should not be used for local filesystem.`
        );

      case VcsPlatform.GITLAB:
      case VcsPlatform.GITLAB_SELF_HOSTED:
      case VcsPlatform.BITBUCKET:
      case VcsPlatform.BITBUCKET_SERVER:
      case VcsPlatform.GITHUB_ENTERPRISE:
        throw new Error(
          `Platform ${config.platform} is not yet supported. ` +
            `Currently supported platforms: github`
        );

      default:
        throw new Error(`Unknown platform: ${config.platform}`);
    }
  }

  /**
   * Create GitHub service instance
   */
  private static createGitHubService(config: VcsServiceFactoryConfig): GitHubService {
    const githubConfig: GitHubServiceConfig = {
      platform: VcsPlatform.GITHUB,
      token: config.githubToken || process.env.GITHUB_TOKEN || '',
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
      useRateLimit: config.useRateLimit,
      repoPattern: config.repoPattern,
      iacFileTypes: config.iacFileTypes,
      maxConcurrentRepos: config.maxConcurrentRepos,
      maxConcurrentFiles: config.maxConcurrentFiles,
    };

    return new GitHubService(githubConfig);
  }

  /**
   * Get list of supported VCS platforms (local filesystem is handled separately)
   */
  static getSupportedPlatforms(): VcsPlatform[] {
    return [VcsPlatform.GITHUB];
  }

  /**
   * Check if a platform is supported by VCS factory
   */
  static isPlatformSupported(platform: VcsPlatform): boolean {
    return VcsServiceFactory.getSupportedPlatforms().includes(platform);
  }
}
