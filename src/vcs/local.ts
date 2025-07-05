import * as fs from 'fs';
import * as path from 'path';
import { BaseVcsService, BaseVcsConfig } from './base';
import {
  IacFile,
  VcsRepository,
  VcsRepositoryFilter,
  VcsFileDiscoveryOptions,
  VcsPlatform,
  VcsError,
  VcsErrorType,
} from '../types';
import { processConcurrentlySettled } from '../utils/concurrent';

/**
 * Configuration options for the Local Filesystem service
 */
export interface LocalFilesystemServiceConfig extends BaseVcsConfig {
  /** Maximum concurrent files to process (default: 10) */
  maxConcurrentFiles?: number;
}

/**
 * Local Filesystem VCS service implementation
 *
 * Maps filesystem concepts to VCS abstractions:
 * - Target directory becomes the "repository"
 * - Directory name becomes repository name
 * - Parent directory becomes "owner"
 * - Files maintain relative paths for module resolution
 */
export class LocalFilesystemService extends BaseVcsService {
  private maxConcurrentFiles: number;

  constructor(config: LocalFilesystemServiceConfig) {
    super({
      platform: VcsPlatform.LOCAL,
      debug: config.debug,
      skipArchived: false, // Not applicable for local filesystem
      maxRetries: config.maxRetries || 1, // Lower retry count for filesystem operations
      cacheEnabled: config.cacheEnabled !== false, // Enable caching by default
    });

    this.maxConcurrentFiles = config.maxConcurrentFiles || 10;
    this.initializeLogger();
    this.logger.info('Local filesystem service initialized successfully');
  }

  get platformName(): string {
    return 'Local Filesystem';
  }

  /**
   * Get concurrency limits for parallel processing
   */
  protected getConcurrencyLimits(): { repos: number; files: number } {
    return {
      repos: 1, // Only one "repository" (directory) at a time for local
      files: this.maxConcurrentFiles,
    };
  }

