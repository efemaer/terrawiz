import { VcsServiceFactory } from '../../../src/vcs/factory';
import { VcsPlatform } from '../../../src/types';

// Mock the GitHub service to avoid ES module import issues in tests
jest.mock('../../../src/vcs/github', () => ({
  GitHubService: jest.fn().mockImplementation(() => ({
    platformName: 'GitHub',
  })),
}));

describe('VcsServiceFactory', () => {
  describe('createService', () => {
    it('should create GitHub service', () => {
      const config = {
        platform: VcsPlatform.GITHUB,
        githubToken: 'test-token',
        debug: false,
      };

      const service = VcsServiceFactory.createService(config);
      expect(service).toBeDefined();
      expect(service.platformName).toBe('GitHub');
    });

    it('should throw error for local filesystem platform (handled separately)', () => {
      const config = {
        platform: VcsPlatform.LOCAL,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow(
        'Local filesystem scanning is now handled by LocalFilesystemScanner'
      );
    });

    it('should throw error for unsupported GitLab platform', () => {
      const config = {
        platform: VcsPlatform.GITLAB,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow(
        'Platform gitlab is not yet supported. Currently supported platforms: github'
      );
    });

    it('should throw error for unsupported Bitbucket platform', () => {
      const config = {
        platform: VcsPlatform.BITBUCKET,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow(
        'Platform bitbucket is not yet supported. Currently supported platforms: github'
      );
    });

    it('should throw error for unknown platform', () => {
      const config = {
        platform: 'unknown' as VcsPlatform,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow('Unknown platform: unknown');
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return list of supported VCS platforms (local handled separately)', () => {
      const platforms = VcsServiceFactory.getSupportedPlatforms();
      expect(platforms).toEqual([VcsPlatform.GITHUB]);
    });
  });

  describe('isPlatformSupported', () => {
    it('should return true for supported VCS platforms', () => {
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITHUB)).toBe(true);
    });

    it('should return false for unsupported platforms and local (handled separately)', () => {
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.LOCAL)).toBe(false);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITLAB)).toBe(false);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.BITBUCKET)).toBe(false);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITHUB_ENTERPRISE)).toBe(false);
    });
  });
});
