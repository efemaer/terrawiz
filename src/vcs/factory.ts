import { VcsPlatform } from '../types';
import { GitHubService, GitHubServiceConfig } from './github';
import { LocalFilesystemService, LocalFilesystemServiceConfig } from './local';
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
        return VcsServiceFactory.createLocalFilesystemService(config);

      case VcsPlatform.GITLAB:
      case VcsPlatform.GITLAB_SELF_HOSTED:
      case VcsPlatform.BITBUCKET:
      case VcsPlatform.BITBUCKET_SERVER:
      case VcsPlatform.GITHUB_ENTERPRISE:
        throw new Error(
          `Platform ${config.platform} is not yet supported. ` +
            `Currently supported platforms: github, local`
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
   * Create local filesystem service instance
   */
  private static createLocalFilesystemService(
    config: VcsServiceFactoryConfig
  ): LocalFilesystemService {
    const localConfig: LocalFilesystemServiceConfig = {
      platform: VcsPlatform.LOCAL,
      debug: config.debug,
      skipArchived: false, // Not applicable for local filesystem
      maxRetries: config.maxRetries || 1,
      cacheEnabled: config.cacheEnabled,
      maxConcurrentFiles: config.maxConcurrentFiles,
    };

    return new LocalFilesystemService(localConfig);
  }

  /**
   * Get list of supported platforms
   */
  static getSupportedPlatforms(): VcsPlatform[] {
    return [VcsPlatform.GITHUB, VcsPlatform.LOCAL];
  }

  /**
   * Check if a platform is supported
   */
  static isPlatformSupported(platform: VcsPlatform): boolean {
    return VcsServiceFactory.getSupportedPlatforms().includes(platform);
  }
}
