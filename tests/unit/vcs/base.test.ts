import { BaseVcsService } from '../../../src/vcs/base';
import {
  VcsPlatform,
  VcsRepository,
  VcsRepositoryFilter,
  VcsFileDiscoveryOptions,
  IacFile,
  VcsError,
  VcsErrorType,
} from '../../../src/types';

// Create a concrete implementation for testing
class TestVcsService extends BaseVcsService {
  private mockRepositories: VcsRepository[] = [];
  private mockFiles: IacFile[] = [];
  private shouldThrowError = false;
  private errorToThrow: Error | null = null;

  constructor(mockRepos: VcsRepository[] = [], mockFiles: IacFile[] = []) {
    super({
      platform: VcsPlatform.GITHUB,
      debug: false,
      cacheEnabled: true,
    });
    this.mockRepositories = mockRepos;
    this.mockFiles = mockFiles;
    this.initializeLogger();
  }

  get platformName(): string {
    return 'Test Platform';
  }

  setError(error: Error) {
    this.shouldThrowError = true;
    this.errorToThrow = error;
  }

  clearError() {
    this.shouldThrowError = false;
    this.errorToThrow = null;
  }

  async repositoryExists(owner: string, name: string): Promise<boolean | null> {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }
    return this.mockRepositories.some(repo => repo.owner === owner && repo.name === name);
  }

  async getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]> {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }

    const filtered = this.mockRepositories.filter(repo => repo.owner === owner);
    return this.filterRepositories(filtered, filter);
  }

  async getSingleRepository(owner: string, repo: string): Promise<VcsRepository | null> {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }

    return this.mockRepositories.find(r => r.owner === owner && r.name === repo) || null;
  }

  async findIacFilesInRepository(
    repository: VcsRepository,
    _options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }

    return this.mockFiles.filter(file => file.repository === repository.name);
  }
}

