import { Octokit } from '@octokit/rest';
import { throttling } from "@octokit/plugin-throttling";
import * as dotenv from 'dotenv';
import { Logger, LogLevel } from './logger';

dotenv.config();

export interface TerraformFile {
    repository: string;
    path: string;
    content: string;
    url: string;
}

/**
 * Repository information structure
 */
interface RepositoryInfo {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    archived: boolean;
}

/**
 * Tree item structure from GitHub API
 */
interface TreeItem {
    path: string;
    type: 'blob' | 'tree';
    url: string;
    sha: string;
}

/**
 * GitHub API repository response structure
 */
interface GitHubRepo {
    name: string;
    full_name: string;
    owner: {
        login: string;
    };
    default_branch: string;
    archived: boolean;
}

/**
 * GitHub API tree item response structure
 */
interface GitHubTreeItem {
    path?: string;
    mode?: string;
    type?: string;
    sha?: string;
    size?: number;
    url?: string;
}

/**
 * Configuration options for the GitHub service
 */
export interface GitHubServiceOptions {
    /** Enable debug logging */
    debug?: boolean;
    /** Use rate limit protection (default: true) */
    useRateLimit?: boolean;
    /** Skip archived repositories */
    skipArchived?: boolean;
}

/**
 * Service for interacting with GitHub API to find and process Terraform files
 */
export class GitHubService {
    private octokit: Octokit;
    private logger: Logger;
    /** Cache for repository status to avoid redundant API calls */
    private repoStatusCache = new Map<string, boolean>();
    private skipArchived: boolean;
    // Track processed repositories to avoid duplicate logs
    private processedRepoCache = new Set<string>();

    /**
     * Create a new GitHubService instance
     * @param options Configuration options
     */
    constructor(options: GitHubServiceOptions = {}) {
        const isDebugMode = options.debug || false;

        // Initialize logger with 'GitHub' component
        const logLevel = isDebugMode ? LogLevel.DEBUG : LogLevel.INFO;
        Logger.getInstance({ level: logLevel });
        this.logger = Logger.forComponent('GitHub');

        this.skipArchived = options.skipArchived !== false; // Default to true
        const useRateLimit = options.useRateLimit !== false; // Default to true

        // Get GitHub token
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error('GitHub token not found. Please add GITHUB_TOKEN to .env file');
        }

        // Configure Octokit with or without throttling plugin
        if (useRateLimit) {
            const CustomOctokit = Octokit.plugin(throttling);
            this.octokit = new CustomOctokit({
                auth: token,
                throttle: {
                    onRateLimit: (retryAfter, options, octokit, retryCount) => {
                        this.logger.warn(
                            `Request quota exhausted for ${options.method} ${options.url}`
                        );

                        if (retryCount < 1) { // Always retry once
                            this.logger.info(`Retrying after ${retryAfter} seconds`);
                            return true;
                        }

                        this.logger.error(`Rate limit exceeded, no more retries left`);
                        return false;
                    },
                    onSecondaryRateLimit: (retryAfter, options, octokit) => {
                        this.logger.warn(
                            `Secondary rate limit triggered for ${options.method} ${options.url}`
                        );
                        return false; // Don't retry on secondary rate limits by default
                    },
                },
            });
            this.logger.debug('GitHub service initialized with rate limit protection');
        } else {
            this.octokit = new Octokit({ auth: token });
            this.logger.debug('GitHub service initialized without rate limit protection');
        }

