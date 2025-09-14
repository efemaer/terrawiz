import { Gitlab } from '@gitbeaker/rest';
import * as dotenv from 'dotenv';
import { BaseVcsService, BaseVcsConfig } from './base';
import {
  IacFile,
  IacFileType,
  VcsRepository,
  VcsRepositoryFilter,
  VcsFileDiscoveryOptions,
  VcsError,
  VcsErrorType,
} from '../types';
import { processConcurrentlySettled } from '../utils/concurrent';
import { isNotFoundError } from '../utils/error-handler';
import { createRepositoryCacheKey } from '../utils/repository-mapper';
import { API_DEFAULTS } from '../constants';

dotenv.config({ quiet: true });

interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  default_branch: string;
  archived: boolean;
  visibility: 'private' | 'internal' | 'public';
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  namespace: {
    name: string;
    path: string;
  };
}

interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

export interface GitLabServiceConfig extends BaseVcsConfig {
  token: string;
  host?: string;
  useRateLimit?: boolean;
  repoPattern?: string;
  iacFileTypes?: readonly IacFileType[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}
export class GitLabService extends BaseVcsService {
  private gitlab!: InstanceType<typeof Gitlab>;
  private useRateLimit: boolean;
  private repoPattern: RegExp | null = null;
  private iacFileTypes: readonly IacFileType[];
  private maxConcurrentRepos: number;
  private maxConcurrentFiles: number;
  private host?: string;

  /**
   * Get concurrency limits for parallel processing
   */
  protected getConcurrencyLimits(): { repos: number; files: number } {
    return {
      repos: this.maxConcurrentRepos,
      files: this.maxConcurrentFiles,
    };
  }

