import {
  isNotFoundError,
  isRateLimitError,
  isAuthError,
  extractErrorMessage,
} from '../../../src/utils/error-handler';
import { VcsPlatform } from '../../../src/types';

describe('Error Handler Utils', () => {
  describe('isNotFoundError', () => {
    it('should detect GitHub 404 errors', () => {
      const error = { status: 404 };
      expect(isNotFoundError(error, VcsPlatform.GITHUB)).toBe(true);
      expect(isNotFoundError(error, VcsPlatform.GITHUB_SELF_HOSTED)).toBe(true);
    });

    it('should detect GitLab 404 errors', () => {
      const error = { response: { status: 404 } };
      expect(isNotFoundError(error, VcsPlatform.GITLAB)).toBe(true);
      expect(isNotFoundError(error, VcsPlatform.GITLAB_SELF_HOSTED)).toBe(true);
    });

    it('should return false for non-404 errors', () => {
      const githubError = { status: 500 };
      const gitlabError = { response: { status: 500 } };

      expect(isNotFoundError(githubError, VcsPlatform.GITHUB)).toBe(false);
      expect(isNotFoundError(gitlabError, VcsPlatform.GITLAB)).toBe(false);
    });

    it('should return false for invalid error objects', () => {
      expect(isNotFoundError(null, VcsPlatform.GITHUB)).toBe(false);
      expect(isNotFoundError('string error', VcsPlatform.GITLAB)).toBe(false);
      expect(isNotFoundError({}, VcsPlatform.GITHUB)).toBe(false);
    });
  });

  describe('isRateLimitError', () => {
    it('should detect GitHub rate limit errors', () => {
      const error = { status: 429 };
      expect(isRateLimitError(error, VcsPlatform.GITHUB)).toBe(true);
    });

    it('should detect GitLab rate limit errors', () => {
      const error = { response: { status: 429 } };
      expect(isRateLimitError(error, VcsPlatform.GITLAB)).toBe(true);
    });

    it('should return false for non-rate-limit errors', () => {
      const githubError = { status: 404 };
      const gitlabError = { response: { status: 404 } };

      expect(isRateLimitError(githubError, VcsPlatform.GITHUB)).toBe(false);
      expect(isRateLimitError(gitlabError, VcsPlatform.GITLAB)).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('should detect GitHub auth errors', () => {
      const error401 = { status: 401 };
      const error403 = { status: 403 };

      expect(isAuthError(error401, VcsPlatform.GITHUB)).toBe(true);
      expect(isAuthError(error403, VcsPlatform.GITHUB)).toBe(true);
    });

    it('should detect GitLab auth errors', () => {
      const error401 = { response: { status: 401 } };
      const error403 = { response: { status: 403 } };

      expect(isAuthError(error401, VcsPlatform.GITLAB)).toBe(true);
      expect(isAuthError(error403, VcsPlatform.GITLAB)).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      const githubError = { status: 404 };
      const gitlabError = { response: { status: 500 } };

      expect(isAuthError(githubError, VcsPlatform.GITHUB)).toBe(false);
      expect(isAuthError(gitlabError, VcsPlatform.GITLAB)).toBe(false);
    });
  });

  describe('extractErrorMessage', () => {
    it('should extract GitHub error messages', () => {
      const error = { message: 'GitHub API error' };
      expect(extractErrorMessage(error, VcsPlatform.GITHUB)).toBe('GitHub API error');
    });

    it('should extract GitLab error messages', () => {
      const error = { response: { data: { message: 'GitLab API error' } } };
      expect(extractErrorMessage(error, VcsPlatform.GITLAB)).toBe('GitLab API error');
    });

    it('should handle Error instances', () => {
      const error = new Error('Test error');
      expect(extractErrorMessage(error, VcsPlatform.GITHUB)).toBe('Test error');
    });

    it('should convert non-Error objects to strings', () => {
      expect(extractErrorMessage('string error', VcsPlatform.GITHUB)).toBe('string error');
      expect(extractErrorMessage(123, VcsPlatform.GITLAB)).toBe('123');
    });

    it('should handle complex error structures', () => {
      const gitlabError = {
        response: {
          data: {
            message: 'Detailed GitLab error',
          },
        },
      };
      expect(extractErrorMessage(gitlabError, VcsPlatform.GITLAB)).toBe('Detailed GitLab error');
    });
  });
});
