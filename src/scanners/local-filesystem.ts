import * as fs from 'fs';
import * as path from 'path';
import { IacFile, VcsFileDiscoveryOptions } from '../types';
import { processConcurrentlySettled } from '../utils/concurrent';
import { Logger } from '../services/logger';
import { getIacFileType, shouldIncludeFileByType } from '../utils/file-type-detector';
import { SKIP_DIRECTORIES, DEFAULT_FILE_CONCURRENCY } from '../constants';

/**
 * Configuration options for the Local Filesystem Scanner
 */
export interface LocalFilesystemScannerConfig {
  /** Maximum concurrent files to process (default: 10) */
  maxConcurrentFiles?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Simple, dedicated local filesystem scanner
 * No VCS concepts - just scans directories for IaC files
 */
export class LocalFilesystemScanner {
  private maxConcurrentFiles: number;
  private logger: Logger;

  constructor(config: LocalFilesystemScannerConfig = {}) {
    this.maxConcurrentFiles = config.maxConcurrentFiles || DEFAULT_FILE_CONCURRENCY;
    this.logger = Logger.forComponent('LocalFilesystemScanner');

    if (config.debug) {
      this.logger.debug('Local filesystem scanner initialized');
    }
  }

  /**
   * Scan a directory for IaC files
   */
  async scanDirectory(
    directoryPath: string,
    options?: VcsFileDiscoveryOptions
  ): Promise<IacFile[]> {
    const targetPath = path.resolve(directoryPath);
    this.logger.info(`Scanning directory: ${targetPath}`);

    // Validate path exists and is directory
    await this.validateDirectory(targetPath);

    // Recursively find all IaC files
    const allFiles = await this.findIacFilesRecursively(targetPath, options);

    if (allFiles.length === 0) {
      this.logger.info(`No IaC files found in ${targetPath}`);
      return [];
    }

    // Process files concurrently to read content
    this.logger.info(`Found ${allFiles.length} IaC files, reading content...`);
    const processingResult = await processConcurrentlySettled(
      allFiles,
      async (filePath, index) => {
        this.logger.debug(`Reading file ${index + 1}/${allFiles.length}: ${filePath}`);
        return await this.createIacFileFromPath(filePath, targetPath);
      },
      this.maxConcurrentFiles
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
        this.logger.error(`Failed to read file ${allFiles[index]}: ${error.message}`);
      }
    });

    this.logger.info(
      `Scan completed: ${processingResult.successCount}/${allFiles.length} files processed successfully`
    );

    return iacFiles;
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
            if (this.shouldSkipDirectory(entry.name)) {
              this.logger.debug(`Skipping directory: ${relativePath}`);
              continue;
            }