  /**
   * Check if a local directory exists and is accessible
   */
  async repositoryExists(owner: string, name: string): Promise<boolean | null> {
    const targetPath = this.constructPath(owner, name);
    try {
      const stats = await fs.promises.stat(targetPath);
      return stats.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      // For permission errors or other issues, return null to indicate uncertainty
      this.logger.warn(`Unable to check directory existence: ${targetPath}`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get repositories (for local filesystem, this returns the target directory as a single repository)
   */
  async getRepositories(owner: string, filter?: VcsRepositoryFilter): Promise<VcsRepository[]> {
    try {
      const targetPath = path.resolve(owner);

      // Validate path exists and is directory
      await this.validateDirectory(targetPath);

      // For local filesystem, we treat the target path as a single repository
      const repository: VcsRepository = {
        owner: path.dirname(targetPath),
        name: path.basename(targetPath),
        fullName: targetPath,
        defaultBranch: 'main', // Not applicable for local filesystem
        archived: false,
        private: true, // Local files are inherently private
        url: `file://${targetPath}`,
        cloneUrl: `file://${targetPath}`,
      };

      // Apply filters if provided
      const repositories = [repository];
      return this.filterRepositories(repositories, filter);
    } catch (error) {
      this.handleError(error, 'getRepositories', { owner });
      throw error; // This line won't be reached due to handleError throwing
    }
  }

  /**
   * Find IaC files in a local directory
   */
  async findIacFilesInRepository(
    repository: VcsRepository,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    try {
      const targetPath = repository.fullName; // For local, fullName is the directory path

      this.logger.info(`Scanning directory: ${targetPath}`);

      // Recursively find all IaC files
      const allFiles = await this.findIacFilesRecursively(targetPath, options);

      // Process files concurrently to read content
      const concurrency = this.getConcurrencyLimits();
      const processingResult = await processConcurrentlySettled(
        allFiles,
        async (filePath, index) => {
          this.logger.debug(`Reading file ${index + 1}/${allFiles.length}: ${filePath}`);
          return await this.createIacFileFromPath(filePath, targetPath, repository.name);
        },
        concurrency.files
      );

      // Collect successful results
      const iacFiles: IacFile[] = [];
      for (const result of processingResult.results) {
        if (result !== null) {
          iacFiles.push(result);
        }
      }

      // Log any errors
      processingResult.errors.forEach((error, index) => {
        if (error !== null) {
          this.logger.errorWithStack(`Failed to read file ${allFiles[index]}`, error);
        }
      });

      this.logger.info(
        `File processing completed: ${processingResult.successCount}/${allFiles.length} successful, ` +
          `${processingResult.errorCount} failed`
      );

      return iacFiles;
    } catch (error) {
      this.handleError(error, 'findIacFilesInRepository', { repository: repository.fullName });
      throw error;
    }
  }

  /**
   * Recursively find all IaC files in directory
   */
  private async findIacFilesRecursively(
    dirPath: string,
    options?: VcsFileDiscoveryOptions
  ): Promise<string[]> {
    const iacFiles: string[] = [];

    const processDirectory = async (currentPath: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(dirPath, fullPath);

          if (entry.isDirectory()) {
            // Skip common directories that shouldn't contain IaC files
            if (this.shouldSkipDirectory(entry.name)) {
              this.logger.debug(`Skipping directory: ${relativePath}`);
              continue;
            }

            // Recursively process subdirectory
            await processDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check if file should be included
            if (this.shouldIncludeFile(relativePath, options)) {
              iacFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Error reading directory ${currentPath}:`, {
          error: (error as Error).message,
        });
      }
    };

    await processDirectory(dirPath);

    this.logger.info(`Found ${iacFiles.length} IaC files in ${dirPath}`);
    return iacFiles;
  }

  /**
   * Create IacFile object from file path
   */
  private async createIacFileFromPath(
    filePath: string,
    basePath: string,
    repositoryName: string
  ): Promise<IacFile> {
    const relativePath = path.relative(basePath, filePath);
    const fileType = this.getIacFileType(relativePath);

    if (!fileType) {
      throw new Error(`Unable to determine file type for: ${relativePath}`);
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const stats = await fs.promises.stat(filePath);

      return {
        type: fileType,
        repository: repositoryName,
        path: relativePath.replace(/\\/g, '/'), // Normalize path separators
        content,
        url: `file://${filePath}`,
        size: stats.size,
      };
    } catch (error) {
      throw new VcsError(
        `Failed to read file: ${filePath}`,
        VcsErrorType.RESOURCE_NOT_FOUND,
        VcsPlatform.LOCAL,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if directory should be skipped during traversal
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.terraform',
      '.terragrunt-cache',
      'dist',
      'build',
      'target',
      '.vscode',
      '.idea',
      '__pycache__',
      '.DS_Store',
    ];

    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Validate that path exists and is a readable directory
   */
  private async validateDirectory(dirPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(dirPath);

      if (!stats.isDirectory()) {
        throw new VcsError(
          `Path is not a directory: ${dirPath}`,
          VcsErrorType.INVALID_CONFIGURATION,
          VcsPlatform.LOCAL
        );
      }

      // Test readability
      await fs.promises.access(dirPath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new VcsError(
          `Directory does not exist: ${dirPath}`,
          VcsErrorType.RESOURCE_NOT_FOUND,
          VcsPlatform.LOCAL
        );
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new VcsError(
          `Permission denied reading directory: ${dirPath}`,
          VcsErrorType.AUTHORIZATION_FAILED,
          VcsPlatform.LOCAL
        );
      } else if (error instanceof VcsError) {
        throw error;
      } else {
        throw new VcsError(
          `Unable to access directory: ${dirPath}`,
          VcsErrorType.PLATFORM_ERROR,
          VcsPlatform.LOCAL,
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * Construct path from owner and name (for compatibility with VCS interface)
   */
  private constructPath(owner: string, name: string): string {
    if (path.isAbsolute(owner)) {
      // If owner is already an absolute path, use it directly
      return name ? path.join(owner, name) : owner;
    } else {
      // Treat as relative path
      return path.resolve(process.cwd(), owner, name || '');
    }
  }
}
