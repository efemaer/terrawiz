import { BitbucketService, BitbucketServiceConfig } from '../../../src/vcs/bitbucket';
import { VcsPlatform } from '../../../src/types';

const originalEnv = process.env;
const originalFetch = global.fetch;
const mockFetch = jest.fn();

function createMockResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const loweredHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => loweredHeaders[name.toLowerCase()] || null,
    },
    json: jest.fn().mockResolvedValue(data),
    text: jest
      .fn()
      .mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data, null, 2)),
  } as unknown as Response;
}

describe('BitbucketService', () => {
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
    overrides: Partial<BitbucketServiceConfig> = {}
  ): BitbucketServiceConfig => ({
    platform: VcsPlatform.BITBUCKET,
    token: 'test-token',
    debug: false,
    skipArchived: false,
    cacheEnabled: true,
    maxConcurrentRepos: 2,
    maxConcurrentFiles: 2,
    ...overrides,
  });

  describe('constructor', () => {
    it('should initialize Bitbucket service with valid token', () => {
      const service = new BitbucketService(createDefaultConfig());
      expect(service).toBeDefined();
      expect(service.platformName).toBe('Bitbucket');
    });

    it('should use BITBUCKET_TOKEN environment variable if no token provided', () => {
      process.env.BITBUCKET_TOKEN = 'env-token';

      const service = new BitbucketService(
        createDefaultConfig({
          token: '',
        })
      );
      expect(service).toBeDefined();
    });

    it('should throw error when no token is provided', () => {
      delete process.env.BITBUCKET_TOKEN;

      expect(() => new BitbucketService(createDefaultConfig({ token: '' }))).toThrow(
        'Bitbucket token not found. Please provide token in config or set BITBUCKET_TOKEN environment variable'
      );
    });

    it('should initialize Bitbucket self-hosted service with host', () => {
      const service = new BitbucketService(
        createDefaultConfig({
          platform: VcsPlatform.BITBUCKET_SELF_HOSTED,
          host: 'https://bitbucket.example.com',
        })
      );

      expect(service.platformName).toBe('Bitbucket Self-Hosted (https://bitbucket.example.com)');
    });

    it('should throw error for self-hosted platform without host', () => {
      expect(
        () =>
          new BitbucketService(
            createDefaultConfig({
              platform: VcsPlatform.BITBUCKET_SELF_HOSTED,
              host: undefined,
            })
          )
      ).toThrow(
        'Bitbucket self-hosted requires a host URL (use bitbucket://host/... source format or set BITBUCKET_HOST)'
      );
    });
  });

  describe('repositoryExists', () => {
    it('should return true for existing repository', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          name: 'myrepo',
          slug: 'myrepo',
          full_name: 'myworkspace/myrepo',
          mainbranch: { name: 'main' },
          is_private: false,
          links: {
            html: { href: 'https://bitbucket.org/myworkspace/myrepo' },
            clone: [{ name: 'https', href: 'https://bitbucket.org/myworkspace/myrepo.git' }],
          },
        })
      );

      const service = new BitbucketService(createDefaultConfig());
      const result = await service.repositoryExists('myworkspace', 'myrepo');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return false for non-existent repository', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: { message: 'Not found' } }, 404));

      const service = new BitbucketService(createDefaultConfig());
      const result = await service.repositoryExists('myworkspace', 'missing-repo');

      expect(result).toBe(false);
    });

    it('should return true for existing self-hosted repository', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          name: 'myrepo',
          slug: 'myrepo',
          archived: false,
          public: false,
          defaultBranch: { displayId: 'main' },
          links: {
            self: [{ href: 'https://bitbucket.example.com/projects/PROJ/repos/myrepo/browse' }],
            clone: [{ name: 'http', href: 'https://bitbucket.example.com/scm/proj/myrepo.git' }],
          },
        })
      );

      const service = new BitbucketService(
        createDefaultConfig({
          platform: VcsPlatform.BITBUCKET_SELF_HOSTED,
          host: 'https://bitbucket.example.com',
        })
      );

      const result = await service.repositoryExists('PROJ', 'myrepo');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/latest/projects/PROJ/repos/myrepo'),
        expect.any(Object)
      );
    });
  });

  describe('getRepositories', () => {
    it('should return repositories for a workspace', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          values: [
            {
              name: 'repo1',
              slug: 'repo1',
              full_name: 'myworkspace/repo1',
              mainbranch: { name: 'main' },
              is_private: false,
              links: {
                html: { href: 'https://bitbucket.org/myworkspace/repo1' },
                clone: [{ name: 'https', href: 'https://bitbucket.org/myworkspace/repo1.git' }],
              },
            },
            {
              name: 'repo2',
              slug: 'repo2',
              full_name: 'myworkspace/repo2',
              mainbranch: { name: 'main' },
              is_private: true,
              links: {
                html: { href: 'https://bitbucket.org/myworkspace/repo2' },
                clone: [{ name: 'https', href: 'https://bitbucket.org/myworkspace/repo2.git' }],
              },
            },
          ],
        })
      );

      const service = new BitbucketService(createDefaultConfig());
      const result = await service.getRepositories('myworkspace');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('repo1');
      expect(result[1].name).toBe('repo2');
    });

    it('should return repositories for a self-hosted project', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          isLastPage: true,
          values: [
            {
              name: 'repo1',
              slug: 'repo1',
              archived: false,
              public: true,
              defaultBranch: { displayId: 'main' },
              links: {
                self: [{ href: 'https://bitbucket.example.com/projects/PROJ/repos/repo1/browse' }],
                clone: [{ name: 'http', href: 'https://bitbucket.example.com/scm/proj/repo1.git' }],
              },
            },
          ],
        })
      );

      const service = new BitbucketService(
        createDefaultConfig({
          platform: VcsPlatform.BITBUCKET_SELF_HOSTED,
          host: 'https://bitbucket.example.com',
        })
      );

      const result = await service.getRepositories('PROJ');
      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe('PROJ/repo1');
      expect(result[0].private).toBe(false);
    });
  });

  describe('findIacFilesInRepository', () => {
    it('should discover IaC files and return file content', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            values: [
              { path: 'main.tf', type: 'commit_file', size: 20 },
              { path: 'modules', type: 'commit_directory' },
            ],
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            values: [{ path: 'modules/vpc.tf', type: 'commit_file', size: 30 }],
          })
        )
        .mockResolvedValueOnce(createMockResponse('resource "aws_vpc" "main" {}', 200))
        .mockResolvedValueOnce(createMockResponse('module "vpc" {}', 200));

      const service = new BitbucketService(createDefaultConfig());
      const repository = {
        owner: 'myworkspace',
        name: 'myrepo',
        fullName: 'myworkspace/myrepo',
        defaultBranch: 'main',
        archived: false,
        private: false,
        url: 'https://bitbucket.org/myworkspace/myrepo',
        cloneUrl: 'https://bitbucket.org/myworkspace/myrepo.git',
      };

      const files = await service.findIacFilesInRepository(repository, {
        fileTypes: ['terraform', 'terragrunt'],
      });

      expect(files).toHaveLength(2);
      expect(files.map(file => file.path)).toEqual(['main.tf', 'modules/vpc.tf']);
    });

    it('should discover IaC files in self-hosted repository and return file content', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            isLastPage: true,
            values: ['main.tf', 'docs/readme.md', 'modules/vpc.tf'],
          })
        )
        .mockResolvedValueOnce(createMockResponse('resource "aws_vpc" "main" {}', 200))
        .mockResolvedValueOnce(createMockResponse('module "vpc" {}', 200));

      const service = new BitbucketService(
        createDefaultConfig({
          platform: VcsPlatform.BITBUCKET_SELF_HOSTED,
          host: 'https://bitbucket.example.com',
        })
      );

      const repository = {
        owner: 'PROJ',
        name: 'myrepo',
        fullName: 'PROJ/myrepo',
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: 'https://bitbucket.example.com/projects/PROJ/repos/myrepo',
        cloneUrl: 'https://bitbucket.example.com/scm/proj/myrepo.git',
      };

      const files = await service.findIacFilesInRepository(repository, {
        fileTypes: ['terraform', 'terragrunt'],
      });

      expect(files).toHaveLength(2);
      expect(files.map(file => file.path)).toEqual(['main.tf', 'modules/vpc.tf']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/latest/projects/PROJ/repos/myrepo/files'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/latest/projects/PROJ/repos/myrepo/raw/main.tf'),
        expect.any(Object)
      );
    });
  });
});
