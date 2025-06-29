import { IacFile } from '../types';
import { Logger } from '../services/logger';

/**
 * Common source types for Infrastructure as Code modules
 */
export type SourceType = 'local' | 'artifactory' | 'archive' | 'registry' | 'git' | 'unknown';

/**
 * Base Module interface that defines common properties
 */
export interface IaCModule {
  name: string;
  source: string;
  sourceType: SourceType;
  version?: string;
  repository: string;
  filePath: string;
  fileUrl: string;
  lineNumber: number;
  type: string; // 'terraform' or 'terragrunt'
}

/**
 * Base parser class that provides common functionality for all IaC parsers
 */
export abstract class BaseParser<T extends IaCModule> {
  protected logger: Logger;
  protected fileType: string;

  constructor(loggerComponent: string, fileType: string) {
    this.logger = Logger.forComponent(loggerComponent);
    this.fileType = fileType;
  }

  /**
   * Parse files to extract module information
   * @param files List of files to parse (will be filtered by type)
   * @returns Array of extracted modules
   */
  parseModules(files: IacFile[]): T[] {
    // Filter to only include files of the correct type
    const filteredFiles = files.filter(file => file.type === this.fileType.toLowerCase());

    const modules: T[] = [];

    this.logger.info(`Parsing ${filteredFiles.length} ${this.fileType} files for modules`);

    for (const file of filteredFiles) {
      try {
        const fileModules = this.extractModulesFromFile(file);
        this.logger.debug(
          `Found ${fileModules.length} modules in ${file.path} (${file.repository})`
        );
        modules.push(...fileModules);
      } catch (error) {
        this.logger.errorWithStack(
          `Error parsing file ${file.path} in ${file.repository}`,
          error as Error
        );
      }
    }

    this.logger.info(`Extracted ${modules.length} modules from all ${this.fileType} files`);
    return modules;
  }

  /**
   * Extract modules from a single file
   * @param file File to parse
   * @returns Array of extracted modules from the file
   */
  protected abstract extractModulesFromFile(file: IacFile): T[];

  /**
   * Determine the source type of a module
   */
  protected determineSourceType(source: string): SourceType {
    if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
      return 'local';
    } else if (
      source.includes('jfrog.io') &&
      !source.endsWith('.tar.gz') &&
      !source.endsWith('.zip')
    ) {
      return 'artifactory';
    } else if (
      source.endsWith('.tar.gz') ||
      source.endsWith('.zip') ||
      (source.includes('jfrog.io') && (source.includes('.tar.gz') || source.includes('.zip')))
    ) {
      return 'archive';
    } else if (
      source.match(/^[^/]+\/[^/]+\/[^/]+/) ||
      source.includes('terraform-aws-modules') ||
      source.includes('.terraform.io')
    ) {
      // Format like terraform-aws-modules/rds/aws or app.terraform.io/company/database/aws
      return 'registry';
    } else if (
      source.includes('git::') ||
      source.includes('github.com') ||
      source.includes('gitlab.com')
    ) {
      return 'git';
    } else {
      return 'unknown';
    }
  }

  /**
   * Extract version from different formats
   * Handles explicit version attributes and embedded versions in git sources
   */
  protected extractVersion(source: string, versionAttribute?: string): string | undefined {
    // First check for explicit version attribute if provided
    if (versionAttribute) {
      return versionAttribute;
    }

    // Check for version parameter (e.g., ?version=1.0.0)
    const versionMatch = source.match(/[?&]version=([^&]+)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    // Then check for git ref pattern (e.g., ?ref=v1.0.0)
    const refMatch = source.match(/[?&]ref=([^&]+)/);
    if (refMatch) {
      return refMatch[1];
    }

    return undefined;
  }

  /**
   * Group modules by source to create a summary report
   * @param modules List of modules to summarize
   * @returns Object with sources as keys and usage statistics as values
   */
  createModuleSummary(
    modules: T[]
  ): Record<string, { count: number; versions: Record<string, number> }> {
    this.logger.info(`Creating summary for ${modules.length} modules`);
    const summary: Record<string, { count: number; versions: Record<string, number> }> = {};

    for (const module of modules) {
      if (!summary[module.source]) {
        summary[module.source] = {
          count: 0,
          versions: {},
        };
      }

      summary[module.source].count++;

      if (module.version) {
        if (!summary[module.source].versions[module.version]) {
          summary[module.source].versions[module.version] = 0;
        }
        summary[module.source].versions[module.version]++;
      }
    }

    const sourceCount = Object.keys(summary).length;
    const versionedCount = Object.values(summary).filter(
      s => Object.keys(s.versions).length > 0
    ).length;
    this.logger.debug(
      `Summary contains ${sourceCount} unique module sources, ${versionedCount} with version constraints`
    );

    return summary;
  }
}
