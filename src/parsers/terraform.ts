import { IacFile } from '../services/github';
import { BaseParser, IaCModule, SourceType } from './base-parser';
import { Logger } from '../services/logger';

/**
 * Terraform module information
 */
export interface TerraformModule extends IaCModule {
    type: 'terraform';
}

/**
 * Parser for Terraform files to extract module information
 */
export class TerraformParser extends BaseParser<TerraformModule> {
    constructor() {
        super('TerraformParser', 'terraform');
    }

    /**
 * Extract modules from a single Terraform file
 * @param file Terraform file to parse
 * @returns Array of extracted modules from the file
 */
    protected extractModulesFromFile(file: IacFile): TerraformModule[] {
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

            // Determine source type using the base class method
            const sourceType = this.determineSourceType(source);

            // Extract version from both explicit version attribute and source
            const versionMatch = moduleBlock.match(/version\s*=\s*"([^"]+)"/);
            const versionValue = versionMatch ? versionMatch[1] : undefined;
            const version = this.extractVersion(source, versionValue);

            modules.push({
                name: moduleName,
                source,
                sourceType,
                version,
                repository: file.repository,
                filePath: file.path,
                fileUrl: file.url,
                lineNumber,
                type: 'terraform'
            });
        }

        return modules;
    }

    // createModuleSummary is now provided by BaseParser
}