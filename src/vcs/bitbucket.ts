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
import { createRepositoryCacheKey } from '../utils/repository-mapper';
import { API_DEFAULTS } from '../constants';

dotenv.config({ quiet: true });

interface BitbucketCloneLink {
  name?: string;
  href: string;
}

interface BitbucketCloudRepositoryResponse {
  name: string;
  slug: string;
  full_name: string;
  mainbranch?: {
    name?: string;
  };
  is_private: boolean;
  links?: {
    html?: { href: string };
    clone?: BitbucketCloneLink[];
  };
}

interface BitbucketServerRepositoryResponse {
  name: string;
  slug: string;
  archived?: boolean;
  public?: boolean;
  defaultBranch?: {
    id?: string;
    displayId?: string;
  };
  links?: {
    self?: Array<{ href: string }>;
    clone?: BitbucketCloneLink[];
  };
}

interface BitbucketCloudSourceEntry {
  path?: string;
  type?: 'commit_file' | 'commit_directory' | string;
  size?: number;
}

interface BitbucketCloudPaginatedResponse<T> {
  values: T[];
  next?: string;
}

interface BitbucketServerPaginatedResponse<T> {
  values: T[];
  isLastPage: boolean;
  nextPageStart?: number;
}

interface HttpErrorShape {
  response: {
    status: number;
    data?: unknown;
  };
}

export interface BitbucketServiceConfig extends BaseVcsConfig {
  token: string;
  host?: string;
  repoPattern?: string;
  iacFileTypes?: readonly IacFileType[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}

export class BitbucketService extends BaseVcsService {
  private readonly apiBaseUrl: string;
  private readonly uiBaseUrl: string;
  private readonly isSelfHosted: boolean;
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

  constructor(config: BitbucketServiceConfig) {
    super({
      platform: config.platform,
      debug: config.debug,
      skipArchived: config.skipArchived,
      maxRetries: config.maxRetries,
      cacheEnabled: config.cacheEnabled,
    });

    const token = config.token || process.env.BITBUCKET_TOKEN;
    if (!token) {
      throw new VcsError(
        'Bitbucket token not found. Please provide token in config or set BITBUCKET_TOKEN environment variable',
        VcsErrorType.INVALID_CONFIGURATION,
        config.platform
      );
    }

    this.isSelfHosted = config.platform === VcsPlatform.BITBUCKET_SELF_HOSTED;
    const normalizedHost = this.resolveHost(config.host);
    this.uiBaseUrl = normalizedHost;
    this.apiBaseUrl = this.isSelfHosted
      ? `${normalizedHost}/rest/api/latest`
      : `${normalizedHost}/2.0`;

    this.authHeader = token.includes(':')
      ? `Basic ${Buffer.from(token, 'utf-8').toString('base64')}`
      : `Bearer ${token}`;
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

    this.logger.info('Bitbucket service initialized successfully');
  }

  get platformName(): string {
    if (this.isSelfHosted) {
      return `Bitbucket Self-Hosted (${this.uiBaseUrl})`;
    }
    if (this.apiBaseUrl === 'https://api.bitbucket.org/2.0') {
      return 'Bitbucket';
    }
    return `Bitbucket (${this.apiBaseUrl})`;
  }

