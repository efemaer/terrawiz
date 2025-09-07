import { GitHubService, GitHubServiceConfig } from '../../../src/vcs/github';
import { VcsPlatform } from '../../../src/types';

// Mock the @octokit/rest module
const mockOctokit = {
  repos: {
    get: jest.fn(),
    listForOrg: {
      endpoint: {
        merge: jest.fn().mockReturnValue({
          url: 'GET /orgs/{org}/repos',
        }),
      },
    },
    listForUser: {
      endpoint: {
        merge: jest.fn().mockReturnValue({
          url: 'GET /users/{username}/repos',
        }),
      },
    },
    getContent: jest.fn(),
  },
  orgs: {
    get: jest.fn(),
  },
  git: {
    getRef: jest.fn(),
    getCommit: jest.fn(),
    getTree: jest.fn(),
  },
  rateLimit: {
    get: jest.fn(),
  },
  request: jest.fn(),
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('@octokit/plugin-throttling', () => ({
  throttling: jest.fn(),
}));

// Mock environment variables
const originalEnv = process.env;

describe('GitHubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    
    // Mock rate limit response for all tests
    mockOctokit.rateLimit.get.mockResolvedValue({
      data: {
        resources: {
          core: {
            remaining: 5000,
          },
        },
      },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createDefaultConfig = (
    overrides: Partial<GitHubServiceConfig> = {}
  ): GitHubServiceConfig => ({
    platform: VcsPlatform.GITHUB,
    token: 'test-token',
    debug: false,
    skipArchived: false,
    cacheEnabled: true,
    maxConcurrentRepos: 2,
    maxConcurrentFiles: 2,
    useRateLimit: false, // Disable rate limiting for tests to avoid plugin issues
    ...overrides,
  });

  describe('constructor', () => {
    it('should initialize GitHub service with valid token', () => {
      const service = new GitHubService(createDefaultConfig());
      expect(service).toBeDefined();
      expect(service.platformName).toBe('GitHub');
    });

    it('should use GITHUB_TOKEN environment variable if no token provided', () => {
      process.env.GITHUB_TOKEN = 'env-token';

      const service = new GitHubService(
        createDefaultConfig({
          token: '',
        })
      );
      expect(service).toBeDefined();
    });

    it('should throw error when no token is provided', () => {
      delete process.env.GITHUB_TOKEN;

      expect(() => new GitHubService(createDefaultConfig({ token: '' }))).toThrow(
        'GitHub token not found. Please provide token in config or set GITHUB_TOKEN environment variable'
      );
    });

    it('should throw error for invalid repository pattern', () => {
      expect(
        () =>
          new GitHubService(
            createDefaultConfig({
              repoPattern: '[invalid-regex',
            })
          )
      ).toThrow('Invalid repository regex pattern');
    });
  });

  describe('repositoryExists', () => {
    it('should return true for existing repository', async () => {
      const mockRepo = {
        owner: { login: 'test-owner' },
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        default_branch: 'main',
        archived: false,
        private: false,
        html_url: 'https://github.com/test-owner/test-repo',
        clone_url: 'https://github.com/test-owner/test-repo.git',
      };

      mockOctokit.repos.get.mockResolvedValue({ data: mockRepo });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.repositoryExists('test-owner', 'test-repo');

      expect(result).toBe(true);
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });
    });

    it('should return null for archived repository when skipArchived is true', async () => {
      const mockRepo = {
        owner: { login: 'test-owner' },
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        default_branch: 'main',
        archived: true,
        private: false,
        html_url: 'https://github.com/test-owner/test-repo',
        clone_url: 'https://github.com/test-owner/test-repo.git',
      };

      mockOctokit.repos.get.mockResolvedValue({ data: mockRepo });

      const service = new GitHubService(createDefaultConfig({ skipArchived: true }));
      const result = await service.repositoryExists('test-owner', 'test-repo');

      expect(result).toBe(null);
    });

    it('should return false for non-existent repository', async () => {
      const error = new Error('Not found') as any;
      error.status = 404;
      mockOctokit.repos.get.mockRejectedValue(error);

      const service = new GitHubService(createDefaultConfig());
      const result = await service.repositoryExists('test-owner', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should validate owner and repo parameters', async () => {
      const service = new GitHubService(createDefaultConfig());

      await expect(service.repositoryExists('', 'test-repo')).rejects.toThrow(
        'Owner name is required and must be a non-empty string'
      );

      await expect(service.repositoryExists('test-owner', '')).rejects.toThrow(
        'Repository name is required and must be a non-empty string'
      );
    });
  });

  describe('getSingleRepository', () => {
    it('should return repository object for existing repository', async () => {
      const mockRepo = {
        owner: { login: 'test-owner' },
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        default_branch: 'main',
        archived: false,
        private: false,
        html_url: 'https://github.com/test-owner/test-repo',
        clone_url: 'https://github.com/test-owner/test-repo.git',
      };

      mockOctokit.repos.get.mockResolvedValue({ data: mockRepo });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.getSingleRepository('test-owner', 'test-repo');

      expect(result).toEqual({
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://github.com/test-owner/test-repo',
        cloneUrl: 'https://github.com/test-owner/test-repo.git',
      });
    });

    it('should return null for non-existent repository', async () => {
      const error = new Error('Not found') as any;
      error.status = 404;
      mockOctokit.repos.get.mockRejectedValue(error);

      const service = new GitHubService(createDefaultConfig());
      const result = await service.getSingleRepository('test-owner', 'nonexistent');

      expect(result).toBe(null);
    });
  });

  describe('getRepositories', () => {
    it('should return repositories for an organization', async () => {
      const mockRepos = [
        {
          name: 'repo1',
          full_name: 'test-org/repo1',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: false,
          private: false,
        },
        {
          name: 'repo2',
          full_name: 'test-org/repo2',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: false,
          private: true,
        },
      ];

      mockOctokit.orgs.get.mockResolvedValue({ data: { login: 'test-org' } });
      mockOctokit.request
        .mockResolvedValueOnce({
          data: mockRepos,
          headers: {},
        })
        .mockResolvedValue({
          data: [],
          headers: {},
        });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.getRepositories('test-org');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('repo1');
      expect(result[1].name).toBe('repo2');
    });

    it('should return repositories for a user when org check fails', async () => {
      const mockRepos = [
        {
          name: 'user-repo',
          full_name: 'test-user/user-repo',
          owner: { login: 'test-user' },
          default_branch: 'main',
          archived: false,
          private: false,
        },
      ];

      mockOctokit.orgs.get.mockRejectedValue(new Error('Not an organization'));
      mockOctokit.request
        .mockResolvedValueOnce({
          data: mockRepos,
          headers: {},
        })
        .mockResolvedValue({
          data: [],
          headers: {},
        });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.getRepositories('test-user');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user-repo');
    });

    it('should filter archived repositories when skipArchived is true', async () => {
      const mockRepos = [
        {
          name: 'active-repo',
          full_name: 'test-org/active-repo',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: false,
          private: false,
        },
        {
          name: 'archived-repo',
          full_name: 'test-org/archived-repo',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: true,
          private: false,
        },
      ];

      mockOctokit.orgs.get.mockResolvedValue({ data: { login: 'test-org' } });
      mockOctokit.request
        .mockResolvedValueOnce({
          data: mockRepos,
          headers: {},
        })
        .mockResolvedValue({
          data: [],
          headers: {},
        });

      const service = new GitHubService(createDefaultConfig({ skipArchived: true }));
      const result = await service.getRepositories('test-org');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('active-repo');
    });

    it('should filter repositories by pattern', async () => {
      const mockRepos = [
        {
          name: 'terraform-module',
          full_name: 'test-org/terraform-module',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: false,
          private: false,
        },
        {
          name: 'other-repo',
          full_name: 'test-org/other-repo',
          owner: { login: 'test-org' },
          default_branch: 'main',
          archived: false,
          private: false,
        },
      ];

      mockOctokit.orgs.get.mockResolvedValue({ data: { login: 'test-org' } });
      mockOctokit.request
        .mockResolvedValueOnce({
          data: mockRepos,
          headers: {},
        })
        .mockResolvedValue({
          data: [],
          headers: {},
        });

      const service = new GitHubService(createDefaultConfig({ repoPattern: '^terraform-' }));
      const result = await service.getRepositories('test-org');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('terraform-module');
    });
  });

  describe('findIacFilesInRepository', () => {
    it('should find and return IaC files with content', async () => {
      const mockRepository = {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://github.com/test-owner/test-repo',
        cloneUrl: 'https://github.com/test-owner/test-repo.git',
      };

      const mockRef = {
        data: {
          object: {
            sha: 'commit-sha',
          },
        },
      };

      const mockCommit = {
        data: {
          tree: {
            sha: 'tree-sha',
          },
        },
      };

      const mockTree = {
        data: {
          tree: [
            {
              path: 'main.tf',
              type: 'blob',
              sha: 'abc123',
            },
            {
              path: 'terragrunt.hcl',
              type: 'blob',
              sha: 'def456',
            },
            {
              path: 'README.md',
              type: 'blob',
              sha: 'ghi789',
            },
          ],
        },
      };

      const mockTerraformContent = 'resource "aws_instance" "example" {}';
      const mockTerragruntContent = 'terraform { source = "." }';

      mockOctokit.git.getRef.mockResolvedValue(mockRef);
      mockOctokit.git.getCommit.mockResolvedValue(mockCommit);
      mockOctokit.git.getTree.mockResolvedValue(mockTree);
      mockOctokit.repos.getContent
        .mockResolvedValueOnce({
          data: {
            encoding: 'base64',
            content: Buffer.from(mockTerraformContent).toString('base64'),
          },
        })
        .mockResolvedValueOnce({
          data: {
            encoding: 'base64',
            content: Buffer.from(mockTerragruntContent).toString('base64'),
          },
        });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'terraform',
        repository: 'test-owner/test-repo',
        path: 'main.tf',
        content: mockTerraformContent,
        url: 'https://github.com/test-owner/test-repo/blob/main/main.tf',
        sha: 'abc123',
      });
      expect(result[1]).toEqual({
        type: 'terragrunt',
        repository: 'test-owner/test-repo',
        path: 'terragrunt.hcl',
        content: mockTerragruntContent,
        url: 'https://github.com/test-owner/test-repo/blob/main/terragrunt.hcl',
        sha: 'def456',
      });
    });

    it('should filter files by type when options are provided', async () => {
      const mockRepository = {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://github.com/test-owner/test-repo',
        cloneUrl: 'https://github.com/test-owner/test-repo.git',
      };

      const mockRef = {
        data: {
          object: {
            sha: 'commit-sha',
          },
        },
      };

      const mockCommit = {
        data: {
          tree: {
            sha: 'tree-sha',
          },
        },
      };

      const mockTree = {
        data: {
          tree: [
            {
              path: 'main.tf',
              type: 'blob',
              sha: 'abc123',
            },
            {
              path: 'terragrunt.hcl',
              type: 'blob',
              sha: 'def456',
            },
          ],
        },
      };

      mockOctokit.git.getRef.mockResolvedValue(mockRef);
      mockOctokit.git.getCommit.mockResolvedValue(mockCommit);
      mockOctokit.git.getTree.mockResolvedValue(mockTree);
      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          encoding: 'base64',
          content: Buffer.from('content').toString('base64'),
        },
      });

      const service = new GitHubService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository, {
        fileTypes: ['terraform'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('terraform');
    });

    it('should return empty array when no IaC files found', async () => {
      const mockRepository = {
        owner: 'test-owner',
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://github.com/test-owner/test-repo',
        cloneUrl: 'https://github.com/test-owner/test-repo.git',
      };

      const mockRef = {
        data: {
          object: {
            sha: 'commit-sha',
          },
        },
      };

      const mockCommit = {
        data: {
          tree: {
            sha: 'tree-sha',
          },
        },
      };

      const mockTree = {
        data: {
          tree: [
            {
              path: 'README.md',
              type: 'blob',
              sha: 'ghi789',
            },
          ],
        },
      };

      mockOctokit.git.getRef.mockResolvedValue(mockRef);
      mockOctokit.git.getCommit.mockResolvedValue(mockCommit);
      mockOctokit.git.getTree.mockResolvedValue(mockTree);

      const service = new GitHubService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository);

      expect(result).toHaveLength(0);
    });
  });
});