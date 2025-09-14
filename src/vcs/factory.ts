import { VcsPlatform } from '../types';
import { GitHubService, GitHubServiceConfig } from './github';
import { GitLabService, GitLabServiceConfig } from './gitlab';
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

  // Common options
  repoPattern?: string;
  iacFileTypes?: readonly ('terraform' | 'terragrunt')[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
  useRateLimit?: boolean;

  // Platform-specific options
  githubToken?: string;
  githubHost?: string;
  gitlabToken?: string;
  gitlabHost?: string;
}

export class VcsServiceFactory {
  static createService(config: VcsServiceFactoryConfig): BaseVcsService {
    switch (config.platform) {
      case VcsPlatform.GITHUB:
      case VcsPlatform.GITHUB_SELF_HOSTED:
        return VcsServiceFactory.createGitHubService(config);

      case VcsPlatform.GITLAB:
      case VcsPlatform.GITLAB_SELF_HOSTED:
        return VcsServiceFactory.createGitLabService(config);

      case VcsPlatform.LOCAL:
        throw new Error(
          `Local filesystem scanning is now handled by LocalFilesystemScanner. ` +
            `VCS factory should not be used for local filesystem.`
        );

      case VcsPlatform.BITBUCKET:
      case VcsPlatform.BITBUCKET_SELF_HOSTED:
        throw new Error(
          `Platform ${config.platform} is not yet supported. ` +
            `Currently supported platforms: github, github-self-hosted, gitlab, gitlab-self-hosted`
        );

      default:
        throw new Error(`Unknown platform: ${config.platform}`);
    }
  }

  private static createGitHubService(config: VcsServiceFactoryConfig): GitHubService {
    const githubConfig: GitHubServiceConfig = {
      platform: config.platform, // Can be GITHUB or GITHUB_SELF_HOSTED
      token: config.githubToken || process.env.GITHUB_TOKEN || '',
      host: config.githubHost,
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

  private static createGitLabService(config: VcsServiceFactoryConfig): GitLabService {
    const gitlabConfig: GitLabServiceConfig = {
      platform: config.platform, // Can be GITLAB or GITLAB_SELF_HOSTED
      token: config.gitlabToken || process.env.GITLAB_TOKEN || '',
      host: config.gitlabHost,
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

    return new GitLabService(gitlabConfig);
  }

  static getSupportedPlatforms(): VcsPlatform[] {
    return [
      VcsPlatform.GITHUB,
      VcsPlatform.GITHUB_SELF_HOSTED,
      VcsPlatform.GITLAB,
      VcsPlatform.GITLAB_SELF_HOSTED,
    ];
  }
  static isPlatformSupported(platform: VcsPlatform): boolean {
    return VcsServiceFactory.getSupportedPlatforms().includes(platform);
  }
}
