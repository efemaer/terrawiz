import { VcsServiceFactory } from '../../../src/vcs/factory';
import { VcsPlatform } from '../../../src/types';
import { LocalFilesystemService } from '../../../src/vcs/local';

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

    it('should create Local Filesystem service', () => {
      const config = {
        platform: VcsPlatform.LOCAL,
        debug: false,
      };

      const service = VcsServiceFactory.createService(config);
      expect(service).toBeInstanceOf(LocalFilesystemService);
    });

    it('should throw error for unsupported GitLab platform', () => {
      const config = {
        platform: VcsPlatform.GITLAB,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow(
        'Platform gitlab is not yet supported. Currently supported platforms: github, local'
      );
    });

    it('should throw error for unsupported Bitbucket platform', () => {
      const config = {
        platform: VcsPlatform.BITBUCKET,
        debug: false,
      };

      expect(() => VcsServiceFactory.createService(config)).toThrow(
        'Platform bitbucket is not yet supported. Currently supported platforms: github, local'
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
    it('should return list of supported platforms', () => {
      const platforms = VcsServiceFactory.getSupportedPlatforms();
      expect(platforms).toEqual([VcsPlatform.GITHUB, VcsPlatform.LOCAL]);
    });
  });

  describe('isPlatformSupported', () => {
    it('should return true for supported platforms', () => {
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITHUB)).toBe(true);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.LOCAL)).toBe(true);
    });

    it('should return false for unsupported platforms', () => {
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITLAB)).toBe(false);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.BITBUCKET)).toBe(false);
      expect(VcsServiceFactory.isPlatformSupported(VcsPlatform.GITHUB_ENTERPRISE)).toBe(false);
    });
  });
});
