import { TerraformFile } from '../services/github';
import { Logger } from '../services/logger';

export interface TerraformModule {
    name: string;
    source: string;
    sourceType: 'local' | 'artifactory' | 'archive' | 'registry' | 'unknown';
    version?: string;
    repository: string;
    filePath: string;
    fileUrl: string;
    lineNumber: number;
}

/**
 * Parser for Terraform files to extract module information
 */
export class TerraformParser {
    private logger: Logger;

    constructor() {
        this.logger = Logger.forComponent('Parser');
    }

    /**
     * Parse Terraform files to extract module information
     * @param files List of Terraform files to parse
     * @returns Array of extracted modules
     */
    parseModules(files: TerraformFile[]): TerraformModule[] {
        const modules: TerraformModule[] = [];

        this.logger.info(`Parsing ${files.length} Terraform files for modules`);

        for (const file of files) {
            try {
                const fileModules = this.extractModulesFromFile(file);
                this.logger.debug(`Found ${fileModules.length} modules in ${file.path} (${file.repository})`);
                modules.push(...fileModules);
            } catch (error) {
                this.logger.errorWithStack(`Error parsing file ${file.path} in ${file.repository}`, error as Error);
            }
        }

        this.logger.info(`Extracted ${modules.length} modules from all files`);
        return modules;
    }

    /**
     * Extract modules from a single Terraform file
     * @param file Terraform file to parse
     * @returns Array of extracted modules from the file
     */
    private extractModulesFromFile(file: TerraformFile): TerraformModule[] {
        const modules: TerraformModule[] = [];
        const content = file.content;

        // Regular expression to match module blocks
        // This handles both single and multi-line module declarations
        const moduleRegex = /module\s+"([^"]+)"\s+{([\s\S]*?)}/g;
        let moduleMatch;

        while ((moduleMatch = moduleRegex.exec(content)) !== null) {
            const moduleName = moduleMatch[1];
            const moduleBlock = moduleMatch[2];

            // Calculate line number by counting newlines before this match
            const matchStartPosition = moduleMatch.index;
            const contentBeforeMatch = content.substring(0, matchStartPosition);
            const lineNumber = (contentBeforeMatch.match(/\n/g) || []).length + 1;

            // Extract source
            const sourceMatch = moduleBlock.match(/source\s*=\s*"([^"]+)"/);
            if (!sourceMatch) {
                this.logger.debug(`Module "${moduleName}" in ${file.path} has no source - skipping`);
                continue; // Skip if no source found
            }

            const source = sourceMatch[1];

            // Determine source type based on patterns observed in the data
            let sourceType: 'local' | 'artifactory' | 'archive' | 'registry' | 'unknown';

            if (source.startsWith('./') || source.startsWith('../')) {
                sourceType = 'local';
            } else if (source.includes('jfrog.io') && !source.endsWith('.tar.gz') && !source.endsWith('.zip')) {
                sourceType = 'artifactory';
            } else if (source.endsWith('.tar.gz') || source.endsWith('.zip') ||
                (source.includes('jfrog.io') && (source.includes('.tar.gz') || source.includes('.zip')))) {
                sourceType = 'archive';
            } else if (source.match(/^[^\/]+\/[^\/]+\/[^\/]+$/) || source.includes('terraform-aws-modules')) {
                // Format like terraform-aws-modules/rds/aws or similar pattern
                sourceType = 'registry';
            } else {
                sourceType = 'unknown';
            }

            // Extract version if available
            let version: string | undefined;
            const versionMatch = moduleBlock.match(/version\s*=\s*"([^"]+)"/);
            if (versionMatch) {
                version = versionMatch[1];
            }

            modules.push({
                name: moduleName,
                source,
                sourceType,
                version,
                repository: file.repository,
                filePath: file.path,
                fileUrl: file.url,
                lineNumber
            });
        }

        return modules;
    }

    /**
     * Group modules by source to create a summary report
     * @param modules List of modules to summarize
     * @returns Object with sources as keys and usage statistics as values
     */
    createModuleSummary(modules: TerraformModule[]): Record<string, { count: number, versions: Record<string, number> }> {
        this.logger.info(`Creating summary for ${modules.length} modules`);
        const summary: Record<string, { count: number, versions: Record<string, number> }> = {};

        for (const module of modules) {
            if (!summary[module.source]) {
                summary[module.source] = {
                    count: 0,
                    versions: {}
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
        const versionedCount = Object.values(summary).filter(s => Object.keys(s.versions).length > 0).length;
        this.logger.debug(`Summary contains ${sourceCount} unique module sources, ${versionedCount} with version constraints`);

        return summary;
    }
}