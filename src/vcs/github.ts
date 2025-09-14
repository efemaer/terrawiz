import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import * as dotenv from 'dotenv';
import { BaseVcsService, BaseVcsConfig } from './base';
import {
  IacFile,
  IacFileType,
  VcsRepository,
  VcsRepositoryFilter,
  VcsFileDiscoveryOptions,
  VcsPlatform,
  VcsError,
  VcsErrorType,
} from '../types';
import { processConcurrentlySettled } from '../utils/concurrent';
import { isNotFoundError } from '../utils/error-handler';
import { 
  mapToVcsRepository, 
  createGitHubRawRepository, 
  createRepositoryCacheKey 
} from '../utils/repository-mapper';
import { API_DEFAULTS } from '../constants';

dotenv.config({ quiet: true });

interface GitHubRepo {
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
  archived: boolean;
  private: boolean;
  html_url: string;
  clone_url: string;
}

interface GitHubTreeItem {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
  url?: string;
}

export interface GitHubServiceConfig extends BaseVcsConfig {
  token: string;
  host?: string;
  useRateLimit?: boolean;
  repoPattern?: string;
  iacFileTypes?: readonly IacFileType[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}

export class GitHubService extends BaseVcsService {
  private octokit!: Octokit;
  private useRateLimit: boolean;
  private repoPattern: RegExp | null = null;
  private iacFileTypes: readonly IacFileType[];
  private maxConcurrentRepos: number;
  private maxConcurrentFiles: number;
  private host?: string;

  protected getConcurrencyLimits(): { repos: number; files: number } {
    return {
      repos: this.maxConcurrentRepos,
      files: this.maxConcurrentFiles,
    };
  }

  constructor(config: GitHubServiceConfig) {
    super({
      platform: VcsPlatform.GITHUB,
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
    });

    this.host = config.host;
    this.useRateLimit = config.useRateLimit !== false; // Default to true
    this.iacFileTypes = config.iacFileTypes || ['terraform', 'terragrunt'];
    this.maxConcurrentRepos = config.maxConcurrentRepos || 5;
    this.maxConcurrentFiles = config.maxConcurrentFiles || 10;

    // Validate GitHub token
    const token = config.token || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new VcsError(
        'GitHub token not found. Please provide token in config or set GITHUB_TOKEN environment variable',
        VcsErrorType.INVALID_CONFIGURATION,
        VcsPlatform.GITHUB
      );
    }

    this.initializeLogger();

