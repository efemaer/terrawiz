import { VcsPlatform } from '../types';

/**
 * Utility functions for standardized error handling across VCS platforms
 */

/**
 * Check if an error represents a "not found" (404) response for the given platform
 */
export function isNotFoundError(error: unknown, platform: VcsPlatform): boolean {
  if (platform === VcsPlatform.GITHUB || platform === VcsPlatform.GITHUB_SELF_HOSTED) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status: number }).status === 404
    );
  }

  if (platform === VcsPlatform.GITLAB || platform === VcsPlatform.GITLAB_SELF_HOSTED) {
    return hasResponseStatus(error, 404);
  }

  if (
    platform === VcsPlatform.AZURE_DEVOPS ||
    platform === VcsPlatform.AZURE_DEVOPS_SELF_HOSTED ||
    platform === VcsPlatform.BITBUCKET ||
    platform === VcsPlatform.BITBUCKET_SELF_HOSTED
  ) {
    return hasResponseStatus(error, 404);
  }

  return false;
}

/**
 * Check if an error represents a rate limit response for the given platform
 */
export function isRateLimitError(error: unknown, platform: VcsPlatform): boolean {
  if (platform === VcsPlatform.GITHUB || platform === VcsPlatform.GITHUB_SELF_HOSTED) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status: number }).status === 429
    );
  }

  if (platform === VcsPlatform.GITLAB || platform === VcsPlatform.GITLAB_SELF_HOSTED) {
    return hasResponseStatus(error, 429);
  }

  if (
    platform === VcsPlatform.AZURE_DEVOPS ||
    platform === VcsPlatform.AZURE_DEVOPS_SELF_HOSTED ||
    platform === VcsPlatform.BITBUCKET ||
    platform === VcsPlatform.BITBUCKET_SELF_HOSTED
  ) {
    return hasResponseStatus(error, 429);
  }

  return false;
}

/**
 * Check if an error represents an authentication/authorization issue
 */
export function isAuthError(error: unknown, platform: VcsPlatform): boolean {
  const statusCodes = [401, 403];

  if (platform === VcsPlatform.GITHUB || platform === VcsPlatform.GITHUB_SELF_HOSTED) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'status' in error &&
      statusCodes.includes((error as { status: number }).status)
    );
  }

  if (platform === VcsPlatform.GITLAB || platform === VcsPlatform.GITLAB_SELF_HOSTED) {
    return hasResponseStatus(error, ...statusCodes);
  }

  if (
    platform === VcsPlatform.AZURE_DEVOPS ||
    platform === VcsPlatform.AZURE_DEVOPS_SELF_HOSTED ||
    platform === VcsPlatform.BITBUCKET ||
    platform === VcsPlatform.BITBUCKET_SELF_HOSTED
  ) {
    return hasResponseStatus(error, ...statusCodes);
  }

  return false;
}

/**
 * Extract error message from platform-specific error objects
 */
export function extractErrorMessage(error: unknown, platform: VcsPlatform): string {
  if (platform === VcsPlatform.GITHUB || platform === VcsPlatform.GITHUB_SELF_HOSTED) {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }

  if (platform === VcsPlatform.GITLAB || platform === VcsPlatform.GITLAB_SELF_HOSTED) {
    return extractResponseMessage(error);
  }

  if (platform === VcsPlatform.AZURE_DEVOPS || platform === VcsPlatform.AZURE_DEVOPS_SELF_HOSTED) {
    return extractResponseMessage(error);
  }

  if (platform === VcsPlatform.BITBUCKET || platform === VcsPlatform.BITBUCKET_SELF_HOSTED) {
    const responseMessage = extractResponseMessage(error);
    if (responseMessage !== String(error)) {
      return responseMessage;
    }

    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response: unknown }).response;
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as { data: unknown }).data;
        if (data && typeof data === 'object' && 'error' in data) {
          const nestedError = (data as { error: unknown }).error;
          if (nestedError && typeof nestedError === 'object' && 'message' in nestedError) {
            return String((nestedError as { message: unknown }).message);
          }
        }
      }
    }

    return error instanceof Error ? error.message : String(error);
  }

  return error instanceof Error ? error.message : String(error);
}

function hasResponseStatus(error: unknown, ...expectedStatuses: number[]): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    expectedStatuses.includes((error.response as { status: number }).status)
  );
}

function extractResponseMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
  ) {
    const data = (error.response as { data: unknown }).data;
    if (data && typeof data === 'object' && 'message' in data) {
      return String((data as { message: unknown }).message);
    }
  }

  return error instanceof Error ? error.message : String(error);
}