  async repositoryExists(owner: string, repo: string): Promise<boolean | null> {
    this.validateOwnerAndRepo(owner, repo);

    const cacheKey = createRepositoryCacheKey('bitbucket', 'repo-exists', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached !== null;
    }

    try {
      const repository = await this.getRepository(owner, repo);
      if (!repository) {
        this.setCachedRepository(cacheKey, null);
        return false;
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

    const cacheKey = createRepositoryCacheKey('bitbucket', 'single-repo', owner, repo);
    const cached = this.getCachedRepository(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const repository = await this.getRepository(owner, repo);
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
    return this.isSelfHosted
      ? this.getRepositoriesSelfHosted(owner, filter)
      : this.getRepositoriesCloud(owner, filter);
  }

  async findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    try {
      this.logger.info(`Getting IaC files from ${repository.fullName}...`);
      const fileTypes = options?.fileTypes || this.iacFileTypes;

      const allFiles = this.isSelfHosted
        ? await this.listRepositoryFilesSelfHosted(
            repository.owner,
            repository.name,
            repository.defaultBranch
          )
        : await this.listRepositoryFilesCloud(
            repository.owner,
            repository.name,
            repository.defaultBranch
          );

      const iacFiles = allFiles
        .filter(file => {
          return this.shouldIncludeFile(file.path, { fileTypes: [...fileTypes], ...options });
        })
        .map(file => ({
          path: file.path,
          type: this.getIacFileType(file.path)!,
          size: file.size,
        }));

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
            repository.owner,
            repository.name,
            repository.defaultBranch,
            file.path
          );

          return {
            type: file.type,
            repository: repository.fullName,
            path: file.path,
            content,
            url: this.buildFileUrl(repository, file.path),
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

  private async getRepositoriesCloud(
    owner: string,
    filter?: VcsRepositoryFilter
  ): Promise<VcsRepository[]> {
    try {
      this.logger.info(`Retrieving repositories for ${owner}...`);

      const repositories: VcsRepository[] = [];
      const maxRepos = filter?.maxRepositories;
      let skippedPatternCount = 0;
      let nextUrl: string | null =
        `/repositories/${encodeURIComponent(owner)}?pagelen=${API_DEFAULTS.BITBUCKET_PER_PAGE}`;

      while (nextUrl) {
        const pageResponse: {
          data: BitbucketCloudPaginatedResponse<BitbucketCloudRepositoryResponse>;
          headers: Headers;
          status: number;
        } =
          await this.requestJson<BitbucketCloudPaginatedResponse<BitbucketCloudRepositoryResponse>>(
            nextUrl
          );

        for (const repo of pageResponse.data.values) {
          const mapped = this.mapCloudRepository(owner, repo);

          if (this.processedRepoCache.has(mapped.fullName)) {
            continue;
          }
          this.processedRepoCache.add(mapped.fullName);

          if (this.repoPattern && !this.repoPattern.test(mapped.name)) {
            skippedPatternCount++;
            continue;
          }

          repositories.push(mapped);

          if (maxRepos && repositories.length >= maxRepos) {
            this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
            nextUrl = null;
            break;
          }
        }

        if (nextUrl !== null) {
          nextUrl = pageResponse.data.next || null;
        }
      }

      this.logger.info(
        `Found ${repositories.length} active repositories for ${owner} (filtered out ${skippedPatternCount} by pattern)`
      );

      return this.filterRepositories(repositories, filter);
    } catch (error) {
      this.handleError(error, 'getRepositories', { owner });
      return [];
    }
  }

  private async getRepositoriesSelfHosted(
    owner: string,
    filter?: VcsRepositoryFilter
  ): Promise<VcsRepository[]> {
    try {
      this.logger.info(`Retrieving repositories for project ${owner}...`);

      const repositories: VcsRepository[] = [];
      const maxRepos = filter?.maxRepositories;
      let skippedPatternCount = 0;
      let start = 0;
      let isLastPage = false;

      while (!isLastPage) {
        const query = new URLSearchParams({
          limit: String(API_DEFAULTS.BITBUCKET_PER_PAGE),
          start: String(start),
        });

        const pageResponse = await this.requestJson<
          BitbucketServerPaginatedResponse<BitbucketServerRepositoryResponse>
        >(`/projects/${encodeURIComponent(owner)}/repos?${query.toString()}`);

        for (const repo of pageResponse.data.values) {
          const mapped = this.mapSelfHostedRepository(owner, repo);

          if (this.processedRepoCache.has(mapped.fullName)) {
            continue;
          }
          this.processedRepoCache.add(mapped.fullName);

          if (this.repoPattern && !this.repoPattern.test(mapped.name)) {
            skippedPatternCount++;
            continue;
          }

          repositories.push(mapped);

          if (maxRepos && repositories.length >= maxRepos) {
            this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
            isLastPage = true;
            break;
          }
        }

        if (!isLastPage) {
          isLastPage = pageResponse.data.isLastPage;
          start = pageResponse.data.nextPageStart ?? start + API_DEFAULTS.BITBUCKET_PER_PAGE;
        }
      }

      this.logger.info(
        `Found ${repositories.length} active repositories for project ${owner} (filtered out ${skippedPatternCount} by pattern)`
      );

      return this.filterRepositories(repositories, filter);
    } catch (error) {
      this.handleError(error, 'getRepositories', { owner });
      return [];
    }
  }

  private async getRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    return this.isSelfHosted
      ? this.getSelfHostedRepository(owner, repo)
      : this.getCloudRepository(owner, repo);
  }

  private async getCloudRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    const response = await this.requestJson<BitbucketCloudRepositoryResponse>(
      `/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    return this.mapCloudRepository(owner, response.data);
  }

  private async getSelfHostedRepository(
    owner: string,
    repo: string
  ): Promise<VcsRepository | null> {
    const response = await this.requestJson<BitbucketServerRepositoryResponse>(
      `/projects/${encodeURIComponent(owner)}/repos/${encodeURIComponent(repo)}`
    );
    return this.mapSelfHostedRepository(owner, response.data);
  }

  private mapCloudRepository(
    owner: string,
    repository: BitbucketCloudRepositoryResponse
  ): VcsRepository {
    const fullName = repository.full_name || `${owner}/${repository.slug || repository.name}`;
    const cloneUrl =
      repository.links?.clone?.find(link => link.name === 'https')?.href ||
      repository.links?.clone?.[0]?.href ||
      `https://bitbucket.org/${fullName}.git`;

    const webUrl = repository.links?.html?.href || `https://bitbucket.org/${fullName}`;

    return {
      owner,
      name: repository.slug || repository.name,
      fullName,
      defaultBranch: repository.mainbranch?.name || 'main',
      archived: false,
      private: repository.is_private,
      url: webUrl,
      cloneUrl,
    };
  }

  private mapSelfHostedRepository(
    projectKey: string,
    repository: BitbucketServerRepositoryResponse
  ): VcsRepository {
    const name = repository.slug || repository.name;
    const fullName = `${projectKey}/${name}`;
    const defaultBranch =
      repository.defaultBranch?.displayId ||
      repository.defaultBranch?.id?.replace(/^refs\/heads\//, '') ||
      'main';

    const cloneUrl =
      repository.links?.clone?.find(link => link.name === 'http' || link.name === 'https')?.href ||
      repository.links?.clone?.[0]?.href ||
      `${this.uiBaseUrl}/scm/${projectKey.toLowerCase()}/${name}.git`;

    const selfLink = repository.links?.self?.[0]?.href;
    const webUrl = (selfLink || `${this.uiBaseUrl}/projects/${projectKey}/repos/${name}`).replace(
      /\/browse\/?$/,
      ''
    );

    return {
      owner: projectKey,
      name,
      fullName,
      defaultBranch,
      archived: repository.archived === true,
      private: repository.public !== true,
      url: webUrl,
      cloneUrl,
    };
  }

  private async listRepositoryFilesCloud(
    workspace: string,
    repo: string,
    branch: string
  ): Promise<Array<{ path: string; size?: number }>> {
    const files: Array<{ path: string; size?: number }> = [];
    const directories: string[] = [''];

    while (directories.length > 0) {
      const currentDirectory = directories.shift() as string;
      let nextUrl: string | null =
        `${this.buildCloudSourcePath(workspace, repo, branch, currentDirectory)}?pagelen=${API_DEFAULTS.BITBUCKET_PER_PAGE}`;

      while (nextUrl) {
        const pageResponse: {
          data: BitbucketCloudPaginatedResponse<BitbucketCloudSourceEntry>;
          headers: Headers;
          status: number;
        } =
          await this.requestJson<BitbucketCloudPaginatedResponse<BitbucketCloudSourceEntry>>(
            nextUrl
          );

        for (const entry of pageResponse.data.values) {
          if (!entry.path || !entry.type) {
            continue;
          }

          if (entry.type === 'commit_directory') {
            directories.push(entry.path);
          } else if (entry.type === 'commit_file') {
            files.push({ path: entry.path, size: entry.size });
          }
        }

        nextUrl = pageResponse.data.next || null;
      }
    }

    return files;
  }

  private async listRepositoryFilesSelfHosted(
    projectKey: string,
    repo: string,
    branch: string
  ): Promise<Array<{ path: string; size?: number }>> {
    const files: Array<{ path: string; size?: number }> = [];
    let start = 0;
    let isLastPage = false;

    while (!isLastPage) {
      const query = new URLSearchParams({
        at: `refs/heads/${branch}`,
        limit: String(API_DEFAULTS.BITBUCKET_PER_PAGE),
        start: String(start),
      });

      const pageResponse = await this.requestJson<BitbucketServerPaginatedResponse<string>>(
        `/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repo)}/files?${query.toString()}`
      );

      for (const filePath of pageResponse.data.values) {
        if (typeof filePath === 'string' && filePath.length > 0) {
          files.push({ path: filePath });
        }
      }

      isLastPage = pageResponse.data.isLastPage;
      start = pageResponse.data.nextPageStart ?? start + API_DEFAULTS.BITBUCKET_PER_PAGE;
    }

    return files;
  }

  private async getFileContent(
    owner: string,
    repo: string,
    branch: string,
    filePath: string
  ): Promise<string> {
    if (this.isSelfHosted) {
      return this.getSelfHostedFileContent(owner, repo, branch, filePath);
    }
    return this.getCloudFileContent(owner, repo, branch, filePath);
  }

  private async getCloudFileContent(
    workspace: string,
    repo: string,
    branch: string,
    filePath: string
  ): Promise<string> {
    const path = this.buildCloudSourcePath(workspace, repo, branch, filePath);
    return this.requestText(path);
  }

  private async getSelfHostedFileContent(
    projectKey: string,
    repo: string,
    branch: string,
    filePath: string
  ): Promise<string> {
    const encodedPath = this.encodePath(filePath);
    const query = new URLSearchParams({
      at: `refs/heads/${branch}`,
    });

    return this.requestText(
      `/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repo)}/raw/${encodedPath}?${query.toString()}`
    );
  }

  private buildCloudSourcePath(
    workspace: string,
    repo: string,
    branch: string,
    path?: string
  ): string {
    const encodedBranch = encodeURIComponent(branch);
    const encodedPath = path ? `/${this.encodePath(path)}` : '';
    return `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/src/${encodedBranch}${encodedPath}`;
  }

  private buildFileUrl(repository: VcsRepository, filePath: string): string {
    if (this.isSelfHosted) {
      return `${repository.url}/browse/${this.encodePath(filePath)}?at=refs/heads/${encodeURIComponent(repository.defaultBranch)}`;
    }
    return `${repository.url}/src/${encodeURIComponent(repository.defaultBranch)}/${this.encodePath(filePath)}`;
  }

  private encodePath(path: string): string {
    return path
      .split('/')
      .filter(segment => segment.length > 0)
      .map(segment => encodeURIComponent(segment))
      .join('/');
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
    const response = await this.request(pathOrUrl, '*/*');
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
      `Bitbucket API request: ${url}`
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

  private resolveHost(configHost?: string): string {
    if (this.isSelfHosted) {
      const host = configHost || process.env.BITBUCKET_HOST;
      if (!host) {
        throw new VcsError(
          'Bitbucket self-hosted requires a host URL (use bitbucket://host/... source format or set BITBUCKET_HOST)',
          VcsErrorType.INVALID_CONFIGURATION,
          this.platform
        );
      }
      return host.replace(/\/+$/, '');
    }

    return (configHost || 'https://api.bitbucket.org').replace(/\/+$/, '');
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

    let message = `Bitbucket API request failed with status ${response.status}`;
    if (errorPayload && typeof errorPayload === 'object') {
      if ('errors' in errorPayload) {
        const errors = (errorPayload as { errors: Array<{ message?: string }> }).errors;
        if (Array.isArray(errors) && errors.length > 0 && errors[0]?.message) {
          message = errors[0].message;
        }
      } else if ('error' in errorPayload) {
        const nested = (errorPayload as { error: unknown }).error;
        if (nested && typeof nested === 'object' && 'message' in nested) {
          message = String((nested as { message: unknown }).message);
        }
      } else if ('message' in errorPayload) {
        message = String((errorPayload as { message: unknown }).message);
      }
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