    // Initialize repository pattern filter if provided
    if (config.repoPattern) {
      try {
        this.repoPattern = new RegExp(config.repoPattern);
        this.logger.info(`Repository filter pattern initialized: ${config.repoPattern}`);
      } catch (error) {
        throw new VcsError(
          `Invalid repository regex pattern: ${config.repoPattern}`,
          VcsErrorType.INVALID_CONFIGURATION,
          VcsPlatform.GITHUB,
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
    this.initializeOctokit(token);
    this.logger.info('GitHub service initialized successfully');
  }

  get platformName(): string {
    return this.host ? `GitHub (${this.host})` : 'GitHub';
  }

  private initializeOctokit(token: string): void {
    if (this.useRateLimit) {
      const CustomOctokit = Octokit.plugin(throttling);
      const octokitConfig = {
        auth: token,
        ...(this.host && { baseUrl: `${this.host}/api/v3` }),
        throttle: {
          onRateLimit: (retryAfter: number, options: any, octokit: any, retryCount: number) => {
            this.logger.warn(`Request quota exhausted for ${options.method} ${options.url}`);

            if (retryCount < 1) {
              this.logger.info(`Retrying after ${retryAfter} seconds`);
              return true;
            }

            this.logger.error(`Rate limit exceeded, no more retries left`);
            return false;
          },
          onSecondaryRateLimit: (retryAfter: number, options: any, _octokit: any) => {
            this.logger.warn(`Secondary rate limit triggered for ${options.method} ${options.url}`);
            return false;
          },
        },
      };
      this.octokit = new CustomOctokit(octokitConfig);
      this.logger.debug('GitHub service initialized with rate limit protection');
    } else {
      const octokitConfig = {
        auth: token,
        ...(this.host && { baseUrl: `${this.host}/api/v3` }),
      };
      this.octokit = new Octokit(octokitConfig);
      this.logger.debug('GitHub service initialized without rate limit protection');
    }
  }

  /**
   * Check if a repository exists and is accessible
   * @param owner Repository owner
   * @param repo Repository name
   * @returns true if exists, false if not, null if archived and skipping archived
   */
  async repositoryExists(owner: string, repo: string): Promise<boolean | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('github', 'repo-exists', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached !== null;
    }

    try {
      const response = await this.octokit.repos.get({
        owner,
        repo,
      });

      const repoInfo = {
        fullName: response.data.full_name,
        private: response.data.private,
        visibility: response.data.visibility,
        archived: response.data.archived,
      };

      this.logger.debug(`Repository info: ${JSON.stringify(repoInfo)}`);

      const repository: VcsRepository = {
        owner: response.data.owner.login,
        name: response.data.name,
        fullName: response.data.full_name,
        defaultBranch: response.data.default_branch,
        archived: response.data.archived,
        private: response.data.private,
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
      };

      // Skip archived repositories if specified
      if (this.config.skipArchived && repository.archived) {
        this.logger.info(`Skipping archived repository: ${owner}/${repo}`);
        this.setCachedRepository(cacheKey, null);
        return null;
      }

      this.setCachedRepository(cacheKey, repository);
      return true;
    } catch (error) {
      this.setCachedRepository(cacheKey, null);
      if (isNotFoundError(error, this.platform)) {
        return false;
      }
      this.handleError(error, 'repositoryExists', { owner, repo });
      return null;
    }
  }

  async getSingleRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('github', 'single-repo', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      this.logger.info(`Retrieving repository ${owner}/${repo}...`);

      const response = await this.octokit.repos.get({
        owner,
        repo,
      });

      const repository: VcsRepository = {
        owner: response.data.owner.login,
        name: response.data.name,
        fullName: response.data.full_name,
        defaultBranch: response.data.default_branch,
        archived: response.data.archived,
        private: response.data.private,
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
      };

      // Skip archived repositories if specified
      if (this.config.skipArchived && repository.archived) {
        this.logger.info(`Skipping archived repository: ${owner}/${repo}`);
        this.setCachedRepository(cacheKey, null);
        return null;
      }

      this.setCachedRepository(cacheKey, repository);
      return repository;
    } catch (error) {
      this.setCachedRepository(cacheKey, null);
      if (isNotFoundError(error, this.platform)) {
        return null;
      }
      this.handleError(error, 'getSingleRepository', { owner, repo });
      return null;
    }
  }

