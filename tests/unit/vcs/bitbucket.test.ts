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
  });
});
