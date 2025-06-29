# TerraWiz

TerraWiz is a command-line tool for tracking and analyzing Terraform and Terragrunt module usage across GitHub repositories and organizations.

## Overview

TerraWiz scans GitHub repositories to identify Terraform and Terragrunt files and extract information about module usage. It helps teams understand their infrastructure-as-code dependencies, versioning patterns, and module distribution across repositories.

Key features:
- Scan entire GitHub organizations or specific repositories
- Support for both Terraform (.tf) and Terragrunt (.hcl) files
- Detection of various module source types including git, registry, local, and artifactory
- Version tracking and analysis of module dependencies
- Flexible output formats (JSON, CSV, table)

## Installation

### NPM Registry (Soon)
TBA

### Local Development Build
```bash
# Clone the repository
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
node dist/index.js scan --org <organization> [options]

# Optionally, create a symlink to run as a command
npm link
terrawiz scan --org <organization> [options]
```

## GitHub Token Setup

**Important**: TerraWiz requires a GitHub personal access token to access repositories and their contents.

1. Create a Personal Access Token (PAT) on GitHub:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Create a new token with at least the following permissions:
     - Repository access: All repositories (or specific repositories you want to scan)
     - Repository permissions: Contents (Read-only)

2. Set the token as an environment variable:
   ```bash
   # For temporary use in current terminal session
   export GITHUB_TOKEN=your_token_here
   
   # Or create a .env file in the project directory
   echo "GITHUB_TOKEN=your_token_here" > .env
   ```

3. For persistent use, add the token to your shell profile (.bashrc, .zshrc, etc.)

Without this token, the tool will not be able to authenticate with the GitHub API and will fail to retrieve repository contents.

## Usage

```bash
terrawiz scan --org <organization> [options]
```

### Commands

- `scan`: Search for and analyze Terraform modules in GitHub repositories

### Options

#### Scan Command Options

- `--org <organization>`: **Required**. GitHub organization or user name
- `--repo <repository>`: Specific repository name (if not provided, will search the entire organization)
- `--repo-pattern <regex>`: Filter repositories by name using regex pattern
- `--format <format>`: Output format: json, csv, or table (default: table)
- `--output <filepath>`: Export results to specified file
- `--debug`: Enable debug logging
- `--max-repos <number>`: Maximum number of repositories to process
- `--no-rate-limit`: Disable rate limit protection (enabled by default)
- `--skip-archived`: Skip archived repositories (default: true)
- `--terraform-only`: Only scan for Terraform files (default: scan both Terraform and Terragrunt)
- `--terragrunt-only`: Only scan for Terragrunt files (default: scan both Terraform and Terragrunt)

## Examples

Search an entire organization and display results as a table:
```bash
terrawiz scan --org myorg
```

Scan an entire organization and export results to CSV:
```bash
terrawiz scan --org myorg --format csv --output terraform-modules.csv
```

Search a specific repository and export as JSON:
```bash
terrawiz scan --org myorg --repo myrepo --format json --output results.json
```

Limit search to a specific number of repositories:
```bash
terrawiz scan --org myorg --max-repos 5
```

Filter repositories using regex pattern:
```bash
# Match repos that start with "terraform-"
terrawiz scan --org myorg --repo-pattern "^terraform-"

# Match repos containing "service" anywhere in the name
terrawiz scan --org myorg --repo-pattern "service" --format json --output service-modules.json
```

Scan with debug logging enabled (for troubleshooting):
```bash
terrawiz scan --org myorg --debug
```

Search only for Terraform files (excluding Terragrunt):
```bash
terrawiz scan --org myorg --terraform-only
```

Search only for Terragrunt files (excluding Terraform):
```bash
terrawiz scan --org myorg --terragrunt-only
```

## Output

TerraWiz provides a detailed analysis of Terraform module usage:

### JSON Format
Includes structured data with:
- Metadata (owner, repository, timestamp, counts by file type)
- Complete module details (source, version, file location, file type, etc.)
- Summary statistics
- Rate limit information

### CSV Format
Exports a flat file with columns:
- module
- source_type
- file_type (terraform or terragrunt)
- version
- repository
- file_path
- line_number
- github_link

