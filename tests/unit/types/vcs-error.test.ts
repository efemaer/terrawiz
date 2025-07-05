import { VcsError, VcsErrorType, VcsPlatform } from '../../../src/types';

describe('VcsError', () => {
  describe('constructor', () => {
    it('should create basic VcsError', () => {
      const error = new VcsError('Test error', VcsErrorType.RESOURCE_NOT_FOUND, VcsPlatform.GITHUB);

      expect(error.message).toBe('Test error');
      expect(error.type).toBe(VcsErrorType.RESOURCE_NOT_FOUND);
      expect(error.platform).toBe(VcsPlatform.GITHUB);
      expect(error.statusCode).toBeUndefined();
      expect(error.originalError).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(error.name).toBe('VcsError');
    });

    it('should create VcsError with all parameters', () => {
      const originalError = new Error('Original error');
      const error = new VcsError(
        'Test error',
        VcsErrorType.NETWORK_ERROR,
        VcsPlatform.LOCAL,
        500,
        originalError,
        true
      );

      expect(error.message).toBe('Test error');
      expect(error.type).toBe(VcsErrorType.NETWORK_ERROR);
      expect(error.platform).toBe(VcsPlatform.LOCAL);
      expect(error.statusCode).toBe(500);
      expect(error.originalError).toBe(originalError);
      expect(error.retryable).toBe(true);
    });
  });

  describe('isRetryable', () => {
    it('should return true for rate limit exceeded errors', () => {
      const error = new VcsError(
        'Rate limit exceeded',
        VcsErrorType.RATE_LIMIT_EXCEEDED,
        VcsPlatform.GITHUB,
        429,
        undefined,
        false // Even though retryable is false, rate limit should be retryable
      );

      expect(error.isRetryable()).toBe(true);
    });

    it('should return true when retryable flag is set', () => {
      const error = new VcsError(
        'Network error',
        VcsErrorType.NETWORK_ERROR,
        VcsPlatform.GITHUB,
        undefined,
        undefined,
        true
      );

      expect(error.isRetryable()).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new VcsError(
        'Authentication failed',
        VcsErrorType.AUTHENTICATION_FAILED,
        VcsPlatform.GITHUB,
        401,
        undefined,
        false
      );

      expect(error.isRetryable()).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('should return friendly message for authentication failed', () => {
      const error = new VcsError(
        'Technical auth error',
        VcsErrorType.AUTHENTICATION_FAILED,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe(
        'Authentication failed. Please check your token or credentials.'
      );
    });

    it('should return friendly message for authorization failed', () => {
      const error = new VcsError(
        'Technical auth error',
        VcsErrorType.AUTHORIZATION_FAILED,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe(
        'Access denied. You may not have permission to access this resource.'
      );
    });

    it('should return friendly message for resource not found', () => {
      const error = new VcsError(
        'Technical not found error',
        VcsErrorType.RESOURCE_NOT_FOUND,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe('The requested resource was not found.');
    });

    it('should return friendly message for rate limit exceeded', () => {
      const error = new VcsError(
        'Technical rate limit error',
        VcsErrorType.RATE_LIMIT_EXCEEDED,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe(
        'Rate limit exceeded. Please wait before making more requests.'
      );
    });

    it('should return friendly message for network error', () => {
      const error = new VcsError(
        'Technical network error',
        VcsErrorType.NETWORK_ERROR,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe('Network error occurred. Please check your connection.');
    });

    it('should return friendly message for invalid configuration', () => {
      const error = new VcsError(
        'Technical config error',
        VcsErrorType.INVALID_CONFIGURATION,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe('Invalid configuration. Please check your settings.');
    });

    it('should return original message for unknown error types', () => {
      const error = new VcsError(
        'Custom error message',
        VcsErrorType.PLATFORM_ERROR,
        VcsPlatform.GITHUB
      );

      expect(error.getUserMessage()).toBe('Custom error message');
    });

    it('should return original message for unknown error type', () => {
      const error = new VcsError('Unknown issue', VcsErrorType.UNKNOWN_ERROR, VcsPlatform.GITHUB);

      expect(error.getUserMessage()).toBe('Unknown issue');
    });
  });

  describe('error inheritance', () => {
    it('should be instanceof Error', () => {
      const error = new VcsError('Test error', VcsErrorType.RESOURCE_NOT_FOUND, VcsPlatform.GITHUB);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(VcsError);
    });

    it('should have correct stack trace', () => {
      const error = new VcsError('Test error', VcsErrorType.RESOURCE_NOT_FOUND, VcsPlatform.GITHUB);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('VcsError');
    });
  });
});