  async getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]> {
    try {
      this.logger.info(`Retrieving repositories for ${owner}...`);

      const repositories: VcsRepository[] = [];
      const maxRepos = filter?.maxRepositories;
      const perPage = API_DEFAULTS.GITHUB_PER_PAGE;
      // Track skipped repositories for reporting
      let skippedArchivedCount = 0;
      let skippedPatternCount = 0;

      // Determine if this is an organization or a user
      let isOrg = true;
      try {
        await this.octokit.orgs.get({ org: owner });
      } catch {
        isOrg = false;
        this.logger.info(`${owner} is not an organization, treating as a user`);
      }

      const options = isOrg
        ? this.octokit.repos.listForOrg.endpoint.merge({ org: owner, per_page: perPage })
        : this.octokit.repos.listForUser.endpoint.merge({ username: owner, per_page: perPage });

      // Get rate limit info to show total pages estimate
      const rateLimit = await this.octokit.rateLimit.get();
      const remainingRequests = rateLimit.data.resources.core.remaining;
      this.logger.info(`Rate limit status: ${remainingRequests} requests remaining`);

      let currentPage = 1;
      let collectingRepos = true;
      let totalReposAvailable = 0; // We'll update this after the first page

      while (collectingRepos) {
        const response = await this.octokit.request(`${options.url}`, {
          ...options,
          page: currentPage,
        });

        if (response.data.length === 0) {
          break;
        }

        // On first page, try to get total count if available in headers
        if (currentPage === 1) {
          const linkHeader = response.headers.link;
          if (linkHeader) {
            const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (lastPageMatch && lastPageMatch[1]) {
              const lastPage = parseInt(lastPageMatch[1], 10);
              totalReposAvailable = lastPage * perPage;
              this.logger.info(
                `Found approximately ${totalReposAvailable} total repositories (${lastPage} pages)`
              );
            }
          }
        }

        // Filter repositories based on criteria (archived status and regex pattern)
        const filteredRepos = response.data.filter((repo: GitHubRepo) => {
          const fullName = repo.full_name;

          // Skip if already processed (avoids duplicate logging)
          if (this.processedRepoCache.has(fullName)) {
            return false;
          }

          // Mark as processed
          this.processedRepoCache.add(fullName);

          // Skip archived repositories if configured
          if (this.config.skipArchived && repo.archived) {
            skippedArchivedCount++;
            this.logger.debug(`Skipping archived repository: ${fullName}`);
            return false;
          }

          // Filter by repository name pattern if specified
          if (this.repoPattern && !this.repoPattern.test(repo.name)) {
            skippedPatternCount++;
            this.logger.debug(`Repository ${repo.name} doesn't match pattern ${this.repoPattern}`);
            return false;
          }

          return true;
        });

        // Map to our VcsRepository format using shared utility
        const repoInfos: VcsRepository[] = filteredRepos.map((repo: GitHubRepo) => 
          mapToVcsRepository(createGitHubRawRepository(repo))
        );

        repositories.push(...repoInfos);

        const totalProgress =
          totalReposAvailable > 0
            ? `(page ${currentPage}/${Math.ceil(totalReposAvailable / perPage)})`
            : `(page ${currentPage})`;
        this.logger.info(
          `Retrieved ${repoInfos.length} active repositories ${totalProgress}, skipped ${skippedArchivedCount} archived repos, filtered out ${skippedPatternCount} by pattern, total active: ${repositories.length}`
        );

        // Check if we've reached the maximum
        if (maxRepos && repositories.length >= maxRepos) {
          repositories.splice(maxRepos); // Trim excess
          collectingRepos = false;
          this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
        }

        currentPage++;
      }

      this.logger.info(
        `Found ${repositories.length} active repositories for ${owner} (skipped ${skippedArchivedCount} archived, filtered out ${skippedPatternCount} by pattern)`
      );
      // Apply additional filtering using base class method
      const filtered = this.filterRepositories(repositories, filter);
      return filtered;
    } catch (error) {
      this.handleError(error, 'getRepositories', { owner });
      return [];
    }
  }

