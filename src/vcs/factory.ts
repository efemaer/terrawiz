import { VcsPlatform } from '../types';
import { GitHubService, GitHubServiceConfig } from './github';
import { GitLabService, GitLabServiceConfig } from './gitlab';
import { AzureDevOpsService, AzureDevOpsServiceConfig } from './azure-devops';
import { BitbucketService, BitbucketServiceConfig } from './bitbucket';
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
  azureDevopsToken?: string;
  azureDevopsHost?: string;
  bitbucketToken?: string;
  bitbucketHost?: string;
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

      case VcsPlatform.AZURE_DEVOPS:
      case VcsPlatform.AZURE_DEVOPS_SELF_HOSTED:
        return VcsServiceFactory.createAzureDevOpsService(config);

      case VcsPlatform.BITBUCKET:
        return VcsServiceFactory.createBitbucketService(config);

      case VcsPlatform.BITBUCKET_SELF_HOSTED:
        throw new Error(
          `Platform ${config.platform} is not yet supported. ` +
            `Bitbucket Cloud is supported via "bitbucket:workspace[/repo]".`
        );

      case VcsPlatform.LOCAL:
        throw new Error(
          `Local filesystem scanning is now handled by LocalFilesystemScanner. ` +
            `VCS factory should not be used for local filesystem.`
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

  private static createAzureDevOpsService(config: VcsServiceFactoryConfig): AzureDevOpsService {
    const azureConfig: AzureDevOpsServiceConfig = {
      platform: config.platform, // Can be AZURE_DEVOPS or AZURE_DEVOPS_SELF_HOSTED
      token: config.azureDevopsToken || process.env.AZURE_DEVOPS_TOKEN || '',
      host: config.azureDevopsHost,
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
      repoPattern: config.repoPattern,
      iacFileTypes: config.iacFileTypes,
      maxConcurrentRepos: config.maxConcurrentRepos,
      maxConcurrentFiles: config.maxConcurrentFiles,
    };

    return new AzureDevOpsService(azureConfig);
  }

  private static createBitbucketService(config: VcsServiceFactoryConfig): BitbucketService {
    const bitbucketConfig: BitbucketServiceConfig = {
      platform: config.platform, // Can be BITBUCKET or BITBUCKET_SELF_HOSTED
      token: config.bitbucketToken || process.env.BITBUCKET_TOKEN || '',
      host: config.bitbucketHost,
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
      repoPattern: config.repoPattern,
      iacFileTypes: config.iacFileTypes,
      maxConcurrentRepos: config.maxConcurrentRepos,
      maxConcurrentFiles: config.maxConcurrentFiles,
    };

    return new BitbucketService(bitbucketConfig);
  }

  static getSupportedPlatforms(): VcsPlatform[] {
    return [
      VcsPlatform.GITHUB,
      VcsPlatform.GITHUB_SELF_HOSTED,
      VcsPlatform.GITLAB,
      VcsPlatform.GITLAB_SELF_HOSTED,
      VcsPlatform.AZURE_DEVOPS,
      VcsPlatform.AZURE_DEVOPS_SELF_HOSTED,
      VcsPlatform.BITBUCKET,
    ];
  }
  static isPlatformSupported(platform: VcsPlatform): boolean {
    return VcsServiceFactory.getSupportedPlatforms().includes(platform);
  }
}
