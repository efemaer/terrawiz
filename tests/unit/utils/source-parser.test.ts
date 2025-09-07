import {
  parseSource,
  convertLegacyToSource,
  getPlatformDisplayName,
} from '../../../src/utils/source-parser';
import { VcsPlatform } from '../../../src/types';
import * as path from 'path';

describe('Source Parser', () => {
  describe('parseSource', () => {
    describe('GitHub sources', () => {
      it('should parse GitHub organization', () => {
        const result = parseSource('github:myorg');
        expect(result).toEqual({
          platform: VcsPlatform.GITHUB,
          identifier: 'myorg',
          repository: undefined,
          originalInput: 'github:myorg',
        });
      });

      it('should parse GitHub organization with repository', () => {
        const result = parseSource('github:myorg/myrepo');
        expect(result).toEqual({
          platform: VcsPlatform.GITHUB,
          identifier: 'myorg',
          repository: 'myrepo',
          originalInput: 'github:myorg/myrepo',
        });
      });

      it('should parse GitHub with nested repository path', () => {
        const result = parseSource('github:myorg/myrepo/subfolder');
        expect(result).toEqual({
          platform: VcsPlatform.GITHUB,
          identifier: 'myorg',
          repository: 'myrepo/subfolder',
          originalInput: 'github:myorg/myrepo/subfolder',
        });
      });

      it('should handle GitHub alias "gh"', () => {
        const result = parseSource('gh:myorg');
        expect(result.platform).toBe(VcsPlatform.GITHUB);
        expect(result.identifier).toBe('myorg');
      });
    });

    describe('GitLab sources', () => {
      it('should parse GitLab group', () => {
        const result = parseSource('gitlab:mygroup');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB,
          identifier: 'mygroup',
          repository: undefined,
          originalInput: 'gitlab:mygroup',
        });
      });

      it('should parse GitLab group with project', () => {
        const result = parseSource('gitlab:mygroup/myproject');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB,
          identifier: 'mygroup',
          repository: 'myproject',
          originalInput: 'gitlab:mygroup/myproject',
        });
      });

      it('should handle GitLab alias "gl"', () => {
        const result = parseSource('gl:mygroup');
        expect(result.platform).toBe(VcsPlatform.GITLAB);
        expect(result.identifier).toBe('mygroup');
      });
    });

    describe('Bitbucket sources', () => {
      it('should parse Bitbucket workspace', () => {
        const result = parseSource('bitbucket:myworkspace');
        expect(result).toEqual({
          platform: VcsPlatform.BITBUCKET,
          identifier: 'myworkspace',
          repository: undefined,
          originalInput: 'bitbucket:myworkspace',
        });
      });

      it('should handle Bitbucket alias "bb"', () => {
        const result = parseSource('bb:myworkspace');
        expect(result.platform).toBe(VcsPlatform.BITBUCKET);
        expect(result.identifier).toBe('myworkspace');
      });
    });

    describe('Local sources', () => {
      it('should parse absolute local path', () => {
        const result = parseSource('local:/path/to/directory');
        expect(result).toEqual({
          platform: VcsPlatform.LOCAL,
          identifier: '/path/to/directory',
          repository: undefined,
          originalInput: 'local:/path/to/directory',
        });
      });

      it('should parse relative local path', () => {
        const relativePath = './my-directory';
        const result = parseSource(`local:${relativePath}`);
        const expectedPath = path.resolve(process.cwd(), relativePath);

        expect(result).toEqual({
          platform: VcsPlatform.LOCAL,
          identifier: expectedPath,
          repository: undefined,
          originalInput: `local:${relativePath}`,
        });
      });

      it('should parse parent relative local path', () => {
        const relativePath = '../parent-directory';
        const result = parseSource(`local:${relativePath}`);
        const expectedPath = path.resolve(process.cwd(), relativePath);

        expect(result).toEqual({
          platform: VcsPlatform.LOCAL,
          identifier: expectedPath,
          repository: undefined,
          originalInput: `local:${relativePath}`,
        });
      });

      it('should handle non-prefixed relative path as relative to cwd', () => {
        const result = parseSource('local:my-directory');
        const expectedPath = path.resolve(process.cwd(), 'my-directory');

        expect(result).toEqual({
          platform: VcsPlatform.LOCAL,
          identifier: expectedPath,
          repository: undefined,
          originalInput: 'local:my-directory',
        });
      });

      it('should handle local aliases', () => {
        expect(parseSource('file:/tmp').platform).toBe(VcsPlatform.LOCAL);
        expect(parseSource('fs:/tmp').platform).toBe(VcsPlatform.LOCAL);
      });
    });

    describe('GitLab URL format', () => {
      it('should parse GitLab.com URL format', () => {
        const result = parseSource('gitlab://gitlab.com/my-group/my-project');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB,
          identifier: 'my-group',
          repository: 'my-project',
          host: 'https://gitlab.com',
          originalInput: 'gitlab://gitlab.com/my-group/my-project',
        });
      });

      it('should parse self-hosted GitLab URL format', () => {
        const result = parseSource('gitlab://gitlab.example.com/my-group/my-project');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB_SELF_HOSTED,
          identifier: 'my-group',
          repository: 'my-project',
          host: 'https://gitlab.example.com',
          originalInput: 'gitlab://gitlab.example.com/my-group/my-project',
        });
      });

      it('should parse GitLab URL with just group', () => {
        const result = parseSource('gitlab://gitlab.example.com/my-group');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB_SELF_HOSTED,
          identifier: 'my-group',
          repository: undefined,
          host: 'https://gitlab.example.com',
          originalInput: 'gitlab://gitlab.example.com/my-group',
        });
      });

      it('should parse GitLab URL with nested group path', () => {
        const result = parseSource('gitlab://gitlab.example.com/parent-group/sub-group/project');
        expect(result).toEqual({
          platform: VcsPlatform.GITLAB_SELF_HOSTED,
          identifier: 'parent-group',
          repository: 'sub-group/project',
          host: 'https://gitlab.example.com',
          originalInput: 'gitlab://gitlab.example.com/parent-group/sub-group/project',
        });
      });

      it('should throw error for invalid GitLab URL format', () => {
        expect(() => parseSource('gitlab://gitlab.example.com')).toThrow(
          'Invalid URL: missing group/organization in path'
        );
      });

      it('should throw error for malformed URL', () => {
        expect(() => parseSource('gitlab://[invalid-url]')).toThrow('Invalid URL format');
      });
    });

    describe('Error cases', () => {
      it('should throw error for empty source', () => {
        expect(() => parseSource('')).toThrow('Source must be a non-empty string');
      });

      it('should throw error for null source', () => {
        expect(() => parseSource(null as any)).toThrow('Source must be a non-empty string');
      });

      it('should throw error for source without colon', () => {
        expect(() => parseSource('github-myorg')).toThrow(
          'Invalid source format: "github-myorg". Expected format: platform:identifier'
        );
      });

      it('should throw error for empty identifier', () => {
        expect(() => parseSource('github:')).toThrow('Missing identifier after "github:"');
      });

      it('should throw error for unsupported platform', () => {
        expect(() => parseSource('unsupported:identifier')).toThrow(
          'Unsupported platform: "unsupported"'
        );
      });

      it('should throw error for invalid identifier characters', () => {
        expect(() => parseSource('github:my@org')).toThrow('Invalid github identifier: "my@org"');
      });

      it('should throw error for invalid repository characters', () => {
        expect(() => parseSource('github:myorg/my@repo')).toThrow(
          'Invalid github repository: "my@repo"'
        );
      });
    });

    describe('Case sensitivity', () => {
      it('should handle uppercase platform names', () => {
        const result = parseSource('GITHUB:myorg');
        expect(result.platform).toBe(VcsPlatform.GITHUB);
      });

      it('should handle mixed case platform names', () => {
        const result = parseSource('GitHub:myorg');
        expect(result.platform).toBe(VcsPlatform.GITHUB);
      });
    });
  });

  describe('convertLegacyToSource', () => {
    it('should convert org only to GitHub format', () => {
      const result = convertLegacyToSource('myorg');
      expect(result).toBe('github:myorg');
    });

    it('should convert org and repo to GitHub format', () => {
      const result = convertLegacyToSource('myorg', 'myrepo');
      expect(result).toBe('github:myorg/myrepo');
    });

    it('should throw error for empty org', () => {
      expect(() => convertLegacyToSource('')).toThrow('Organization is required');
    });
  });

  describe('getPlatformDisplayName', () => {
    it('should return display names for all platforms', () => {
      expect(getPlatformDisplayName(VcsPlatform.GITHUB)).toBe('GitHub');
      expect(getPlatformDisplayName(VcsPlatform.GITHUB_SELF_HOSTED)).toBe('GitHub Self-Hosted');
      expect(getPlatformDisplayName(VcsPlatform.GITLAB)).toBe('GitLab');
      expect(getPlatformDisplayName(VcsPlatform.GITLAB_SELF_HOSTED)).toBe('GitLab Self-Hosted');
      expect(getPlatformDisplayName(VcsPlatform.BITBUCKET)).toBe('Bitbucket');
      expect(getPlatformDisplayName(VcsPlatform.BITBUCKET_SELF_HOSTED)).toBe('Bitbucket Self-Hosted');
      expect(getPlatformDisplayName(VcsPlatform.LOCAL)).toBe('Local Filesystem');
    });
  });
});