        this.logger.debug(`Debug mode: ${isDebugMode}, Skip archived: ${this.skipArchived}`);
    }

    /**
     * Check if a repository exists and is accessible
     * @param owner Repository owner
     * @param repo Repository name
     * @returns true if exists, false if not, null if archived and skipping archived
     */
    async repositoryExists(owner: string, repo: string): Promise<boolean | null> {
        const cacheKey = `${owner}/${repo}`;

        // Check cache first
        if (this.repoStatusCache.has(cacheKey)) {
            return this.repoStatusCache.get(cacheKey) as boolean;
        }

        try {
            const response = await this.octokit.repos.get({
                owner,
                repo
            });

            const repoInfo = {
                fullName: response.data.full_name,
                private: response.data.private,
                visibility: response.data.visibility,
                archived: response.data.archived
            };

            this.logger.debug(`Repository info: ${JSON.stringify(repoInfo)}`);

            // Skip archived repositories if specified
            if (this.skipArchived && response.data.archived) {
                this.logger.info(`Skipping archived repository: ${owner}/${repo}`);
                this.repoStatusCache.set(cacheKey, false);
                return null;
            }

            this.repoStatusCache.set(cacheKey, true);
            return true;
        } catch (error) {
            this.logger.errorWithStack(`Repository ${owner}/${repo} is not accessible`, error as Error);
            this.repoStatusCache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * Get all repositories in an organization or for a user
     * @param owner Organization or user name
     * @param maxRepos Maximum number of repositories to return (null for all)
     * @param perPage Number of repositories per page (max 100)
     */
    async getRepositories(owner: string, maxRepos: number | null = null, perPage: number = 100): Promise<RepositoryInfo[]> {
        try {
            this.logger.info(`Retrieving repositories for ${owner}...`);

            const repositories: RepositoryInfo[] = [];
            // Track skipped archived repositories for reporting
            let skippedCount = 0;

            // Determine if this is an organization or a user
            let isOrg = true;
            try {
                await this.octokit.orgs.get({ org: owner });
            } catch (error) {
                isOrg = false;
                this.logger.info(`${owner} is not an organization, treating as a user`);
            }

            const options = isOrg
                ? this.octokit.repos.listForOrg.endpoint.merge({ org: owner, per_page: perPage })
                : this.octokit.repos.listForUser.endpoint.merge({ username: owner, per_page: perPage });

            // Get rate limit info to show total pages estimate
            const rateLimit = await this.octokit.rateLimit.get();
            const remainingRequests = rateLimit.data.resources.core.remaining;
            this.logger.info(`Rate limit status: ${remainingRequests} requests remaining`);

            let currentPage = 1;
            let collectingRepos = true;
            let totalReposAvailable = 0; // We'll update this after the first page

            while (collectingRepos) {
                const response = await this.octokit.request(`${options.url}`, { ...options, page: currentPage });

                if (response.data.length === 0) {
                    break;
                }

                // On first page, try to get total count if available in headers
                if (currentPage === 1) {
                    const linkHeader = response.headers.link;
                    if (linkHeader) {
                        const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
                        if (lastPageMatch && lastPageMatch[1]) {
                            const lastPage = parseInt(lastPageMatch[1], 10);
                            totalReposAvailable = lastPage * perPage;
                            this.logger.info(`Found approximately ${totalReposAvailable} total repositories (${lastPage} pages)`);
                        }
                    }
                }

                // Filter out archived repositories if requested
                const filteredRepos = response.data.filter((repo: GitHubRepo) => {
                    const fullName = repo.full_name;

                    // Skip if already processed (avoids duplicate logging)
                    if (this.processedRepoCache.has(fullName)) {
                        return false;
                    }

                    // Mark as processed
                    this.processedRepoCache.add(fullName);

                    if (this.skipArchived && repo.archived) {
                        skippedCount++;
                        this.logger.debug(`Skipping archived repository: ${fullName}`);
                        return false;
                    }
                    return true;
                });

                // Map to our internal repository format
                const repoInfos: RepositoryInfo[] = filteredRepos.map((repo: GitHubRepo) => ({
                    owner: repo.owner.login,
                    name: repo.name,
                    fullName: repo.full_name,
                    defaultBranch: repo.default_branch,
                    archived: repo.archived
                }));

                repositories.push(...repoInfos);

                const totalProgress = totalReposAvailable > 0 ?
                    `(page ${currentPage}/${Math.ceil(totalReposAvailable / perPage)})` :
                    `(page ${currentPage})`;
                this.logger.info(`Retrieved ${repoInfos.length} active repositories ${totalProgress}, skipped ${skippedCount} archived repos, total active: ${repositories.length}`);

                // Check if we've reached the maximum
                if (maxRepos !== null && repositories.length >= maxRepos) {
                    repositories.splice(maxRepos); // Trim excess
                    collectingRepos = false;
                    this.logger.info(`Reached maximum repository limit (${maxRepos}), stopping retrieval`);
                }

                currentPage++;
            }

            this.logger.info(`Found ${repositories.length} active repositories for ${owner} (skipped ${skippedCount} archived)`);
            return repositories;

        } catch (error) {
            this.logger.errorWithStack(`Error retrieving repositories for ${owner}`, error as Error);
            throw error;
        }
    }

    /**
     * Get all Terraform files in a repository by traversing its tree
     * @param repoInfo Repository information
     */
    async getTerraformFilesFromRepo(repoInfo: RepositoryInfo): Promise<TerraformFile[]> {
        try {
            this.logger.info(`Getting Terraform files from ${repoInfo.fullName}...`);

            // Get reference to the default branch
            const reference = await this.octokit.git.getRef({
                owner: repoInfo.owner,
                repo: repoInfo.name,
                ref: `heads/${repoInfo.defaultBranch}`
            });

            const commitSha = reference.data.object.sha;

            // Get the commit
            const commit = await this.octokit.git.getCommit({
                owner: repoInfo.owner,
                repo: repoInfo.name,
                commit_sha: commitSha
            });

            const treeSha = commit.data.tree.sha;

            // Get the recursive tree
            const tree = await this.octokit.git.getTree({
                owner: repoInfo.owner,
                repo: repoInfo.name,
                tree_sha: treeSha,
                recursive: '1' // Recursive flag as string '1'
            });

            // Filter for .tf files
            const terraformFiles: { path: string; url: string; sha: string }[] = tree.data.tree
                .filter((item: GitHubTreeItem) =>
                    item.type === 'blob' && item.path && item.path.endsWith('.tf') && item.sha
                )
                .map((item: GitHubTreeItem) => ({
                    path: item.path as string,
                    url: `https://github.com/${repoInfo.fullName}/blob/${repoInfo.defaultBranch}/${item.path}`,
                    sha: item.sha as string
                }));

            if (terraformFiles.length === 0) {
                this.logger.info(`No Terraform files found in ${repoInfo.fullName}`);
                return [];
            }

            this.logger.info(`Found ${terraformFiles.length} Terraform files in ${repoInfo.fullName}`);

            // Get content for each file
            const result: TerraformFile[] = [];
            let processedCount = 0;
            const totalFiles = terraformFiles.length;

            for (const file of terraformFiles) {
                try {
                    processedCount++;
                    // Show progress every 10 files or at the end
                    if (processedCount % 10 === 0 || processedCount === totalFiles) {
                        this.logger.info(`Processing file ${processedCount}/${totalFiles} in ${repoInfo.fullName}`);
                    }

                    const content = await this.getFileContent(repoInfo.owner, repoInfo.name, file.path);
                    result.push({
                        repository: repoInfo.fullName,
                        path: file.path,
                        content,
                        url: file.url
                    });
                } catch (error) {
                    this.logger.errorWithStack(`Error getting content for ${file.path} in ${repoInfo.fullName}`, error as Error);
                }
            }

            return result;
        } catch (error) {
            this.logger.errorWithStack(`Error getting Terraform files from ${repoInfo.fullName}`, error as Error);
            return [];
        }
    }

    /**
     * Find all Terraform files using the repository tree approach
     * @param owner Repository owner or organization name
     * @param repo Repository name (optional, if searching across an organization)
     * @param maxRepos Maximum number of repositories to process
     * @param perPage Number of results per page
     */
    async findTerraformFiles(owner: string, repo?: string, maxRepos: number | null = null, perPage: number = 100): Promise<TerraformFile[]> {
        try {
            let repositories: RepositoryInfo[] = [];

            if (repo) {
                // Check if specific repository exists and is accessible
                const exists = await this.repositoryExists(owner, repo);
                if (exists !== true) {
                    this.logger.info(`Repository ${owner}/${repo} doesn't exist, is archived, or is not accessible.`);
                    return [];
                }

                // Get default branch for this repository
                const repoResponse = await this.octokit.repos.get({
                    owner,
                    repo
                });

                repositories = [{
                    owner,
                    name: repo,
                    fullName: `${owner}/${repo}`,
                    defaultBranch: repoResponse.data.default_branch,
                    archived: repoResponse.data.archived
                }];
            } else {
                // Get all repositories in the organization
                repositories = await this.getRepositories(owner, maxRepos, perPage);
            }

            // No repositories found
            if (repositories.length === 0) {
                this.logger.info(`No accessible repositories found for ${owner}`);
                return [];
            }

            this.logger.info(`Processing ${repositories.length} repositories...`);

            // Process each repository to get Terraform files
            const terraformFiles: TerraformFile[] = [];
            let processedCount = 0;

            for (const repository of repositories) {
                processedCount++;
                this.logger.info(`Processing repository ${processedCount}/${repositories.length}: ${repository.fullName}`);

                const files = await this.getTerraformFilesFromRepo(repository);
                terraformFiles.push(...files);

                // Show a summary of our progress so far
                this.logger.info(`Progress: ${processedCount}/${repositories.length} repositories processed, ${terraformFiles.length} Terraform files found so far`);
            }

            this.logger.info(`Found a total of ${terraformFiles.length} Terraform files across ${repositories.length} repositories`);
            return terraformFiles;
        } catch (error) {
            this.logger.errorWithStack('Error searching for Terraform files', error as Error);
            throw error;
        }
    }

    /**
     * Get content of a file from GitHub
     * @param owner Repository owner
     * @param repo Repository name
     * @param path File path
     */
    private async getFileContent(owner: string, repo: string, path: string): Promise<string> {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path
            });

            // The content is base64 encoded
            if ('content' in response.data && response.data.encoding === 'base64') {
                return Buffer.from(response.data.content, 'base64').toString('utf-8');
            } else {
                throw new Error('Unexpected response format from GitHub API');
            }
        } catch (error) {
            this.logger.errorWithStack(`Error getting file content for ${path} in ${owner}/${repo}`, error as Error);
            throw error;
        }
    }
}