  async findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    try {
      this.logger.info(`Getting IaC files from ${repository.fullName}...`);

      // Use configured file types or options
      const fileTypes = options?.fileTypes || this.iacFileTypes;

      // Get reference to the default branch
      const reference = await this.octokit.git.getRef({
        owner: repository.owner,
        repo: repository.name,
        ref: `heads/${repository.defaultBranch}`,
      });

      const commitSha = reference.data.object.sha;

      // Get the commit
      const commit = await this.octokit.git.getCommit({
        owner: repository.owner,
        repo: repository.name,
        commit_sha: commitSha,
      });

      const treeSha = commit.data.tree.sha;

      // Get the recursive tree
      const tree = await this.octokit.git.getTree({
        owner: repository.owner,
        repo: repository.name,
        tree_sha: treeSha,
        recursive: '1', // Recursive flag as string '1'
      });

      // Filter for IaC files based on options
      const iacFiles: { path: string; url: string; sha: string; type: IacFileType }[] =
        tree.data.tree
          .filter((item: GitHubTreeItem) => {
            if (item.type !== 'blob' || !item.path || !item.sha) {
              return false;
            }

            return this.shouldIncludeFile(item.path, { fileTypes: [...fileTypes], ...options });
          })
          .map((item: GitHubTreeItem) => {
            const fileType = this.getIacFileType(item.path as string)!;
            return {
              path: item.path as string,
              url: `https://github.com/${repository.fullName}/blob/${repository.defaultBranch}/${item.path}`,
              sha: item.sha as string,
              type: fileType,
            };
          });

      // Apply max files limit if specified
      const limitedFiles = options?.maxFiles ? iacFiles.slice(0, options.maxFiles) : iacFiles;

      // Count files by type
      const terraformCount = limitedFiles.filter(f => f.type === 'terraform').length;
      const terragruntCount = limitedFiles.filter(f => f.type === 'terragrunt').length;

      if (limitedFiles.length === 0) {
        this.logger.info(`No IaC files found in ${repository.fullName}`);
        return [];
      }

      this.logger.info(
        `Found ${limitedFiles.length} IaC files in ${repository.fullName} ` +
          `(${terraformCount} Terraform, ${terragruntCount} Terragrunt)`
      );

      // Get content for each file in parallel
      const concurrency = this.getConcurrencyLimits();
      this.logger.debug(
        `Processing ${limitedFiles.length} files with concurrency limit: ${concurrency.files}`
      );

      const fileProcessingResult = await processConcurrentlySettled(
        limitedFiles,
        async (file, index) => {
          // Show progress for larger file sets
          if (limitedFiles.length > 10 && (index + 1) % 10 === 0) {
            this.logger.info(
              `Processing file ${index + 1}/${limitedFiles.length} in ${repository.fullName}`
            );
          }

          const content = await this.getFileContent(repository.owner, repository.name, file.path);
          return {
            type: file.type,
            repository: repository.fullName,
            path: file.path,
            content,
            url: file.url,
            sha: file.sha,
          } as IacFile;
        },
        concurrency.files
      );

      // Collect successful results
      const result: IacFile[] = [];
      for (const fileResult of fileProcessingResult.results) {
        if (fileResult !== null) {
          result.push(fileResult);
        }
      }

      // Log any file processing errors
      fileProcessingResult.errors.forEach((error, index) => {
        if (error !== null) {
          this.logger.errorWithStack(
            `Error getting content for ${limitedFiles[index].path} in ${repository.fullName}`,
            error
          );
        }
      });

      if (fileProcessingResult.errorCount > 0) {
        this.logger.info(
          `File processing completed: ${fileProcessingResult.successCount}/${limitedFiles.length} successful, ` +
            `${fileProcessingResult.errorCount} failed`
        );
      }

      return result;
    } catch (error) {
      this.handleError(error, 'findIacFilesInRepository', { repository: repository.fullName });
      return [];
    }
  }

  async findIacFilesForRepository(
    owner: string,
    repo: string,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    try {
      // Check if repository exists and is accessible
      const exists = await this.repositoryExists(owner, repo);
      if (exists !== true) {
        this.logger.info(
          `Repository ${owner}/${repo} doesn't exist, is archived, or is not accessible.`
        );
        return [];
      }

      // Get repository details
      const repoResponse = await this.octokit.repos.get({ owner, repo });
      const repository: VcsRepository = {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        defaultBranch: repoResponse.data.default_branch,
        archived: repoResponse.data.archived,
        private: repoResponse.data.private,
        url: repoResponse.data.html_url,
        cloneUrl: repoResponse.data.clone_url,
      };

      return await this.findIacFilesInRepository(repository, options);
    } catch (error) {
      this.handleError(error, 'findIacFilesForRepository', { owner, repo });
      return [];
    }
  }

  private async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      // The content is base64 encoded
      if ('content' in response.data && response.data.encoding === 'base64') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      } else {
        throw new VcsError(
          'Unexpected response format from GitHub API',
          VcsErrorType.PLATFORM_ERROR,
          VcsPlatform.GITHUB
        );
      }
    } catch (error) {
      this.handleError(error, 'getFileContent', { owner, repo, path });
      return '';
    }
  }

}
