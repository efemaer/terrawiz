#!/usr/bin/env node

import { program } from 'commander';
import { GitHubService, GitHubServiceOptions, IacFile, IacFileType } from './services/github';
import { TerraformParser, TerraformModule } from './parsers/terraform';
import { TerragruntParser, TerragruntModule } from './parsers/terragrunt';
import { IaCModule } from './parsers/base-parser';
import { Logger, LogLevel } from './services/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Initialize the logger
const logger = Logger.forComponent('Main');

/**
 * Set up command line interface
 */
program
    .name('terrawiz')
    .description('Track Terraform modules used in GitHub repositories')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan and analyze Infrastructure as Code modules in GitHub repositories')
    .requiredOption('--org <organization>', 'GitHub organization or user name')
    .option('--repo <repository>', 'Specific repository name (if not provided, will search the entire organization)')
    .option('--repo-pattern <regex>', 'Filter repositories by name using regex pattern')
    .option('--format <format>', 'Output format: json, csv, or table (default: table)', 'table')
    .option('--output <filepath>', 'Export results to specified file')
    .option('--debug', 'Enable debug logging')
    .option('--max-repos <number>', 'Maximum number of repositories to process')
    .option('--no-rate-limit', 'Disable rate limit protection')
    .option('--skip-archived', 'Skip archived repositories (default: true)', true)
    .option('--terraform-only', 'Only scan for Terraform files')
    .option('--terragrunt-only', 'Only scan for Terragrunt files')
    .action(async (options) => {
        try {
            // Configure logging based on debug flag
            if (options.debug) {
                Logger.getInstance({ level: LogLevel.DEBUG });
                logger.debug('Debug logging enabled');
            }

            // Parse API limits options
            let maxRepos: number | null = null;
            if (options.maxRepos) {
                maxRepos = parseInt(options.maxRepos, 10);
                if (isNaN(maxRepos) || maxRepos < 1) {
                    logger.error('Error: max-repos must be a positive number');
                    process.exit(1);
                }
                logger.info(`Limiting search to ${maxRepos} repositor${maxRepos === 1 ? 'y' : 'ies'}`);
            }

            // Validate repository pattern
            if (options.repoPattern) {
                try {
                    new RegExp(options.repoPattern);
                    logger.info(`Using repository filter pattern: ${options.repoPattern}`);
                } catch (error) {
                    logger.error(`Invalid repository pattern regex: ${options.repoPattern}`);
                    logger.errorWithStack('Regex error', error as Error);
                    process.exit(1);
                }
            }

            // Fixed perPage to 100 (max allowed by GitHub API)
            const perPage = 100;

            // Validate IaC file types options
            if (options.terraformOnly && options.terragruntOnly) {
                logger.error('Error: Cannot specify both --terraform-only and --terragrunt-only. Use neither to scan both.');
                process.exit(1);
            }

            // Determine which IaC file types to scan
            let iacFileTypes: Array<'terraform' | 'terragrunt'> = ['terraform', 'terragrunt'];
            if (options.terraformOnly) {
                iacFileTypes = ['terraform'];
            } else if (options.terragruntOnly) {
                iacFileTypes = ['terragrunt'];
            }

            // Configure GitHub service
            const githubServiceOptions: GitHubServiceOptions = {
                debug: options.debug,
                useRateLimit: options.rateLimit !== false,
                skipArchived: options.skipArchived,
                repoPattern: options.repoPattern,
                iacFileTypes
            };

            // Initialize services
            const githubService = new GitHubService(githubServiceOptions);
            const terraformParser = new TerraformParser();

            // Log what we're scanning for
            const fileTypesDescription = options.terraformOnly
                ? 'Terraform files'
                : options.terragruntOnly
                    ? 'Terragrunt files'
                    : 'Terraform and Terragrunt files';

            logger.info(`Scanning for ${fileTypesDescription} in ${options.org}${options.repo ? `/${options.repo}` : ''}${options.repoPattern ? ` (filtering by pattern: ${options.repoPattern})` : ''}`);

            // Get IaC files using the repository tree approach
            logger.info(`Getting repositories and extracting ${fileTypesDescription}...`);
            const files = await githubService.findIacFiles(options.org, options.repo, maxRepos, perPage);

            if (files.length === 0) {
                logger.info(`No ${fileTypesDescription} found`);
                return;
            }

            // Count by type
            const terraformFileCount = files.filter(f => f.type === 'terraform').length;
            const terragruntFileCount = files.filter(f => f.type === 'terragrunt').length;
            logger.info(
                `Found ${files.length} IaC files: ${terraformFileCount} Terraform, ` +
                `${terragruntFileCount} Terragrunt. Analyzing module usage...`
            );

            // Initialize parsers for each type if needed
            const terragruntParser = new TerragruntParser();

            // Extract module information based on file type
            const terraformModules = terraformFileCount > 0 ? terraformParser.parseModules(
                files.filter(f => f.type === 'terraform')
            ) : [];

            const terragruntModules = terragruntFileCount > 0 ? terragruntParser.parseModules(
                files
            ) : [];

            // Check module counts
            if (terraformModules.length === 0 && terragruntModules.length === 0) {
                logger.info('No modules found in any files');
                return;
            }

            logger.info(
                `Found ${terraformModules.length + terragruntModules.length} module references ` +
                `(${terraformModules.length} Terraform, ${terragruntModules.length} Terragrunt)`
            );

            // Create summaries
            const terraformSummary = terraformModules.length > 0 ? terraformParser.createModuleSummary(terraformModules) : {};
            const terragruntSummary = terragruntModules.length > 0 ? terragruntParser.createModuleSummary(terragruntModules) : {};

            // Combine modules for output
            const allModules: IaCModule[] = [...terraformModules, ...terragruntModules];

            // Combine summaries
            const combinedSummary = {
                ...terraformSummary,
                ...terragruntSummary
            };

            // Output results
            const result = {
                metadata: {
                    owner: options.org,
                    repository: options.repo || 'All repositories',
                    repoPattern: options.repoPattern || undefined,
                    timestamp: new Date().toISOString(),
                    moduleCount: allModules.length,
                    fileCount: files.length,
                    terraformModuleCount: terraformModules.length,
                    terragruntModuleCount: terragruntModules.length,
                    terraformFileCount: terraformFileCount,
                    terragruntFileCount: terragruntFileCount
                },
                modules: allModules,
                summary: combinedSummary
            };

            // Prepare the output data based on format
            let outputData: string = '';
            switch (options.format.toLowerCase()) {
                case 'json':
                    outputData = JSON.stringify(result, null, 2);
                    break;
                case 'csv':
                    outputData = 'module,source_type,file_type,version,repository,file_path,line_number,github_link\n' +
                        allModules.map(m => {
                            const githubLink = `${m.fileUrl}#L${m.lineNumber}`;
                            const fileType = terraformModules.includes(m as any) ? 'terraform' : 'terragrunt';
                            return `"${m.source}","${m.sourceType}","${fileType}","${m.version || ''}","${m.repository}","${m.filePath}",${m.lineNumber},"${githubLink}"`;
                        }).join('\n');
                    break;
                case 'table':
                default:
                    const fileTypeStr = options.terraformOnly
                        ? 'Terraform'
                        : options.terragruntOnly
                            ? 'Terragrunt'
                            : 'Infrastructure as Code';

                    const tableLines = [
                        `\n${fileTypeStr} Module Usage Report`,
                        '============================',
                        `Scope: ${options.org}${options.repo ? `/${options.repo}` : ' (organization)'}`,
                        options.repoPattern ? `Repository filter: ${options.repoPattern}` : '',
                        `Total modules found: ${allModules.length}` +
                        ((!options.terraformOnly && !options.terragruntOnly) ?
                            ` (${terraformModules.length} Terraform, ${terragruntModules.length} Terragrunt)` : ''),
                        `Total files analyzed: ${files.length}` +
                        ((!options.terraformOnly && !options.terragruntOnly) ?
                            ` (${terraformFileCount} Terraform, ${terragruntFileCount} Terragrunt)` : ''),
                        '\nModule Summary by Source:'
                    ].filter(Boolean);

                    // Sort by frequency
                    const sortedSources = Object.entries(combinedSummary)
                        .sort(([, a], [, b]) => b.count - a.count);

                    for (const [source, info] of sortedSources) {
                        // Find the source type by looking at the first module with this source
                        const sourceType = allModules.find(m => m.source === source)?.sourceType || 'unknown';
                        tableLines.push(`\n${source} (${info.count} instances, type: ${sourceType})`);

                        if (Object.keys(info.versions).length > 0) {
                            tableLines.push('  Versions:');
                            Object.entries(info.versions)
                                .sort(([, a], [, b]) => b - a)
                                .forEach(([version, count]) => {
                                    tableLines.push(`    - ${version}: ${count} instances`);
                                });
                        } else {
                            tableLines.push('  No version constraints found');
                        }
                    }

                    // Additional summary by source type
                    tableLines.push('\nModules by Source Type:');
                    const typeCount = allModules.reduce((acc: Record<string, number>, module: any) => {
                        acc[module.sourceType] = (acc[module.sourceType] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);

                    Object.entries(typeCount)
                        .sort(([, a], [, b]) => b - a)
                        .forEach(([type, count]) => {
                            tableLines.push(`  ${type}: ${count} modules (${(count / allModules.length * 100).toFixed(1)}%)`);
                        });

                    // Add summary by file type
                    if (!options.terraformOnly && !options.terragruntOnly) {
                        tableLines.push('\nModules by File Type:');
                        tableLines.push(`  terraform: ${terraformModules.length} modules (${(terraformModules.length / allModules.length * 100).toFixed(1)}%)`);
                        tableLines.push(`  terragrunt: ${terragruntModules.length} modules (${(terragruntModules.length / allModules.length * 100).toFixed(1)}%)`);
                    }

                    outputData = tableLines.join('\n');
            }

            // Export results if requested or print to console if not exporting
            if (options.output) {
                const exportPath = path.resolve(options.output);
                fs.writeFileSync(exportPath, outputData);
                logger.info(`Results exported to ${exportPath}`);
            } else {
                // Only print to console if not exporting
                console.log(outputData);
            }
        } catch (error) {
            logger.errorWithStack('Application error', error as Error);
            process.exit(1);
        }
    });

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:');
    logger.error(reason as string);
    process.exit(1);
});

program.parse(process.argv);