### Table Format
Displays a human-readable summary with:
- Module count by source
- Version distribution
- Source type statistics
- Rate limit status

## Technical Details

TerraWiz works by:
1. Retrieving all repositories in an organization or user account
2. For each repository, getting the file tree from the default branch
3. Filtering files with .tf (Terraform) and .hcl (Terragrunt) files
4. Parsing each file to extract module declarations:
   - For Terraform files: module blocks with source attributes
   - For Terragrunt files: terraform blocks with source attributes
5. Categorizing modules by source type (GitHub, Terraform Registry, local, etc.)
6. Analyzing version constraints and usage patterns

The tool handles rate limiting for GitHub API results and implements smart throttling to maximize throughput while staying within GitHub's limits.

## Project Structure

```
src/
├── index.ts                    # CLI entry point
├── types/                      # Shared type definitions
│   ├── vcs.ts                 # VCS domain types (repositories, files, errors)
│   └── index.ts               # Type exports
├── vcs/                       # VCS platform implementations
│   ├── base.ts                # Base VCS service with common patterns
│   ├── github.ts              # GitHub API implementation
│   └── index.ts               # VCS exports
├── parsers/                   # Infrastructure as Code parsers
│   ├── base.ts                # Base parser with common functionality
│   ├── terraform.ts           # Terraform (.tf) file parser
│   ├── terragrunt.ts          # Terragrunt (.hcl) file parser
│   └── index.ts               # Parser exports
└── services/                  # Shared services
    └── logger.ts              # Logging service
```

### Architecture

TerraWiz uses a clean, domain-organized architecture:

**VCS Layer (`vcs/`)**
- `BaseVcsService`: Common patterns for all VCS platforms (caching, error handling, workflows)
- `GitHubService`: GitHub-specific implementation using Octokit
- Future: GitLab, Bitbucket services will extend the same base

**Parser Layer (`parsers/`)**
- `BaseParser`: Common parsing functionality and module extraction patterns
- `TerraformParser`: Terraform-specific parsing logic for `.tf` files
- `TerragruntParser`: Terragrunt-specific parsing logic for `.hcl` files

**Key Design Principles:**
- **Domain separation**: VCS, parsing, and shared services are clearly separated
- **Platform flexibility**: Each VCS platform uses its optimal SDK (Octokit for GitHub)
- **Type safety**: Strong typing with comprehensive error handling via `VcsError`
- **Clean imports**: Barrel exports enable simple, predictable import paths

## Notes for Developers

- TerraWiz uses the GitHub API and includes rate limit protection by default
- The repository tree approach avoids the GitHub search API's 1000 result limit
- Source types are determined by analyzing the module source string pattern
- The tool supports various module source formats including GitHub URLs, Terraform Registry, and local paths
- You will need to set up a GITHUB_TOKEN environment variable in a .env file to authenticate with the GitHub API
- The tool categorizes module sources into types:
  - local: Local module references (e.g., "./modules/vpc")
  - artifactory: Modules hosted in Artifactory (contains "jfrog.io")
  - archive: Archive files (ends with .tar.gz or .zip)
  - registry: Terraform Registry modules (e.g., "terraform-aws-modules/vpc/aws")
  - git: Git repositories (prefixed with "git::" or containing "github.com"/"gitlab.com")
  - unknown: Any other source format
- Terragrunt files are identified by the extension .hcl, which may include some false positives

## Roadmap

- ✅ **Testing Infrastructure** - Comprehensive test suite with Jest for reliability and confident development
- ✅ **Clean Architecture** - Domain-organized structure with proper separation of concerns
- ✅ **Type Safety** - Strong typing with standardized error handling via `VcsError`
- 🚧 **VCS Platform Support** - Add support for GitLab, Bitbucket, and other version control systems (architecture ready)
- **Performance Optimization** - Add parallel processing for file operations to improve scan times for large organizations
- **Input Validation & Error Handling** - Enhanced validation for GitHub tokens, regex patterns, and meaningful error messages
- **Enhanced Observability** - Progress indicators and performance metrics for better monitoring

## Contributing

Contributions to TerraWiz are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Please ensure your code follows the existing style patterns and includes appropriate documentation.
