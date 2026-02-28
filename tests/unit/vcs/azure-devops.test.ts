import { AzureDevOpsService, AzureDevOpsServiceConfig } from '../../../src/vcs/azure-devops';
import { VcsPlatform } from '../../../src/types';
import { createMockResponse } from '../../utils/mocks';

const originalEnv = process.env;
const originalFetch = global.fetch;
const mockFetch = jest.fn();

describe('AzureDevOpsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (global as typeof global & { fetch: typeof fetch }).fetch =
      mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    (global as typeof global & { fetch: typeof fetch }).fetch = originalFetch;
  });

  const createDefaultConfig = (
    overrides: Partial<AzureDevOpsServiceConfig> = {}
  ): AzureDevOpsServiceConfig => ({
    platform: VcsPlatform.AZURE_DEVOPS,
    token: 'test-token',
    debug: false,
    skipArchived: false,
    cacheEnabled: true,
    maxConcurrentRepos: 2,
    maxConcurrentFiles: 2,
    ...overrides,
  });

  describe('constructor', () => {
    it('should initialize Azure DevOps service with valid token', () => {
      const service = new AzureDevOpsService(createDefaultConfig());
      expect(service).toBeDefined();
      expect(service.platformName).toBe('Azure DevOps');
    });

    it('should use AZURE_DEVOPS_TOKEN environment variable if no token provided', () => {
      process.env.AZURE_DEVOPS_TOKEN = 'env-token';

      const service = new AzureDevOpsService(
        createDefaultConfig({
          token: '',
        })
      );
      expect(service).toBeDefined();
    });

    it('should throw error when no token is provided', () => {
      delete process.env.AZURE_DEVOPS_TOKEN;

      expect(() => new AzureDevOpsService(createDefaultConfig({ token: '' }))).toThrow(
        'Azure DevOps token not found. Please provide token in config or set AZURE_DEVOPS_TOKEN environment variable'
      );
    });

    it('should throw error for unsafe repository pattern', () => {
      expect(
        () =>
          new AzureDevOpsService(
            createDefaultConfig({
              repoPattern: '(a+)+$',
            })
          )
      ).toThrow('Unsafe repository regex pattern');
    });
  });

  describe('repositoryExists', () => {
    it('should return true for existing repository', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            id: 'project-id',
            name: 'myproject',
            visibility: 'public',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            count: 1,
            value: [
              {
                id: 'repo-id',
                name: 'myrepo',
                project: { name: 'myproject' },
                defaultBranch: 'refs/heads/main',
                webUrl: 'https://dev.azure.com/myorg/myproject/_git/myrepo',
                remoteUrl: 'https://dev.azure.com/myorg/myproject/_git/myrepo',
              },
            ],
          })
        );

      const service = new AzureDevOpsService(createDefaultConfig());
      const result = await service.repositoryExists('myorg/myproject', 'myrepo');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return false for non-existent repository', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            id: 'project-id',
            name: 'myproject',
            visibility: 'private',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            count: 0,
            value: [],
          })
        );

      const service = new AzureDevOpsService(createDefaultConfig());
      const result = await service.repositoryExists('myorg/myproject', 'missing-repo');

      expect(result).toBe(false);
    });
  });

  describe('getRepositories', () => {
    it('should return repositories for a project scope', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            id: 'project-id',
            name: 'myproject',
            visibility: 'public',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            count: 2,
            value: [
              {
                id: 'repo1-id',
                name: 'repo1',
                project: { name: 'myproject' },
                defaultBranch: 'refs/heads/main',
                webUrl: 'https://dev.azure.com/myorg/myproject/_git/repo1',
                remoteUrl: 'https://dev.azure.com/myorg/myproject/_git/repo1',
              },
              {
                id: 'repo2-id',
                name: 'repo2',
                project: { name: 'myproject' },
                defaultBranch: 'refs/heads/main',
                webUrl: 'https://dev.azure.com/myorg/myproject/_git/repo2',
                remoteUrl: 'https://dev.azure.com/myorg/myproject/_git/repo2',
              },
            ],
          })
        );

      const service = new AzureDevOpsService(createDefaultConfig());
      const result = await service.getRepositories('myorg/myproject');

      expect(result).toHaveLength(2);
      expect(result[0].fullName).toBe('myorg/myproject/repo1');
      expect(result[1].fullName).toBe('myorg/myproject/repo2');
      expect(result[0].private).toBe(false);
    });
  });

  describe('findIacFilesInRepository', () => {
    it('should discover IaC files and return file content', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            count: 2,
            value: [
              { path: '/main.tf', gitObjectType: 'blob', objectId: 'sha-1', size: 42 },
              { path: '/docs', gitObjectType: 'tree' },
            ],
          })
        )
        .mockResolvedValueOnce(
          createMockResponse('resource "azurerm_resource_group" "rg" {}', 200, {
            'content-type': 'text/plain',
          })
        );

      const service = new AzureDevOpsService(createDefaultConfig());
      const repository = {
        owner: 'myorg/myproject',
        name: 'myrepo',
        fullName: 'myorg/myproject/myrepo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://dev.azure.com/myorg/myproject/_git/myrepo',
        cloneUrl: 'https://dev.azure.com/myorg/myproject/_git/myrepo',
      };

      const files = await service.findIacFilesInRepository(repository, {
        fileTypes: ['terraform', 'terragrunt'],
      });

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('main.tf');
      expect(files[0].content).toContain('azurerm_resource_group');
    });
  });
});
