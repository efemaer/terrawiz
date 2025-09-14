import { GitLabService, GitLabServiceConfig } from '../../../src/vcs/gitlab';
import { VcsPlatform } from '../../../src/types';

// Mock the @gitbeaker/rest module
const mockGitlab = {
  Projects: {
    show: jest.fn(),
    all: jest.fn(),
  },
  Groups: {
    show: jest.fn(),
  },
  Users: {},
  Repositories: {
    allRepositoryTrees: jest.fn(),
  },
  RepositoryFiles: {
    show: jest.fn(),
  },
};

jest.mock('@gitbeaker/rest', () => ({
  Gitlab: jest.fn().mockImplementation(_config => {
    // Mock the GitLab client constructor to not fail
    return mockGitlab;
  }),
}));

// Mock environment variables
const originalEnv = process.env;

describe('GitLabService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createDefaultConfig = (
    overrides: Partial<GitLabServiceConfig> = {}
  ): GitLabServiceConfig => ({
    platform: VcsPlatform.GITLAB,
    token: 'test-token',
    debug: false,
    skipArchived: false,
    cacheEnabled: true,
    maxConcurrentRepos: 2,
    maxConcurrentFiles: 2,
    ...overrides,
  });

  describe('constructor', () => {
    it('should initialize GitLab service with valid token', () => {
      const service = new GitLabService(createDefaultConfig());
      expect(service).toBeDefined();
      expect(service.platformName).toBe('GitLab');
    });

    it('should initialize GitLab service with custom host', () => {
      const service = new GitLabService(
        createDefaultConfig({
          platform: VcsPlatform.GITLAB_SELF_HOSTED,
          host: 'https://gitlab.example.com',
        })
      );
      expect(service).toBeDefined();
      expect(service.platformName).toBe('GitLab (https://gitlab.example.com)');
    });

    it('should use GITLAB_TOKEN environment variable if no token provided', () => {
      process.env.GITLAB_TOKEN = 'env-token';

      const service = new GitLabService(
        createDefaultConfig({
          token: '',
        })
      );
      expect(service).toBeDefined();
    });

    it('should throw error when no token is provided', () => {
      delete process.env.GITLAB_TOKEN;

      expect(() => new GitLabService(createDefaultConfig({ token: '' }))).toThrow(
        'GitLab token not found. Please provide token in config or set GITLAB_TOKEN environment variable'
      );
    });

    it('should throw error for invalid repository pattern', () => {
      expect(
        () =>
          new GitLabService(
            createDefaultConfig({
              repoPattern: '[invalid-regex',
            })
          )
      ).toThrow('Invalid repository regex pattern');
    });
  });

  describe('repositoryExists', () => {
    it('should return true for existing repository', async () => {
      const mockProject = {
        namespace: { path: 'test-group' },
        path: 'test-repo',
        path_with_namespace: 'test-group/test-repo',
        default_branch: 'main',
        archived: false,
        visibility: 'public',
        web_url: 'https://gitlab.com/test-group/test-repo',
        http_url_to_repo: 'https://gitlab.com/test-group/test-repo.git',
      };

      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.repositoryExists('test-group', 'test-repo');

      expect(result).toBe(true);
      expect(mockGitlab.Projects.show).toHaveBeenCalledWith('test-group/test-repo');
    });

    it('should return null for archived repository when skipArchived is true', async () => {
      const mockProject = {
        namespace: { path: 'test-group' },
        path: 'test-repo',
        path_with_namespace: 'test-group/test-repo',
        default_branch: 'main',
        archived: true,
        visibility: 'public',
        web_url: 'https://gitlab.com/test-group/test-repo',
        http_url_to_repo: 'https://gitlab.com/test-group/test-repo.git',
      };

      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const service = new GitLabService(createDefaultConfig({ skipArchived: true }));
      const result = await service.repositoryExists('test-group', 'test-repo');

      expect(result).toBe(null);
    });

    it('should return false for non-existent repository', async () => {
      const error = new Error('Not found') as any;
      error.response = { status: 404 };
      mockGitlab.Projects.show.mockRejectedValue(error);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.repositoryExists('test-group', 'nonexistent');

      expect(result).toBe(false);
    });

    it('should validate owner and repo parameters', async () => {
      const service = new GitLabService(createDefaultConfig());

      await expect(service.repositoryExists('', 'test-repo')).rejects.toThrow(
        'Owner name is required and must be a non-empty string'
      );

      await expect(service.repositoryExists('test-group', '')).rejects.toThrow(
        'Repository name is required and must be a non-empty string'
      );
    });
  });

  describe('getSingleRepository', () => {
    it('should return repository object for existing repository', async () => {
      const mockProject = {
        namespace: { path: 'test-group' },
        path: 'test-repo',
        path_with_namespace: 'test-group/test-repo',
        default_branch: 'main',
        archived: false,
        visibility: 'public',
        web_url: 'https://gitlab.com/test-group/test-repo',
        http_url_to_repo: 'https://gitlab.com/test-group/test-repo.git',
      };

      mockGitlab.Projects.show.mockResolvedValue(mockProject);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.getSingleRepository('test-group', 'test-repo');

      expect(result).toEqual({
        owner: 'test-group',
        name: 'test-repo',
        fullName: 'test-group/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://gitlab.com/test-group/test-repo',
        cloneUrl: 'https://gitlab.com/test-group/test-repo.git',
      });
    });

    it('should return null for non-existent repository', async () => {
      const error = new Error('Not found') as any;
      error.response = { status: 404 };
      mockGitlab.Projects.show.mockRejectedValue(error);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.getSingleRepository('test-group', 'nonexistent');

      expect(result).toBe(null);
    });
  });

  describe('getRepositories', () => {
    it('should return repositories for a group', async () => {
      const mockProjects = [
        {
          namespace: { path: 'test-group' },
          path: 'repo1',
          path_with_namespace: 'test-group/repo1',
          default_branch: 'main',
          archived: false,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-group/repo1',
          http_url_to_repo: 'https://gitlab.com/test-group/repo1.git',
        },
        {
          namespace: { path: 'test-group' },
          path: 'repo2',
          path_with_namespace: 'test-group/repo2',
          default_branch: 'main',
          archived: false,
          visibility: 'private',
          web_url: 'https://gitlab.com/test-group/repo2',
          http_url_to_repo: 'https://gitlab.com/test-group/repo2.git',
        },
      ];

      mockGitlab.Groups.show.mockResolvedValue({ name: 'test-group' });
      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.getRepositories('test-group');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('repo1');
      expect(result[1].name).toBe('repo2');
      expect(mockGitlab.Projects.all).toHaveBeenCalledWith({
        maxPages: 10,
        perPage: 100,
      });
    });

    it('should return repositories for a user when group check fails', async () => {
      const mockProjects = [
        {
          namespace: { path: 'test-user' },
          path: 'user-repo',
          path_with_namespace: 'test-user/user-repo',
          default_branch: 'main',
          archived: false,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-user/user-repo',
          http_url_to_repo: 'https://gitlab.com/test-user/user-repo.git',
        },
      ];

      mockGitlab.Groups.show.mockRejectedValue(new Error('Not a group'));
      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.getRepositories('test-user');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user-repo');
      expect(mockGitlab.Projects.all).toHaveBeenCalledWith({
        maxPages: 10,
        perPage: 100,
      });
    });

    it('should filter archived repositories when skipArchived is true', async () => {
      const mockProjects = [
        {
          namespace: { path: 'test-group' },
          path: 'active-repo',
          path_with_namespace: 'test-group/active-repo',
          default_branch: 'main',
          archived: false,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-group/active-repo',
          http_url_to_repo: 'https://gitlab.com/test-group/active-repo.git',
        },
        {
          namespace: { path: 'test-group' },
          path: 'archived-repo',
          path_with_namespace: 'test-group/archived-repo',
          default_branch: 'main',
          archived: true,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-group/archived-repo',
          http_url_to_repo: 'https://gitlab.com/test-group/archived-repo.git',
        },
      ];

      mockGitlab.Groups.show.mockResolvedValue({ name: 'test-group' });
      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const service = new GitLabService(createDefaultConfig({ skipArchived: true }));
      const result = await service.getRepositories('test-group');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('active-repo');
    });

    it('should filter repositories by pattern', async () => {
      const mockProjects = [
        {
          namespace: { path: 'test-group' },
          path: 'terraform-module',
          path_with_namespace: 'test-group/terraform-module',
          default_branch: 'main',
          archived: false,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-group/terraform-module',
          http_url_to_repo: 'https://gitlab.com/test-group/terraform-module.git',
        },
        {
          namespace: { path: 'test-group' },
          path: 'other-repo',
          path_with_namespace: 'test-group/other-repo',
          default_branch: 'main',
          archived: false,
          visibility: 'public',
          web_url: 'https://gitlab.com/test-group/other-repo',
          http_url_to_repo: 'https://gitlab.com/test-group/other-repo.git',
        },
      ];

      mockGitlab.Groups.show.mockResolvedValue({ name: 'test-group' });
      mockGitlab.Projects.all.mockResolvedValue(mockProjects);

      const service = new GitLabService(createDefaultConfig({ repoPattern: '^terraform-' }));
      const result = await service.getRepositories('test-group');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('terraform-module');
    });
  });

  describe('findIacFilesInRepository', () => {
    it('should find and return IaC files with content', async () => {
      const mockRepository = {
        owner: 'test-group',
        name: 'test-repo',
        fullName: 'test-group/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://gitlab.com/test-group/test-repo',
        cloneUrl: 'https://gitlab.com/test-group/test-repo.git',
      };

      const mockTree = [
        {
          id: 'abc123',
          name: 'main.tf',
          type: 'blob' as const,
          path: 'main.tf',
          mode: '100644',
        },
        {
          id: 'def456',
          name: 'terragrunt.hcl',
          type: 'blob' as const,
          path: 'terragrunt.hcl',
          mode: '100644',
        },
        {
          id: 'ghi789',
          name: 'README.md',
          type: 'blob' as const,
          path: 'README.md',
          mode: '100644',
        },
      ];

      const mockTerraformContent = 'resource "aws_instance" "example" {}';
      const mockTerragruntContent = 'terraform { source = "." }';

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(mockTree);
      mockGitlab.RepositoryFiles.show
        .mockResolvedValueOnce({
          encoding: 'base64',
          content: Buffer.from(mockTerraformContent).toString('base64'),
        })
        .mockResolvedValueOnce({
          encoding: 'base64',
          content: Buffer.from(mockTerragruntContent).toString('base64'),
        });

      const service = new GitLabService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'terraform',
        repository: 'test-group/test-repo',
        path: 'main.tf',
        content: mockTerraformContent,
        url: 'https://gitlab.com/test-group/test-repo/-/blob/main/main.tf',
        sha: 'abc123',
      });
      expect(result[1]).toEqual({
        type: 'terragrunt',
        repository: 'test-group/test-repo',
        path: 'terragrunt.hcl',
        content: mockTerragruntContent,
        url: 'https://gitlab.com/test-group/test-repo/-/blob/main/terragrunt.hcl',
        sha: 'def456',
      });
    });

    it('should filter files by type when options are provided', async () => {
      const mockRepository = {
        owner: 'test-group',
        name: 'test-repo',
        fullName: 'test-group/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://gitlab.com/test-group/test-repo',
        cloneUrl: 'https://gitlab.com/test-group/test-repo.git',
      };

      const mockTree = [
        {
          id: 'abc123',
          name: 'main.tf',
          type: 'blob' as const,
          path: 'main.tf',
          mode: '100644',
        },
        {
          id: 'def456',
          name: 'terragrunt.hcl',
          type: 'blob' as const,
          path: 'terragrunt.hcl',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(mockTree);
      mockGitlab.RepositoryFiles.show.mockResolvedValue({
        encoding: 'base64',
        content: Buffer.from('content').toString('base64'),
      });

      const service = new GitLabService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository, {
        fileTypes: ['terraform'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('terraform');
    });

    it('should return empty array when no IaC files found', async () => {
      const mockRepository = {
        owner: 'test-group',
        name: 'test-repo',
        fullName: 'test-group/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://gitlab.com/test-group/test-repo',
        cloneUrl: 'https://gitlab.com/test-group/test-repo.git',
      };

      const mockTree = [
        {
          id: 'ghi789',
          name: 'README.md',
          type: 'blob' as const,
          path: 'README.md',
          mode: '100644',
        },
      ];

      mockGitlab.Repositories.allRepositoryTrees.mockResolvedValue(mockTree);

      const service = new GitLabService(createDefaultConfig());
      const result = await service.findIacFilesInRepository(mockRepository);

      expect(result).toHaveLength(0);
    });
  });
});
