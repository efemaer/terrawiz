import { VcsRepository } from '../types';

/**
 * Common interface for raw repository data from different VCS platforms
 */
export interface RawRepository {
  name: string;
  fullName: string;
  defaultBranch: string;
  archived: boolean;
  private: boolean;
  url: string;
  cloneUrl: string;
  owner: { login?: string; path?: string; name?: string };
}

/**
 * Maps raw repository data to standardized VcsRepository format
 */
export function mapToVcsRepository(raw: RawRepository): VcsRepository {
  return {
    owner: raw.owner.login || raw.owner.path || raw.owner.name || '',
    name: raw.name,
    fullName: raw.fullName,
    defaultBranch: raw.defaultBranch,
    archived: raw.archived,
    private: raw.private,
    url: raw.url,
    cloneUrl: raw.cloneUrl,
  };
}

/**
 * Creates a GitHub-compatible raw repository object
 */
export function createGitHubRawRepository(repo: {
  name: string;
  full_name: string;
  default_branch: string;
  archived: boolean;
  private: boolean;
  html_url: string;
  clone_url: string;
  owner: { login: string };
}): RawRepository {
  return {
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    archived: repo.archived,
    private: repo.private,
    url: repo.html_url,
    cloneUrl: repo.clone_url,
    owner: { login: repo.owner.login },
  };
}

/**
 * Creates a GitLab-compatible raw repository object
 */
export function createGitLabRawRepository(project: {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  archived: boolean;
  visibility: string;
  web_url: string;
  http_url_to_repo: string;
  namespace: { path: string };
}): RawRepository {
  return {
    name: project.name,
    fullName: project.path_with_namespace,
    defaultBranch: project.default_branch,
    archived: project.archived,
    private: project.visibility !== 'public',
    url: project.web_url,
    cloneUrl: project.http_url_to_repo,
    owner: { path: project.namespace.path },
  };
}

/**
 * Standardized cache key generation for repositories
 */
export function createRepositoryCacheKey(
  platform: string,
  operation: string,
  owner: string,
  repo?: string,
  ...additionalParams: string[]
): string {
  const parts = [platform, operation, owner];
  if (repo) {
    parts.push(repo);
  }
  parts.push(...additionalParams);
  
  // Sanitize cache key - remove invalid characters
  return parts
    .map(part => part.replace(/[^\w-]/g, '_'))
    .join(':');
}