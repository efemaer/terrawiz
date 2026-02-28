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

interface AzureListResponse<T> {
  count: number;
  value: T[];
}

interface AzureProject {
  id: string;
  name: string;
  state?: string;
}

interface AzureRepositoryResponse {
  id: string;
  name: string;
  project?: {
    id?: string;
    name?: string;
  };
  defaultBranch?: string;
  isDisabled?: boolean;
  webUrl: string;
  remoteUrl: string;
}

interface AzureItem {
  path: string;
  isFolder?: boolean;
  gitObjectType?: 'blob' | 'tree' | string;
  objectId?: string;
  size?: number;
}

interface HttpErrorShape {
  response: {
    status: number;
    data?: unknown;
  };
}

export interface AzureDevOpsServiceConfig extends BaseVcsConfig {
  token: string;
  host?: string;
  repoPattern?: string;
  iacFileTypes?: readonly IacFileType[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}

export class AzureDevOpsService extends BaseVcsService {
  private readonly apiBaseUrl: string;
  private readonly authHeader: string;
  private repoPattern: RegExp | null = null;
  private iacFileTypes: readonly IacFileType[];
  private maxConcurrentRepos: number;
  private maxConcurrentFiles: number;

  protected getConcurrencyLimits(): { repos: number; files: number } {
    return {
      repos: this.maxConcurrentRepos,
      files: this.maxConcurrentFiles,
    };
  }

  constructor(config: AzureDevOpsServiceConfig) {
    super({
      platform: config.platform,
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
    });

    const token = config.token || process.env.AZURE_DEVOPS_TOKEN;
    if (!token) {
      throw new VcsError(
        'Azure DevOps token not found. Please provide token in config or set AZURE_DEVOPS_TOKEN environment variable',
        VcsErrorType.INVALID_CONFIGURATION,
        config.platform
      );
    }

    const host = config.host || 'https://dev.azure.com';
    this.apiBaseUrl = host.replace(/\/+$/, '');
    this.authHeader = `Basic ${Buffer.from(`:${token}`, 'utf-8').toString('base64')}`;
    this.iacFileTypes = config.iacFileTypes || ['terraform', 'terragrunt'];
    this.maxConcurrentRepos = config.maxConcurrentRepos || 5;
    this.maxConcurrentFiles = config.maxConcurrentFiles || 10;

    this.initializeLogger();

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

    this.logger.info('Azure DevOps service initialized successfully');
  }

  get platformName(): string {
    if (this.apiBaseUrl === 'https://dev.azure.com') {
      return 'Azure DevOps';
    }
    return `Azure DevOps (${this.apiBaseUrl})`;
  }

  async repositoryExists(owner: string, repo: string): Promise<boolean | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('azure-devops', 'repo-exists', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached !== null;
    }

