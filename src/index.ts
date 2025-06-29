#!/usr/bin/env node

import { program } from 'commander';
import { GitHubService, GitHubServiceConfig } from './vcs';
import { VcsPlatform } from './types';
import { TerraformParser, TerragruntParser, IaCModule } from './parsers';
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

  // === Core Options ===
  .requiredOption('-o, --org <organization>', 'GitHub organization or user name')
  .option('-r, --repo <repository>', 'Specific repository name (scans entire org if not specified)')
  .option('-p, --pattern <regex>', 'Filter repositories by name pattern')

  // === Output Options ===
  .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
  .option('-e, --export <file>', 'Export results to file')

  // === Performance Options ===
  .option(
    '-c, --concurrency <repos:files>',
    'Concurrent processing (e.g., "5:10" for 5 repos, 10 files)',
    '5:10'
  )
  .option('--limit <number>', 'Maximum repositories to scan')

  // === Filtering Options ===
  .option('--include-archived', 'Include archived repositories (default: skip)')
  .option('--terraform-only', 'Scan only Terraform (.tf) files')
  .option('--terragrunt-only', 'Scan only Terragrunt (.hcl) files')

  // === Advanced Options ===
  .option('--disable-rate-limit', 'Disable GitHub API rate limiting')
  .option('--debug', 'Enable debug logging')
  .action(async options => {
    try {
      // Configure logging based on debug flag
      if (options.debug) {
        Logger.getInstance({ level: LogLevel.DEBUG });
        logger.debug('Debug logging enabled');
      }

      // Parse repository limit
      let maxRepos: number | null = null;
      if (options.limit) {
        maxRepos = parseInt(options.limit, 10);
        if (isNaN(maxRepos) || maxRepos < 1) {
          logger.error('Error: --limit must be a positive number');
          process.exit(1);
        }
        logger.info(`Limiting scan to ${maxRepos} repositor${maxRepos === 1 ? 'y' : 'ies'}`);
      }

      // Parse concurrency options
      let maxConcurrentRepos = 5;
      let maxConcurrentFiles = 10;

      if (options.concurrency) {
        const concurrencyMatch = options.concurrency.match(/^(\d+):(\d+)$/);
        if (concurrencyMatch) {
          maxConcurrentRepos = parseInt(concurrencyMatch[1], 10);
          maxConcurrentFiles = parseInt(concurrencyMatch[2], 10);
        } else {
          logger.error('Error: --concurrency must be in format "repos:files" (e.g., "5:10")');
          process.exit(1);
        }
      }

      if (maxConcurrentRepos < 1 || maxConcurrentFiles < 1) {
        logger.error('Error: concurrency values must be positive numbers');
        process.exit(1);
      }

      logger.debug(
        `Concurrency settings: ${maxConcurrentRepos} repos, ${maxConcurrentFiles} files per repo`
      );

      // Validate repository pattern
      if (options.pattern) {
        try {
          new RegExp(options.pattern);
          logger.info(`Using repository filter pattern: ${options.pattern}`);
        } catch (error) {
          logger.error(`Invalid repository pattern regex: ${options.pattern}`);
          logger.errorWithStack('Regex error', error as Error);
          process.exit(1);
        }
      }

      // Validate IaC file types options
      if (options.terraformOnly && options.terragruntOnly) {
        logger.error(
          'Error: Cannot specify both --terraform-only and --terragrunt-only. Use neither to scan both.'
        );
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
      const githubServiceConfig: GitHubServiceConfig = {
        platform: VcsPlatform.GITHUB,
        token: process.env.GITHUB_TOKEN || '',
        debug: options.debug,
        useRateLimit: !options.disableRateLimit,
        skipArchived: !options.includeArchived,
        repoPattern: options.pattern,
        iacFileTypes,
        maxConcurrentRepos,
        maxConcurrentFiles,
      };

      // Initialize services
      const githubService = new GitHubService(githubServiceConfig);
      const terraformParser = new TerraformParser();

      // Log what we're scanning for
      const fileTypesDescription = options.terraformOnly
        ? 'Terraform files'
        : options.terragruntOnly
          ? 'Terragrunt files'
          : 'Terraform and Terragrunt files';

      logger.info(
        `Scanning for ${fileTypesDescription} in ${options.org}${options.repo ? `/${options.repo}` : ''}${options.pattern ? ` (filtering by pattern: ${options.pattern})` : ''}`
      );

      // Get IaC files using the new approach
      logger.info(`Getting repositories and extracting ${fileTypesDescription}...`);

      let files;
      if (options.repo) {
        // Single repository
        files = await githubService.findIacFilesForRepository(options.org, options.repo, {
          fileTypes: iacFileTypes,
        });
      } else {
        // All repositories for organization
        const repositoryFilter = {
          skipArchived: !options.includeArchived,
          namePattern: options.pattern ? new RegExp(options.pattern) : undefined,
          maxRepositories: maxRepos || undefined,
        };
        const fileOptions = {
          fileTypes: iacFileTypes,
        };
        files = await githubService.findAllIacFiles(options.org, repositoryFilter, fileOptions);
      }

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
      const terraformModules =
        terraformFileCount > 0
          ? terraformParser.parseModules(files.filter(f => f.type === 'terraform'))
          : [];

      const terragruntModules = terragruntFileCount > 0 ? terragruntParser.parseModules(files) : [];

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
      const terraformSummary =
        terraformModules.length > 0 ? terraformParser.createModuleSummary(terraformModules) : {};
      const terragruntSummary =
        terragruntModules.length > 0 ? terragruntParser.createModuleSummary(terragruntModules) : {};

      // Combine modules for output
      const allModules: IaCModule[] = [...terraformModules, ...terragruntModules];

      // Combine summaries
      const combinedSummary = {
        ...terraformSummary,
        ...terragruntSummary,
      };

      // Output results
      const result = {
        metadata: {
          owner: options.org,
          repository: options.repo || 'All repositories',
          repoPattern: options.pattern || undefined,
          timestamp: new Date().toISOString(),
          moduleCount: allModules.length,
          fileCount: files.length,
          terraformModuleCount: terraformModules.length,
          terragruntModuleCount: terragruntModules.length,
          terraformFileCount: terraformFileCount,
          terragruntFileCount: terragruntFileCount,
        },
        modules: allModules,
        summary: combinedSummary,
      };

      // Prepare the output data based on format
      let outputData: string = '';
      switch (options.format.toLowerCase()) {
        case 'json':
          outputData = JSON.stringify(result, null, 2);
          break;
        case 'csv': {
          const csvData = allModules
            .map(m => {
              const githubLink = `${m.fileUrl}#L${m.lineNumber}`;
              const fileType = terraformModules.some(
                tm => tm.source === m.source && tm.filePath === m.filePath
              )
                ? 'terraform'
                : 'terragrunt';
              return `"${m.source}","${m.sourceType}","${fileType}","${m.version || ''}","${m.repository}","${m.filePath}",${m.lineNumber},"${githubLink}"`;
            })
            .join('\n');
          outputData = `module,source_type,file_type,version,repository,file_path,line_number,github_link\n${csvData}`;
          break;
        }
        case 'table':
        default: {
          const fileTypeStr = options.terraformOnly
            ? 'Terraform'
            : options.terragruntOnly
              ? 'Terragrunt'
              : 'Infrastructure as Code';

          const tableLines = [
            `\n${fileTypeStr} Module Usage Report`,
            '============================',
            `Scope: ${options.org}${options.repo ? `/${options.repo}` : ' (organization)'}`,
            options.pattern ? `Repository filter: ${options.pattern}` : '',
            `Total modules found: ${allModules.length}${
              !options.terraformOnly && !options.terragruntOnly
                ? ` (${terraformModules.length} Terraform, ${terragruntModules.length} Terragrunt)`
                : ''
            }`,
            `Total files analyzed: ${files.length}${
              !options.terraformOnly && !options.terragruntOnly
                ? ` (${terraformFileCount} Terraform, ${terragruntFileCount} Terragrunt)`
                : ''
            }`,
            '\nModule Summary by Source:',
          ].filter(Boolean);

          // Sort by frequency
          const sortedSources = Object.entries(combinedSummary).sort(
            ([, a], [, b]) => b.count - a.count
          );

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
          const typeCount = allModules.reduce(
            (acc: Record<string, number>, module: IaCModule) => {
              acc[module.sourceType] = (acc[module.sourceType] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );

          Object.entries(typeCount)
            .sort(([, a], [, b]) => b - a)
            .forEach(([type, count]) => {
              tableLines.push(
                `  ${type}: ${count} modules (${((count / allModules.length) * 100).toFixed(1)}%)`
              );
            });

          // Add summary by file type
          if (!options.terraformOnly && !options.terragruntOnly) {
            tableLines.push('\nModules by File Type:');
            tableLines.push(
              `  terraform: ${terraformModules.length} modules (${((terraformModules.length / allModules.length) * 100).toFixed(1)}%)`
            );
            tableLines.push(
              `  terragrunt: ${terragruntModules.length} modules (${((terragruntModules.length / allModules.length) * 100).toFixed(1)}%)`
            );
          }

          outputData = tableLines.join('\n');
          break;
        }
      }

      // Export results if requested or print to console if not exporting
      if (options.export) {
        const exportPath = path.resolve(options.export);
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
process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection:');
  logger.error(reason as string);
  process.exit(1);
});

program.parse(process.argv);
