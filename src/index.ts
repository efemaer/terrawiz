#!/usr/bin/env node

import { program } from 'commander';
import { VcsServiceFactory, VcsServiceFactoryConfig } from './vcs';
import { TerraformParser, TerragruntParser, IaCModule } from './parsers';
import { Logger, LogLevel } from './services/logger';
import {
  parseSource,
  convertLegacyToSource,
  getPlatformDisplayName,
  ParsedSource,
} from './utils/source-parser';
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
  .description('Track Terraform modules across various platforms (GitHub, local filesystem, etc.)')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan and analyze Infrastructure as Code modules from various sources')
  .argument(
    '[source]',
    'Source to scan (platform:identifier format, e.g., github:myorg, local:/path/to/dir)'
  )

  // === Core Options (Legacy - Deprecated) ===
  .option(
    '-o, --org <organization>',
    '[DEPRECATED] Use source argument instead. GitHub organization or user name'
  )
  .option(
    '-r, --repo <repository>',
    '[DEPRECATED] Use source argument instead. Specific repository name'
  )
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
  .action(async (source, options) => {
    try {
      // Configure logging based on debug flag
      if (options.debug) {
        Logger.getInstance({ level: LogLevel.DEBUG });
        logger.debug('Debug logging enabled');
      }

      // Handle source argument vs legacy flags
      let parsedSource: ParsedSource;
      if (source) {
        // New format: positional argument
        try {
          parsedSource = parseSource(source);
          logger.info(
            `Using source: ${getPlatformDisplayName(parsedSource.platform)} - ${parsedSource.identifier}`
          );
        } catch (error) {
          logger.error(`Invalid source format: ${(error as Error).message}`);
          process.exit(1);
        }
      } else if (options.org) {
        // Legacy format: deprecated flags
        logger.warn('⚠️  DEPRECATION WARNING: --org and --repo flags are deprecated.');
        logger.warn(
          `   Please use the new format: terrawiz scan ${convertLegacyToSource(options.org, options.repo)}`
        );
        logger.warn('   The old flags will be removed in a future version.');

        try {
          const legacySource = convertLegacyToSource(options.org, options.repo);
          parsedSource = parseSource(legacySource);
        } catch (error) {
          logger.error(`Error converting legacy format: ${(error as Error).message}`);
          process.exit(1);
        }
      } else {
        logger.error('Error: No source specified.');
        logger.error('Usage: terrawiz scan <source>');
        logger.error('Examples:');
        logger.error('  terrawiz scan github:myorg');
        logger.error('  terrawiz scan github:myorg/myrepo');
        logger.error('  terrawiz scan local:/path/to/directory');
        logger.error('');
        logger.error('For backward compatibility, you can still use --org (deprecated):');
        logger.error('  terrawiz scan --org myorg');
        process.exit(1);
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

      // Create VCS service using factory
      const vcsServiceConfig: VcsServiceFactoryConfig = {
        platform: parsedSource.platform,
        debug: options.debug,
        skipArchived: !options.includeArchived,
        cacheEnabled: true,
        githubToken: process.env.GITHUB_TOKEN,
        useRateLimit: !options.disableRateLimit,
        repoPattern: options.pattern,
        iacFileTypes,
        maxConcurrentRepos,
        maxConcurrentFiles,
      };

      // Initialize services
      const vcsService = VcsServiceFactory.createService(vcsServiceConfig);
      const terraformParser = new TerraformParser();

      // Log what we're scanning for
      const fileTypesDescription = options.terraformOnly
        ? 'Terraform files'
        : options.terragruntOnly
          ? 'Terragrunt files'
          : 'Terraform and Terragrunt files';

      const targetDescription = parsedSource.repository
        ? `${parsedSource.identifier}/${parsedSource.repository}`
        : parsedSource.identifier;

      logger.info(
        `Scanning for ${fileTypesDescription} in ${getPlatformDisplayName(parsedSource.platform)}: ${targetDescription}${options.pattern ? ` (filtering by pattern: ${options.pattern})` : ''}`
      );

      // Get IaC files using the new approach
      logger.info(`Getting repositories and extracting ${fileTypesDescription}...`);

      let files;
      if (parsedSource.repository) {
        // Single repository specified in source
        const repositories = await vcsService.getRepositories(parsedSource.identifier);
        const targetRepo = repositories.find(repo => repo.name === parsedSource.repository);

        if (!targetRepo) {
          logger.error(
            `Repository '${parsedSource.repository}' not found in '${parsedSource.identifier}'`
          );
          process.exit(1);
        }

        files = await vcsService.findIacFilesInRepository(targetRepo, {
          fileTypes: iacFileTypes,
        });
      } else {
        // All repositories for organization/directory
        const repositoryFilter = {
          skipArchived: !options.includeArchived,
          namePattern: options.pattern ? new RegExp(options.pattern) : undefined,
          maxRepositories: maxRepos || undefined,
        };
        const fileOptions = {
          fileTypes: iacFileTypes,
        };
        files = await vcsService.findAllIacFiles(
          parsedSource.identifier,
          repositoryFilter,
          fileOptions
        );
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
          platform: getPlatformDisplayName(parsedSource.platform),
          source: parsedSource.originalInput,
          owner: parsedSource.identifier,
          repository: parsedSource.repository || 'All repositories',
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
              const fileLink = `${m.fileUrl}#L${m.lineNumber}`;
              const fileType = terraformModules.some(
                tm => tm.source === m.source && tm.filePath === m.filePath
              )
                ? 'terraform'
                : 'terragrunt';
              return `"${m.source}","${m.sourceType}","${fileType}","${m.version || ''}","${m.repository}","${m.filePath}",${m.lineNumber},"${fileLink}"`;
            })
            .join('\n');
          outputData = `module,source_type,file_type,version,repository,file_path,line_number,file_link\n${csvData}`;
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
            `Platform: ${getPlatformDisplayName(parsedSource.platform)}`,
            `Scope: ${targetDescription}`,
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