    try {
      const repository = await this.fetchSingleRepository(owner, repo);
      if (!repository) {
        this.setCachedRepository(cacheKey, null);
        return false;
      }

      if (this.config.skipArchived && repository.archived) {
        this.logger.info(`Skipping disabled repository: ${repository.fullName}`);
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

    const cacheKey = createRepositoryCacheKey('azure-devops', 'single-repo', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const repository = await this.fetchSingleRepository(owner, repo);
      if (!repository) {
        this.setCachedRepository(cacheKey, null);
        return null;
      }

      if (this.config.skipArchived && repository.archived) {
        this.logger.info(`Skipping disabled repository: ${repository.fullName}`);
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
    const scope = this.parseOwnerScope(owner);
    try {
      this.logger.info(`Retrieving repositories for ${owner}...`);

      const repositories: VcsRepository[] = [];
      const maxRepos = filter?.maxRepositories;
      let skippedArchivedCount = 0;
      let skippedPatternCount = 0;
      let reachedLimit = false;

      if (scope.project) {
        const projectRepos = await this.listProjectRepositories(scope.organization, scope.project);
        reachedLimit = this.collectRepositoriesFromProject(
          scope.organization,
          scope.project,
          projectRepos,
          repositories,
          maxRepos,
          value => {
            skippedArchivedCount += value.archived;
            skippedPatternCount += value.pattern;
          }
        );
      } else {
        const projects = await this.listProjects(scope.organization);

        for (const project of projects) {
          const projectRepos = await this.listProjectRepositories(scope.organization, project.name);
          reachedLimit = this.collectRepositoriesFromProject(
            scope.organization,
            project.name,
            projectRepos,
            repositories,
            maxRepos,
            value => {
              skippedArchivedCount += value.archived;
              skippedPatternCount += value.pattern;
            }
          );

          if (reachedLimit) {
            break;
          }
        }
      }

      if (reachedLimit && maxRepos) {
        this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
      }

      this.logger.info(
        `Found ${repositories.length} active repositories for ${owner} (skipped ${skippedArchivedCount} disabled, filtered out ${skippedPatternCount} by pattern)`
      );

      return this.filterRepositories(repositories, filter);
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
      const fileTypes = options?.fileTypes || this.iacFileTypes;
      const scope = this.parseOwnerScope(repository.owner);

      if (!scope.project) {
        throw new VcsError(
          `Azure DevOps repository owner must include project (expected "organization/project", got "${repository.owner}")`,
          VcsErrorType.INVALID_CONFIGURATION,
          this.platform
        );
      }

      const query = new URLSearchParams({
        scopePath: '/',
        recursionLevel: 'Full',
        includeContentMetadata: 'true',
        'versionDescriptor.versionType': 'branch',
        'versionDescriptor.version': repository.defaultBranch,
        'api-version': '7.1',
      });

      const itemsResponse = await this.requestJson<AzureListResponse<AzureItem>>(
        `/${encodeURIComponent(scope.organization)}/${encodeURIComponent(scope.project)}/_apis/git/repositories/${encodeURIComponent(repository.name)}/items?${query.toString()}`
      );

      const iacFiles = itemsResponse.data.value
        .filter(item => {
          const isFolder = item.isFolder === true || item.gitObjectType === 'tree';
          if (isFolder || !item.path) {
            return false;
          }

          const normalizedPath = item.path.replace(/^\/+/, '');
          return this.shouldIncludeFile(normalizedPath, { fileTypes: [...fileTypes], ...options });
        })
        .map(item => {
          const normalizedPath = item.path.replace(/^\/+/, '');
          return {
            path: normalizedPath,
            type: this.getIacFileType(normalizedPath)!,
            objectId: item.objectId,
            size: item.size,
          };
        });

      const limitedFiles = options?.maxFiles ? iacFiles.slice(0, options.maxFiles) : iacFiles;

      if (limitedFiles.length === 0) {
        this.logger.info(`No IaC files found in ${repository.fullName}`);
        return [];
      }

      const concurrency = this.getConcurrencyLimits();
      const fileProcessingResult = await processConcurrentlySettled(
        limitedFiles,
        async file => {
          const content = await this.getFileContent(
            scope.organization,
            scope.project!,
            repository.name,
            repository.defaultBranch,
            file.path
          );

          return {
            type: file.type,
            repository: repository.fullName,
            path: file.path,
            content,
            url: `${repository.url}?path=${encodeURIComponent(`/${file.path}`)}&version=GB${encodeURIComponent(repository.defaultBranch)}`,
            sha: file.objectId,
            size: file.size,
          } as IacFile;
        },
        concurrency.files
      );

      const result: IacFile[] = [];
      for (const fileResult of fileProcessingResult.results) {
        if (fileResult !== null) {
          result.push(fileResult);
        }
      }

      fileProcessingResult.errors.forEach((error, index) => {
        if (error !== null) {
          this.logger.errorWithStack(
            `Error getting content for ${limitedFiles[index].path} in ${repository.fullName}`,
            error
          );
        }
      });

      return result;
    } catch (error) {
      this.handleError(error, 'findIacFilesInRepository', { repository: repository.fullName });
      return [];
    }
  }

  private parseOwnerScope(owner: string): { organization: string; project?: string } {
    const parts = owner.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new VcsError(
        'Organization is required for Azure DevOps',
        VcsErrorType.INVALID_CONFIGURATION,
        this.platform
      );
    }

    return {
      organization: parts[0],
      project: parts.length > 1 ? parts.slice(1).join('/') : undefined,
    };
  }

  private resolveRepositoryTarget(
    owner: string,
    repo?: string
  ): { organization: string; project?: string; repositoryName?: string } {
    const scope = this.parseOwnerScope(owner);
    if (!repo) {
      return scope;
    }

    if (scope.project) {
      return {
        organization: scope.organization,
        project: scope.project,
        repositoryName: repo,
      };
    }

    const repoParts = repo.split('/').filter(Boolean);
    if (repoParts.length > 1) {
      return {
        organization: scope.organization,
        project: repoParts[0],
        repositoryName: repoParts.slice(1).join('/'),
      };
    }

    return {
      organization: scope.organization,
      repositoryName: repo,
    };
  }

  private async fetchSingleRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    const target = this.resolveRepositoryTarget(owner, repo);
    if (!target.repositoryName) {
      return null;
    }

    if (target.project) {
      const repository = await this.getRepositoryInProject(
        target.organization,
        target.project,
        target.repositoryName
      );
      return repository;
    }

    const projects = await this.listProjects(target.organization);
    for (const project of projects) {
      const repository = await this.getRepositoryInProject(
        target.organization,
        project.name,
        target.repositoryName
      );
      if (repository) {
        return repository;
      }
    }

    return null;
  }

  private async getRepositoryInProject(
    organization: string,
    project: string,
    repositoryName: string
  ): Promise<VcsRepository | null> {
    const repositories = await this.listProjectRepositories(organization, project);
    const normalizedName = repositoryName.toLowerCase();
    const repository = repositories.find(
      repo => repo.name.toLowerCase() === normalizedName || repo.id.toLowerCase() === normalizedName
    );

    if (!repository) {
      return null;
    }

    return this.mapRepository(organization, project, repository);
  }

  private collectRepositoriesFromProject(
    organization: string,
    project: string,
    projectRepos: AzureRepositoryResponse[],
    repositories: VcsRepository[],
    maxRepos: number | undefined,
    onSkipped: (value: { archived: number; pattern: number }) => void
  ): boolean {
    for (const projectRepo of projectRepos) {
      const repository = this.mapRepository(organization, project, projectRepo);

      if (this.processedRepoCache.has(repository.fullName)) {
        continue;
      }
      this.processedRepoCache.add(repository.fullName);

      if (this.config.skipArchived && repository.archived) {
        onSkipped({ archived: 1, pattern: 0 });
        continue;
      }

      if (this.repoPattern && !this.repoPattern.test(repository.name)) {
        onSkipped({ archived: 0, pattern: 1 });
        continue;
      }

      repositories.push(repository);

      if (maxRepos && repositories.length >= maxRepos) {
        return true;
      }
    }

    return false;
  }

  private mapRepository(
    organization: string,
    project: string,
    repository: AzureRepositoryResponse
  ): VcsRepository {
    const defaultBranch = repository.defaultBranch?.replace(/^refs\/heads\//, '') || 'main';
    const owner = `${organization}/${project}`;
    return {
      owner,
      name: repository.name,
      fullName: `${owner}/${repository.name}`,
      defaultBranch,
      archived: repository.isDisabled === true,
      private: true,
      url: repository.webUrl,
      cloneUrl: repository.remoteUrl,
    };
  }

  private async listProjects(organization: string): Promise<AzureProject[]> {
    const projects: AzureProject[] = [];
    let continuationToken: string | null = null;

    do {
      const query = new URLSearchParams({
        'api-version': '7.1-preview.4',
        $top: String(API_DEFAULTS.AZURE_DEVOPS_PAGE_SIZE),
      });

      if (continuationToken) {
        query.append('continuationToken', continuationToken);
      }

      const response = await this.requestJson<AzureListResponse<AzureProject>>(
        `/${encodeURIComponent(organization)}/_apis/projects?${query.toString()}`
      );

      for (const project of response.data.value) {
        if (project.state !== 'deleting') {
          projects.push(project);
        }
      }

      continuationToken = response.headers.get('x-ms-continuationtoken');
    } while (continuationToken);

    return projects;
  }

  private async listProjectRepositories(
    organization: string,
    project: string
  ): Promise<AzureRepositoryResponse[]> {
    const query = new URLSearchParams({
      'api-version': '7.1',
    });

    const response = await this.requestJson<AzureListResponse<AzureRepositoryResponse>>(
      `/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories?${query.toString()}`
    );

    return response.data.value;
  }

  private async getFileContent(
    organization: string,
    project: string,
    repository: string,
    branch: string,
    filePath: string
  ): Promise<string> {
    const query = new URLSearchParams({
      path: `/${filePath}`,
      'versionDescriptor.versionType': 'branch',
      'versionDescriptor.version': branch,
      $format: 'text',
      'api-version': '7.1',
    });

    return this.requestText(
      `/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}/items?${query.toString()}`
    );
  }

  private async requestJson<T>(
    pathOrUrl: string
  ): Promise<{ data: T; headers: Headers; status: number }> {
    const response = await this.request(pathOrUrl, 'application/json');
    const data = (await response.json()) as T;
    return {
      data,
      headers: response.headers,
      status: response.status,
    };
  }

  private async requestText(pathOrUrl: string): Promise<string> {
    const response = await this.request(pathOrUrl, 'text/plain');
    return response.text();
  }

  private async request(pathOrUrl: string, accept: string): Promise<Response> {
    const url = this.resolveUrl(pathOrUrl);
    const response = await this.executeWithRetry(
      () =>
        fetch(url, {
          method: 'GET',
          headers: {
            Authorization: this.authHeader,
            Accept: accept,
          },
        }),
      `Azure DevOps API request: ${url}`
    );

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    return response;
  }

  private resolveUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }

    return `${this.apiBaseUrl}${pathOrUrl}`;
  }

  private async createHttpError(response: Response): Promise<Error & HttpErrorShape> {
    let errorPayload: unknown = undefined;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        errorPayload = await response.json();
      } else {
        errorPayload = await response.text();
      }
    } catch {
      errorPayload = undefined;
    }

    let message = `Azure DevOps API request failed with status ${response.status}`;
    if (errorPayload && typeof errorPayload === 'object' && 'message' in errorPayload) {
      message = String((errorPayload as { message: unknown }).message);
    } else if (typeof errorPayload === 'string' && errorPayload.trim().length > 0) {
      message = errorPayload;
    }

    const error = new Error(message) as Error & HttpErrorShape;
    error.response = {
      status: response.status,
      data: errorPayload,
    };
    return error;
  }
}