            await processDirectory(fullPath);
          } else if (entry.isFile()) {
            if (this.shouldIncludeFile(relativePath, options)) {
              iacFiles.push(fullPath);
            }
          } else if (entry.isSymbolicLink()) {
            await this.handleSymbolicLink(
              fullPath,
              relativePath,
              dirPath,
              iacFiles,
              options,
              processDirectory
            );
          }
        }
      } catch (error) {
        this.logger.warn(`Error reading directory ${currentPath}: ${(error as Error).message}`);
      }
    };

    await processDirectory(dirPath);
    return iacFiles;
  }

  /**
   * Handle symbolic links by resolving and processing them
   */
  private async handleSymbolicLink(
    linkPath: string,
    relativePath: string,
    basePath: string,
    iacFiles: string[],
    options?: VcsFileDiscoveryOptions,
    processDirectory?: (path: string) => Promise<void>
  ): Promise<void> {
    try {
      // Resolve the symbolic link to get the actual target
      const resolvedPath = await fs.promises.realpath(linkPath);
      const stats = await fs.promises.stat(resolvedPath);

      if (stats.isFile()) {
        // It's a symlinked file - check if it's an IaC file
        if (this.shouldIncludeFile(relativePath, options)) {
          // Add the symlink path (not the resolved path) to maintain correct relative paths
          iacFiles.push(linkPath);
          this.logger.debug(`Found symlinked IaC file: ${relativePath} -> ${resolvedPath}`);
        }
      } else if (stats.isDirectory() && processDirectory) {
        // It's a symlinked directory - check if we should process it
        const linkName = path.basename(linkPath);
        if (!this.shouldSkipDirectory(linkName)) {
          this.logger.debug(`Following symlinked directory: ${relativePath} -> ${resolvedPath}`);
          // Process the resolved directory, but be careful about infinite loops
          await this.processSymlinkedDirectory(resolvedPath, basePath, iacFiles, options);
        }
      }
    } catch (error) {
      // Log but don't fail if we can't resolve a symlink
      this.logger.debug(`Could not resolve symlink ${linkPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Process a symlinked directory, with protection against infinite loops
   */
  private async processSymlinkedDirectory(
    resolvedPath: string,
    basePath: string,
    iacFiles: string[],
    options?: VcsFileDiscoveryOptions,
    visited = new Set<string>()
  ): Promise<void> {
    // Prevent infinite loops by tracking visited paths
    const normalizedPath = path.resolve(resolvedPath);
    if (visited.has(normalizedPath)) {
      this.logger.debug(`Skipping already visited symlinked directory: ${normalizedPath}`);
      return;
    }
    visited.add(normalizedPath);

    try {
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(resolvedPath, entry.name);

        if (entry.isFile() || entry.isSymbolicLink()) {
          // For files in symlinked directories, we need to calculate the relative path
          // based on where the symlink appears in our scan, not where it resolves to
          const relativePath = path.relative(basePath, fullPath);

          if (entry.isFile() && this.shouldIncludeFile(relativePath, options)) {
            iacFiles.push(fullPath);
          } else if (entry.isSymbolicLink()) {
            await this.handleSymbolicLink(fullPath, relativePath, basePath, iacFiles, options);
          }
        } else if (entry.isDirectory()) {
          const subDir = path.join(resolvedPath, entry.name);
          if (!this.shouldSkipDirectory(entry.name)) {
            await this.processSymlinkedDirectory(subDir, basePath, iacFiles, options, visited);
          }
        }
      }
    } catch (error) {
      this.logger.debug(
        `Error processing symlinked directory ${resolvedPath}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Create IacFile object from file path
   */
  private async createIacFileFromPath(filePath: string, basePath: string): Promise<IacFile> {
    const relativePath = path.relative(basePath, filePath);
    const fileType = getIacFileType(relativePath);

    if (!fileType) {
      throw new Error(`Unable to determine file type for: ${relativePath}`);
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const stats = await fs.promises.stat(filePath);

      return {
        type: fileType,
        repository: path.basename(basePath), // Use directory name as repository
        path: relativePath.replace(/\\/g, '/'), // Normalize path separators
        content,
        url: `file://${filePath}`,
        size: stats.size,
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath} - ${(error as Error).message}`);
    }
  }

  /**
   * Check if file should be included based on type and options
   */
  private shouldIncludeFile(filePath: string, options?: VcsFileDiscoveryOptions): boolean {
    // Check file type
    if (!shouldIncludeFileByType(filePath, options?.fileTypes)) {
      return false;
    }

    // Apply exclude patterns
    if (options?.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (pattern.test(filePath)) {
          return false;
        }
      }
    }

    // Apply include patterns
    if (options?.includePatterns) {
      for (const pattern of options.includePatterns) {
        if (pattern.test(filePath)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Check if directory should be skipped during traversal
   */
  private shouldSkipDirectory(dirName: string): boolean {
    return SKIP_DIRECTORIES.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Validate that path exists and is a readable directory
   */
  private async validateDirectory(dirPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(dirPath);

      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      // Test readability
      await fs.promises.access(dirPath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory does not exist: ${dirPath}`);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Permission denied reading directory: ${dirPath}`);
      } else {
        throw new Error(`Unable to access directory: ${dirPath} - ${(error as Error).message}`);
      }
    }
  }
}
