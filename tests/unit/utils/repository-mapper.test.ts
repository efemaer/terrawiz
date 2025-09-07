import { 
  mapToVcsRepository, 
  createGitHubRawRepository, 
  createGitLabRawRepository,
  createRepositoryCacheKey,
  RawRepository 
} from '../../../src/utils/repository-mapper';

describe('Repository Mapper Utils', () => {
  describe('mapToVcsRepository', () => {
    it('should map raw repository to VcsRepository format', () => {
      const raw: RawRepository = {
        name: 'test-repo',
        fullName: 'owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://github.com/owner/test-repo',
        cloneUrl: 'https://github.com/owner/test-repo.git',
        owner: { login: 'owner' }
      };

      const result = mapToVcsRepository(raw);

      expect(result).toEqual({
        owner: 'owner',
        name: 'test-repo',
        fullName: 'owner/test-repo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://github.com/owner/test-repo',
        cloneUrl: 'https://github.com/owner/test-repo.git'
      });
    });

    it('should handle missing owner properties', () => {
      const raw: RawRepository = {
        name: 'test-repo',
        fullName: 'test-repo',
        defaultBranch: 'master',
        archived: true,
        private: false,
        url: 'https://example.com/test-repo',
        cloneUrl: 'https://example.com/test-repo.git',
        owner: { name: 'fallback-owner' }
      };

      const result = mapToVcsRepository(raw);
      expect(result.owner).toBe('fallback-owner');
    });
  });

  describe('createGitHubRawRepository', () => {
    it('should create GitHub raw repository object', () => {
      const githubRepo = {
        name: 'my-repo',
        full_name: 'myorg/my-repo',
        default_branch: 'main',
        archived: false,
        private: true,
        html_url: 'https://github.com/myorg/my-repo',
        clone_url: 'https://github.com/myorg/my-repo.git',
        owner: { login: 'myorg' }
      };

      const result = createGitHubRawRepository(githubRepo);

      expect(result).toEqual({
        name: 'my-repo',
        fullName: 'myorg/my-repo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://github.com/myorg/my-repo',
        cloneUrl: 'https://github.com/myorg/my-repo.git',
        owner: { login: 'myorg' }
      });
    });
  });

  describe('createGitLabRawRepository', () => {
    it('should create GitLab raw repository object', () => {
      const gitlabProject = {
        id: 123,
        name: 'my-project',
        path_with_namespace: 'mygroup/my-project',
        default_branch: 'main',
        archived: false,
        visibility: 'private' as const,
        web_url: 'https://gitlab.com/mygroup/my-project',
        http_url_to_repo: 'https://gitlab.com/mygroup/my-project.git',
        namespace: { path: 'mygroup' }
      };

      const result = createGitLabRawRepository(gitlabProject);

      expect(result).toEqual({
        name: 'my-project',
        fullName: 'mygroup/my-project',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://gitlab.com/mygroup/my-project',
        cloneUrl: 'https://gitlab.com/mygroup/my-project.git',
        owner: { path: 'mygroup' }
      });
    });

    it('should handle public repositories', () => {
      const gitlabProject = {
        id: 123,
        name: 'public-project',
        path_with_namespace: 'mygroup/public-project',
        default_branch: 'main',
        archived: false,
        visibility: 'public' as const,
        web_url: 'https://gitlab.com/mygroup/public-project',
        http_url_to_repo: 'https://gitlab.com/mygroup/public-project.git',
        namespace: { path: 'mygroup' }
      };

      const result = createGitLabRawRepository(gitlabProject);
      expect(result.private).toBe(false);
    });
  });

  describe('createRepositoryCacheKey', () => {
    it('should create standardized cache keys', () => {
      const key = createRepositoryCacheKey('github', 'repo-exists', 'myorg', 'myrepo');
      expect(key).toBe('github:repo-exists:myorg:myrepo');
    });

    it('should handle cache keys without repo', () => {
      const key = createRepositoryCacheKey('gitlab', 'list-repos', 'mygroup');
      expect(key).toBe('gitlab:list-repos:mygroup');
    });

    it('should handle additional parameters', () => {
      const key = createRepositoryCacheKey('github', 'operation', 'owner', 'repo', 'param1', 'param2');
      expect(key).toBe('github:operation:owner:repo:param1:param2');
    });

    it('should sanitize invalid characters', () => {
      const key = createRepositoryCacheKey('github', 'repo-exists', 'my@org!', 'my repo/test');
      expect(key).toBe('github:repo-exists:my_org_:my_repo_test');
    });

    it('should handle empty additional parameters', () => {
      const key = createRepositoryCacheKey('platform', 'op', 'owner');
      expect(key).toBe('platform:op:owner');
    });
  });
});