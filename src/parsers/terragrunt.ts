import { IacFile } from '../types/vcs';
import { BaseParser, IaCModule, SourceType } from './base-parser';

/**
 * Terragrunt module information
 */
export interface TerragruntModule extends IaCModule {
  type: 'terragrunt';
}

/**
 * Parser for Terragrunt files to extract module information
 */
export class TerragruntParser extends BaseParser<TerragruntModule> {
  constructor() {
    super('TerragruntParser', 'terragrunt');
  }

  /**
   * Extract modules from a single Terragrunt file
   * @param file Terragrunt file to parse
   * @returns Array of extracted modules from the file
   */
  protected extractModulesFromFile(file: IacFile): TerragruntModule[] {
    const modules: TerragruntModule[] = [];
    const content = file.content;

    // Regular expression to match terraform blocks with source (terragrunt modules)
    // Note that Terragrunt uses terraform { source = "..." } pattern
    const terraformBlockRegex = /terraform\s*{([\s\S]*?)}/g;
    let blockMatch;

    while ((blockMatch = terraformBlockRegex.exec(content)) !== null) {
      const blockContent = blockMatch[1];

      // Calculate line number by counting newlines before this match
      const matchStartPosition = blockMatch.index;
      const contentBeforeMatch = content.substring(0, matchStartPosition);
      const lineNumber = (contentBeforeMatch.match(/\n/g) || []).length + 1;

      // Extract source
      const sourceMatch = blockContent.match(/source\s*=\s*"([^"]+)"/);
      if (!sourceMatch) {
        this.logger.debug(`Terraform block in ${file.path} has no source - skipping`);
        continue;
      }

      const source = sourceMatch[1].trim();

      // Skip empty or whitespace-only sources
      if (!source) {
        this.logger.debug(`Terraform block in ${file.path} has empty source - skipping`);
        continue;
      }
      const name = this.extractModuleName(file.path, source);

      // Determine source type using base class method
      const sourceType = this.determineSourceType(source);

      // Extract version using base class method
      const version = this.extractVersion(source);

      modules.push({
        name,
        source,
        sourceType,
        version,
        repository: file.repository,
        filePath: file.path,
        fileUrl: file.webUrl,
        lineNumber,
        type: 'terragrunt',
      });
    }

    return modules;
  }

  /**
   * Extract a module name from the file path or source
   */
  private extractModuleName(filePath: string, source: string): string {
    // Try to get the directory name from the file path
    const dirMatch = filePath.match(/.*\/([^\/]+)\/terragrunt\.hcl$/);
    if (dirMatch && dirMatch[1]) {
      return dirMatch[1];
    }

    // Check for simple directory pattern
    const simpleDirMatch = filePath.match(/([^\/]+)\/terragrunt\.hcl$/);
    if (simpleDirMatch && simpleDirMatch[1]) {
      return simpleDirMatch[1];
    }

    // If not found, derive from source
    // Remove query parameters and get the last path segment
    const cleanSource = source.split('?')[0];

    // Handle different source formats
    if (cleanSource.includes('//')) {
      // For sources like git::...//module-name
      const doubleslashIndex = cleanSource.lastIndexOf('//');
      if (doubleslashIndex !== -1) {
        const afterDoubleSlash = cleanSource.substring(doubleslashIndex + 2);
        if (afterDoubleSlash && afterDoubleSlash.trim()) {
          // Split by / and get the last non-empty segment
          const segments = afterDoubleSlash.split('/').filter(s => s.trim());
          if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            return lastSegment.replace(/\.(git|tar\.gz|zip)$/, '');
          }
        }
        // If nothing meaningful after //, try to get repo name before //
        const beforeDoubleSlash = cleanSource.substring(0, doubleslashIndex);
        const repoSegments = beforeDoubleSlash.split('/');
        const repoName = repoSegments[repoSegments.length - 1];
        const cleanRepoName = repoName.replace(/\.(git|tar\.gz|zip)$/, '');
        return cleanRepoName || 'unknown';
      }
    }

    // Fall back to last segment
    const segments = cleanSource.split('/');
    const lastSegment = segments[segments.length - 1];

    if (!lastSegment || !lastSegment.trim()) {
      return 'unknown';
    }

    // Remove common suffixes
    const cleanName = lastSegment.replace(/\.(git|tar\.gz|zip)$/, '');
    return cleanName || 'unknown';
  }

  // createModuleSummary is now provided by BaseParser
}
