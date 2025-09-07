import { VcsPlatform } from '../types';
import * as path from 'path';

/**
 * Parsed source information
 */
export interface ParsedSource {
  platform: VcsPlatform;
  identifier: string; // org/group/path
  repository?: string; // specific repo if provided
  host?: string; // custom host for self-hosted instances
  originalInput: string;
}

/**
 * Parse source URI into platform and identifier components
 *
 * Supported formats:
 * - github:org[/repo]
 * - gitlab:group[/project]
 * - gitlab://custom-host.com/group[/project] (self-hosted)
 * - bitbucket:workspace[/repo]
 * - local:/absolute/path
 * - local:./relative/path
 * - local:../relative/path
 */
export function parseSource(source: string): ParsedSource {
  if (!source || typeof source !== 'string') {
    throw new Error('Source must be a non-empty string');
  }

  // Check for URL-style format (e.g., gitlab://custom-host.com/group/project)
  if (source.includes('://')) {
    return parseUrlStyleSource(source);
  }

  const colonIndex = source.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(
      `Invalid source format: "${source}". Expected format: platform:identifier (e.g., github:myorg, local:/path/to/dir)`
    );
  }

  const platformStr = source.substring(0, colonIndex).toLowerCase();
  const remainder = source.substring(colonIndex + 1);

  if (!remainder) {
    throw new Error(`Missing identifier after "${platformStr}:"`);
  }

  // Validate and normalize platform
  const platform = validateAndNormalizePlatform(platformStr);

  // Parse identifier based on platform
  if (platform === VcsPlatform.LOCAL) {
    return parseLocalSource(source, remainder);
  } else {
    return parseVcsSource(source, platform, remainder);
  }
}

/**
 * Parse URL-style source (e.g., gitlab://custom-host.com/group/project)
 */
function parseUrlStyleSource(originalInput: string): ParsedSource {
  try {
    const url = new URL(originalInput);
    const protocol = url.protocol.slice(0, -1); // Remove trailing ':'

    // Validate and normalize platform
    const platform = validateAndNormalizePlatform(protocol);

    // Extract path components
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length === 0) {
      throw new Error(`Invalid URL: missing group/organization in path`);
    }

    const identifier = pathParts[0];
    const repository = pathParts.length > 1 ? pathParts.slice(1).join('/') : undefined;

    // For self-hosted instances, determine the platform variant
    let adjustedPlatform = platform;
    if (platform === VcsPlatform.GITLAB && url.hostname !== 'gitlab.com') {
      adjustedPlatform = VcsPlatform.GITLAB_SELF_HOSTED;
    } else if (platform === VcsPlatform.GITHUB && url.hostname !== 'github.com') {
      adjustedPlatform = VcsPlatform.GITHUB_SELF_HOSTED;
    }

    // Construct the host URL manually since platform:// is not a standard protocol
    const host = `https://${url.hostname}${url.port ? `:${url.port}` : ''}`;

    return {
      platform: adjustedPlatform,
      identifier,
      repository,
      host,
      originalInput,
    };
  } catch (error) {
    throw new Error(
      `Invalid URL format: "${originalInput}". ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse local filesystem source
 */
function parseLocalSource(originalInput: string, pathStr: string): ParsedSource {
  // Handle relative paths
  let normalizedPath: string;

  if (pathStr.startsWith('./') || pathStr.startsWith('../')) {
    // Relative path - resolve to absolute
    normalizedPath = path.resolve(process.cwd(), pathStr);
  } else if (path.isAbsolute(pathStr)) {
    // Already absolute
    normalizedPath = path.normalize(pathStr);
  } else {
    // Treat as relative to current directory
    normalizedPath = path.resolve(process.cwd(), pathStr);
  }

  return {
    platform: VcsPlatform.LOCAL,
    identifier: normalizedPath,
    originalInput,
  };
}

/**
 * Parse VCS source (GitHub, GitLab, etc.)
 */
function parseVcsSource(
  originalInput: string,
  platform: VcsPlatform,
  remainder: string
): ParsedSource {
  // Split on '/' to separate org/group from repo/project
  const parts = remainder.split('/');

  if (parts.length === 0 || !parts[0]) {
    throw new Error(`Invalid ${platform} identifier: "${remainder}". Expected format: org[/repo]`);
  }

  const identifier = parts[0];
  const repository = parts.length > 1 ? parts.slice(1).join('/') : undefined;

  // Validate identifier format (basic validation)
  if (!/^[a-zA-Z0-9._-]+$/.test(identifier)) {
    throw new Error(
      `Invalid ${platform} identifier: "${identifier}". Must contain only alphanumeric characters, dots, hyphens, and underscores.`
    );
  }

  // Validate repository name if provided
  if (repository && !/^[a-zA-Z0-9._/-]+$/.test(repository)) {
    throw new Error(
      `Invalid ${platform} repository: "${repository}". Must contain only alphanumeric characters, dots, hyphens, underscores, and slashes.`
    );
  }

  return {
    platform,
    identifier,
    repository,
    originalInput,
  };
}

/**
 * Validate and normalize platform string
 */
function validateAndNormalizePlatform(platformStr: string): VcsPlatform {
  const normalizedPlatform = platformStr.toLowerCase();

  // Map platform strings to enum values
  const platformMap: Record<string, VcsPlatform> = {
    github: VcsPlatform.GITHUB,
    gh: VcsPlatform.GITHUB, // Short alias
    gitlab: VcsPlatform.GITLAB,
    gl: VcsPlatform.GITLAB, // Short alias
    bitbucket: VcsPlatform.BITBUCKET,
    bb: VcsPlatform.BITBUCKET, // Short alias
    local: VcsPlatform.LOCAL,
    file: VcsPlatform.LOCAL, // Alternative alias
    fs: VcsPlatform.LOCAL, // Alternative alias
  };

  const platform = platformMap[normalizedPlatform];
  if (!platform) {
    const supportedPlatforms = Object.keys(platformMap).join(', ');
    throw new Error(
      `Unsupported platform: "${platformStr}". Supported platforms: ${supportedPlatforms}`
    );
  }

  return platform;
}

/**
 * Convert legacy org/repo parameters to new source format
 * Used for backward compatibility
 */
export function convertLegacyToSource(org: string, repo?: string): string {
  if (!org) {
    throw new Error('Organization is required');
  }

  // Default to GitHub for legacy format
  if (repo) {
    return `github:${org}/${repo}`;
  } else {
    return `github:${org}`;
  }
}

/**
 * Get display name for platform
 */
export function getPlatformDisplayName(platform: VcsPlatform): string {
  const displayNames: Record<VcsPlatform, string> = {
    [VcsPlatform.GITHUB]: 'GitHub',
    [VcsPlatform.GITHUB_SELF_HOSTED]: 'GitHub Self-Hosted',
    [VcsPlatform.GITLAB]: 'GitLab',
    [VcsPlatform.GITLAB_SELF_HOSTED]: 'GitLab Self-Hosted',
    [VcsPlatform.BITBUCKET]: 'Bitbucket',
    [VcsPlatform.BITBUCKET_SELF_HOSTED]: 'Bitbucket Self-Hosted',
    [VcsPlatform.LOCAL]: 'Local Filesystem',
  };

  return displayNames[platform] || platform;
}