describe('BaseVcsService', () => {
  let mockRepositories: VcsRepository[];
  let mockFiles: IacFile[];
  let service: TestVcsService;

  beforeEach(() => {
    mockRepositories = [
      {
        owner: 'testorg',
        name: 'repo1',
        fullName: 'testorg/repo1',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://example.com/testorg/repo1',
        cloneUrl: 'https://example.com/testorg/repo1.git',
      },
      {
        owner: 'testorg',
        name: 'repo2',
        fullName: 'testorg/repo2',
        defaultBranch: 'main',
        archived: true,
        private: true,
        url: 'https://example.com/testorg/repo2',
        cloneUrl: 'https://example.com/testorg/repo2.git',
      },
      {
        owner: 'testorg',
        name: 'test-repo',
        fullName: 'testorg/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://example.com/testorg/test-repo',
        cloneUrl: 'https://example.com/testorg/test-repo.git',
      },
      {
        owner: 'testorg',
        name: 'private-repo',
        fullName: 'testorg/private-repo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://example.com/testorg/private-repo',
        cloneUrl: 'https://example.com/testorg/private-repo.git',
      },
    ];

    mockFiles = [
      {
        type: 'terraform',
        repository: 'repo1',
        path: 'main.tf',
        content: 'terraform content',
        url: 'https://example.com/file1',
      },
      {
        type: 'terragrunt',
        repository: 'repo1',
        path: 'terragrunt.hcl',
        content: 'terragrunt content',
        url: 'https://example.com/file2',
      },
      {
        type: 'terraform',
        repository: 'repo2',
        path: 'main.tf',
        content: 'terraform content 2',
        url: 'https://example.com/file3',
      },
    ];

    service = new TestVcsService(mockRepositories, mockFiles);
  });

  describe('constructor and initialization', () => {
    it('should initialize with platform configuration', () => {
      expect(service.platformName).toBe('Test Platform');
    });

    it('should initialize logger correctly', () => {
      expect((service as any).logger).toBeDefined();
    });
  });

  describe('filterRepositories', () => {
    it('should return all repositories when no filter provided', () => {
      const filtered = (service as any).filterRepositories(mockRepositories);
      expect(filtered).toEqual(mockRepositories);
    });

    it('should filter out archived repositories by default', () => {
      const filter: VcsRepositoryFilter = { skipArchived: true };
      const filtered = (service as any).filterRepositories(mockRepositories, filter);

      expect(filtered).toHaveLength(3); // repo1, test-repo, private-repo (all non-archived)
      expect(filtered.every((repo: VcsRepository) => !repo.archived)).toBe(true);
    });

    it('should include archived repositories when skipArchived is false', () => {
      const filter: VcsRepositoryFilter = { skipArchived: false };
      const filtered = (service as any).filterRepositories(mockRepositories, filter);

      expect(filtered).toHaveLength(4); // All repositories including archived repo2
    });

    it('should filter by name pattern', () => {
      const filter: VcsRepositoryFilter = { namePattern: /^test-/ };
      const filtered = (service as any).filterRepositories(mockRepositories, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('test-repo');
    });

    it('should filter by visibility', () => {
      const privateFilter: VcsRepositoryFilter = { visibility: 'private' };
      const privateFiltered = (service as any).filterRepositories(mockRepositories, privateFilter);
      expect(privateFiltered).toHaveLength(1); // repo2 is private
      expect(privateFiltered[0].private).toBe(true);
      expect(privateFiltered[0].name).toBe('private-repo');

      const publicFilter: VcsRepositoryFilter = { visibility: 'public' };
      const publicFiltered = (service as any).filterRepositories(mockRepositories, publicFilter);
      expect(publicFiltered).toHaveLength(2); // repo1 and test-repo are public (repo2 is archived, private-repo is private)
      expect(publicFiltered.every((repo: VcsRepository) => !repo.private)).toBe(true);
    });

    it('should apply maxRepositories limit', () => {
      const filter: VcsRepositoryFilter = { maxRepositories: 1 };
      const filtered = (service as any).filterRepositories(mockRepositories, filter);

      expect(filtered).toHaveLength(1);
    });

    it('should apply multiple filters', () => {
      const filter: VcsRepositoryFilter = {
        skipArchived: true,
        namePattern: /repo/,
        maxRepositories: 1,
      };
      const filtered = (service as any).filterRepositories(mockRepositories, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].archived).toBe(false);
      expect(filtered[0].name).toMatch(/repo/);
    });
  });

  describe('getIacFileType', () => {
    it('should identify terraform files', () => {
      expect((service as any).getIacFileType('main.tf')).toBe('terraform');
      expect((service as any).getIacFileType('modules/vpc.tf')).toBe('terraform');
    });

    it('should identify terragrunt files', () => {
      expect((service as any).getIacFileType('terragrunt.hcl')).toBe('terragrunt');
      expect((service as any).getIacFileType('environments/prod/terragrunt.hcl')).toBe(
        'terragrunt'
      );
    });

    it('should return null for non-IaC files', () => {
      expect((service as any).getIacFileType('README.md')).toBeNull();
      expect((service as any).getIacFileType('package.json')).toBeNull();
      expect((service as any).getIacFileType('script.sh')).toBeNull();
    });
  });

  describe('shouldIncludeFile', () => {
    it('should include all IaC files when no options provided', () => {
      expect((service as any).shouldIncludeFile('main.tf')).toBe(true);
      expect((service as any).shouldIncludeFile('terragrunt.hcl')).toBe(true);
    });

    it('should include all files when no options provided', () => {
      // When no options are provided, shouldIncludeFile returns true for all files
      expect((service as any).shouldIncludeFile('README.md')).toBe(true);
      expect((service as any).shouldIncludeFile('package.json')).toBe(true);
    });

    it('should exclude non-IaC files when options are provided', () => {
      const options: VcsFileDiscoveryOptions = { fileTypes: ['terraform', 'terragrunt'] };
      expect((service as any).shouldIncludeFile('README.md', options)).toBe(false);
      expect((service as any).shouldIncludeFile('package.json', options)).toBe(false);
    });

    it('should filter by file types', () => {
      const terraformOnly: VcsFileDiscoveryOptions = { fileTypes: ['terraform'] };
      expect((service as any).shouldIncludeFile('main.tf', terraformOnly)).toBe(true);
      expect((service as any).shouldIncludeFile('terragrunt.hcl', terraformOnly)).toBe(false);

      const terragruntOnly: VcsFileDiscoveryOptions = { fileTypes: ['terragrunt'] };
      expect((service as any).shouldIncludeFile('main.tf', terragruntOnly)).toBe(false);
      expect((service as any).shouldIncludeFile('terragrunt.hcl', terragruntOnly)).toBe(true);
    });

    it('should apply exclude patterns', () => {
      const options: VcsFileDiscoveryOptions = {
        fileTypes: ['terraform', 'terragrunt'],
        excludePatterns: [/test/, /\.backup\.tf$/],
      };

      expect((service as any).shouldIncludeFile('main.tf', options)).toBe(true);
      expect((service as any).shouldIncludeFile('test/main.tf', options)).toBe(false);
      expect((service as any).shouldIncludeFile('main.backup.tf', options)).toBe(false);
    });

    it('should apply include patterns', () => {
      const options: VcsFileDiscoveryOptions = {
        fileTypes: ['terraform', 'terragrunt'],
        includePatterns: [/^modules/, /prod/],
      };

      expect((service as any).shouldIncludeFile('main.tf', options)).toBe(false);
      expect((service as any).shouldIncludeFile('modules/vpc.tf', options)).toBe(true);
      expect((service as any).shouldIncludeFile('prod/main.tf', options)).toBe(true);
    });
  });

  describe('findAllIacFiles template method', () => {
    it('should find all files across repositories', async () => {
      const files = await service.findAllIacFiles('testorg');

      expect(files).toHaveLength(3);
      expect(files.some(f => f.repository === 'repo1')).toBe(true);
      expect(files.some(f => f.repository === 'repo2')).toBe(true);
    });

    it('should apply repository filters', async () => {
      const filter: VcsRepositoryFilter = { skipArchived: true };
      const files = await service.findAllIacFiles('testorg', filter);

      // Only files from non-archived repos
      expect(files).toHaveLength(2);
      expect(files.every(f => f.repository === 'repo1' || f.repository === 'test-repo')).toBe(true);
    });

    it('should handle no repositories found', async () => {
      const files = await service.findAllIacFiles('nonexistent');
      expect(files).toEqual([]);
    });

    it('should handle errors during repository processing', async () => {
      const error = new Error('Repository processing failed');
      service.setError(error);

      await expect(service.findAllIacFiles('testorg')).rejects.toThrow(
        'Repository processing failed'
      );
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await (service as any).executeWithRetry(operation, 'test-operation', 3);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      const result = await (service as any).executeWithRetry(operation, 'test-operation', 3);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        (service as any).executeWithRetry(operation, 'test-operation', 2)
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('caching', () => {
    it('should cache and retrieve repository results', () => {
      const testRepo: VcsRepository = mockRepositories[0];
      const cacheKey = 'test-key';

      // Initially no cache
      expect((service as any).getCachedRepository(cacheKey)).toBeUndefined();

      // Set cache
      (service as any).setCachedRepository(cacheKey, testRepo);

      // Retrieve from cache
      expect((service as any).getCachedRepository(cacheKey)).toBe(testRepo);
    });

    it('should handle null cache values', () => {
      const cacheKey = 'test-key';

      (service as any).setCachedRepository(cacheKey, null);
      expect((service as any).getCachedRepository(cacheKey)).toBeNull();
    });
  });

  describe('validation', () => {
    it('should validate owner and repo names', () => {
      expect(() => (service as any).validateOwnerAndRepo('owner', 'repo')).not.toThrow();
    });

    it('should throw error for empty owner', () => {
      expect(() => (service as any).validateOwnerAndRepo('', 'repo')).toThrow(
        'Owner name is required and must be a non-empty string'
      );
    });

    it('should throw error for empty repo', () => {
      expect(() => (service as any).validateOwnerAndRepo('owner', '')).toThrow(
        'Repository name is required and must be a non-empty string'
      );
    });

    it('should throw error for whitespace-only names', () => {
      expect(() => (service as any).validateOwnerAndRepo('  ', 'repo')).toThrow();
      expect(() => (service as any).validateOwnerAndRepo('owner', '  ')).toThrow();
    });
  });

  describe('createCacheKey', () => {
    it('should create cache key from parameters', () => {
      const key = (service as any).createCacheKey('owner', 'repo', 'branch');
      expect(key).toBe('owner:repo:branch');
    });

    it('should sanitize invalid characters', () => {
      const key = (service as any).createCacheKey('owner/org', 'repo@main', 'feature/branch');
      expect(key).toBe('owner_org:repo_main:feature_branch');
    });
  });

  describe('error handling', () => {
    it('should re-throw VcsError without modification', () => {
      const vcsError = new VcsError(
        'Test error',
        VcsErrorType.AUTHENTICATION_FAILED,
        VcsPlatform.GITHUB
      );

      expect(() => (service as any).handleError(vcsError, 'test-operation')).toThrow(vcsError);
    });

    it('should convert HTTP 401 to authentication error', () => {
      const httpError = {
        response: { status: 401, statusText: 'Unauthorized' },
        message: 'HTTP 401',
      };

      expect(() => (service as any).handleError(httpError, 'test-operation')).toThrow(VcsError);

      try {
        (service as any).handleError(httpError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.AUTHENTICATION_FAILED);
        expect((error as VcsError).statusCode).toBe(401);
      }
    });

    it('should convert HTTP 403 to authorization error', () => {
      const httpError = {
        response: { status: 403 },
        message: 'HTTP 403',
      };

      try {
        (service as any).handleError(httpError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.AUTHORIZATION_FAILED);
      }
    });

    it('should convert HTTP 404 to resource not found', () => {
      const httpError = {
        response: { status: 404 },
        message: 'HTTP 404',
      };

      try {
        (service as any).handleError(httpError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.RESOURCE_NOT_FOUND);
      }
    });

    it('should convert HTTP 429 to rate limit exceeded with retryable flag', () => {
      const httpError = {
        response: { status: 429 },
        message: 'HTTP 429',
      };

      try {
        (service as any).handleError(httpError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.RATE_LIMIT_EXCEEDED);
        expect((error as VcsError).retryable).toBe(true);
      }
    });

    it('should handle network errors', () => {
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Network error',
      };

      try {
        (service as any).handleError(networkError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.NETWORK_ERROR);
        expect((error as VcsError).retryable).toBe(true);
      }
    });

    it('should handle generic errors', () => {
      const genericError = new Error('Generic error');

      try {
        (service as any).handleError(genericError, 'test-operation');
      } catch (error) {
        expect((error as VcsError).type).toBe(VcsErrorType.UNKNOWN_ERROR);
        expect((error as VcsError).originalError).toBe(genericError);
      }
    });
  });
});