  constructor(config: GitLabServiceConfig) {
    super({
      platform: config.platform,
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

    // Validate GitLab token
    const token = config.token || process.env.GITLAB_TOKEN;
    if (!token) {
      throw new VcsError(
        'GitLab token not found. Please provide token in config or set GITLAB_TOKEN environment variable',
        VcsErrorType.INVALID_CONFIGURATION,
        config.platform
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
          config.platform,
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }

    this.initializeGitlab(token);
    this.logger.info('GitLab service initialized successfully');
  }

  get platformName(): string {
    return this.host ? `GitLab (${this.host})` : 'GitLab';
  }

  /**
   * Initialize GitLab client with appropriate configuration
   */
  private initializeGitlab(token: string): void {
    const gitlabConfig: ConstructorParameters<typeof Gitlab>[0] = {
      token,
    };

    if (this.host) {
      gitlabConfig.host = this.host;
    }

    this.gitlab = new Gitlab(gitlabConfig);
    this.logger.debug(
      `GitLab service initialized${this.host ? ` with custom host: ${this.host}` : ''}`
    );
  }

  /**
   * Check if a repository exists and is accessible
   * @param owner Repository owner/group
   * @param repo Repository name
   * @returns true if exists, false if not, null if archived and skipping archived
   */
  async repositoryExists(owner: string, repo: string): Promise<boolean | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('gitlab', 'repo-exists', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached !== null;
    }

    try {
      const projectPath = `${owner}/${repo}`;
      const project = await this.gitlab.Projects.show(projectPath);

      const repository: VcsRepository = {
        owner: String(project.namespace.path),
        name: String(project.path || project.name),
        fullName: String(project.path_with_namespace),
        defaultBranch: String(project.default_branch || 'main'),
        archived: Boolean(project.archived),
        private: project.visibility !== 'public',
        url: String(project.web_url),
        cloneUrl: String(project.http_url_to_repo),
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

  /**
   * Get a single repository by owner and name
   * @param owner Repository owner/group
   * @param repo Repository name
   * @returns Repository object or null if not found/archived
   */
  async getSingleRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('gitlab', 'single-repo', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      this.logger.info(`Retrieving repository ${owner}/${repo}...`);

      const projectPath = `${owner}/${repo}`;
      const project = await this.gitlab.Projects.show(projectPath);

      const repository: VcsRepository = {
        owner: String(project.namespace.path),
        name: String(project.path || project.name),
        fullName: String(project.path_with_namespace),
        defaultBranch: String(project.default_branch || 'main'),
        archived: Boolean(project.archived),
        private: project.visibility !== 'public',
        url: String(project.web_url),
        cloneUrl: String(project.http_url_to_repo),
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

  /**
   * Get all repositories for a group or user
   * @param owner Group or user name
   * @param filter Optional filtering criteria
   */
  async getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]> {
    try {
      this.logger.info(`Retrieving repositories for ${owner}...`);

      const repositories: VcsRepository[] = [];
      const maxRepos = filter?.maxRepositories;
      let skippedArchivedCount = 0;
      let skippedPatternCount = 0;

      // Determine if this is a group or user by trying to get group first
      let isGroup = true;
      try {
        await this.gitlab.Groups.show(owner);
      } catch {
        isGroup = false;
        this.logger.info(`${owner} is not a group, treating as a user`);
      }

      // Get projects - use the Projects API to list projects
      // Note: We get all projects and filter them client-side since the API
      // pagination parameters are complex and vary by GitLab version
      const allProjects = (await this.gitlab.Projects.all({
        maxPages: API_DEFAULTS.GITLAB_MAX_PAGES, // Limit to prevent excessive API calls
        perPage: API_DEFAULTS.GITLAB_PER_PAGE,
      })) as GitLabProject[];

      // Filter projects by ownership (group or user)
      const projects = allProjects.filter(project => {
        if (isGroup) {
          // For groups, check if the project belongs to the group
          return (
            project.namespace.path === owner || project.path_with_namespace.startsWith(`${owner}/`)
          );
        } else {
          // For users, check if the project belongs to the user
          return project.namespace.path === owner;
        }
      });

      this.logger.info(`Found ${projects.length} total projects for ${owner}`);

      // Filter repositories based on criteria
      for (const project of projects) {
        // Skip if already processed (avoids duplicate logging)
        if (this.processedRepoCache.has(project.path_with_namespace)) {
          continue;
        }

        // Mark as processed
        this.processedRepoCache.add(project.path_with_namespace);

        // Skip archived repositories if configured
        if (this.config.skipArchived && project.archived) {
          skippedArchivedCount++;
          this.logger.debug(`Skipping archived repository: ${project.path_with_namespace}`);
          continue;
        }

        // Filter by repository name pattern if specified
        if (this.repoPattern && !this.repoPattern.test(project.path)) {
          skippedPatternCount++;
          this.logger.debug(`Repository ${project.path} doesn't match pattern ${this.repoPattern}`);
          continue;
        }

        const repository: VcsRepository = {
          owner: String(project.namespace.path),
          name: String(project.path),
          fullName: String(project.path_with_namespace),
          defaultBranch: String(project.default_branch || 'main'),
          archived: Boolean(project.archived),
          private: project.visibility !== 'public',
          url: String(project.web_url),
          cloneUrl: String(project.http_url_to_repo),
        };

        repositories.push(repository);

        // Check if we've reached the maximum
        if (maxRepos && repositories.length >= maxRepos) {
          this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
          break;
        }
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

  /**
   * Find all IaC files in a repository
   * @param repository Repository information
   * @param options File discovery options
   */
  async findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    try {
      this.logger.info(`Getting IaC files from ${repository.fullName}...`);

      // Use configured file types or options
      const fileTypes = options?.fileTypes || this.iacFileTypes;

      // Get the repository tree recursively
      const tree = (await this.gitlab.Repositories.allRepositoryTrees(repository.fullName, {
        recursive: true,
        ref: repository.defaultBranch,
      })) as GitLabTreeItem[];

      // Filter for IaC files based on options
      const iacFiles: { path: string; id: string; type: IacFileType }[] = tree
        .filter((item: GitLabTreeItem) => {
          if (item.type !== 'blob' || !item.path) {
            return false;
          }

          return this.shouldIncludeFile(item.path, { fileTypes: [...fileTypes], ...options });
        })
        .map((item: GitLabTreeItem) => {
          const fileType = this.getIacFileType(item.path)!;
          return {
            path: item.path,
            id: item.id,
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

          const content = await this.getFileContent(repository.fullName, file.path);
          const url = `${repository.url}/-/blob/${repository.defaultBranch}/${file.path}`;

          return {
            type: file.type,
            repository: repository.fullName,
            path: file.path,
            content,
            url,
            sha: file.id,
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

  /**
   * Get content of a file from GitLab
   * @param projectPath Project path (owner/repo)
   * @param path File path
   */
  private async getFileContent(projectPath: string, path: string): Promise<string> {
    try {
      const file = await this.gitlab.RepositoryFiles.show(projectPath, path, 'HEAD');

      // The content is base64 encoded
      if (file.encoding === 'base64' && file.content) {
        return Buffer.from(file.content, 'base64').toString('utf-8');
      } else if (typeof file.content === 'string') {
        return file.content;
      } else {
        throw new VcsError(
          'Unexpected response format from GitLab API',
          VcsErrorType.PLATFORM_ERROR,
          this.config.platform
        );
      }
    } catch (error) {
      this.handleError(error, 'getFileContent', { projectPath, path });
      return '';
    }
  }

}
