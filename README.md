# TerraWiz

TerraWiz is a command-line tool for tracking and analyzing Terraform and Terragrunt module usage across GitHub repositories and organizations.

## Overview

TerraWiz scans GitHub repositories to identify Terraform and Terragrunt files and extract information about module usage. It helps teams understand their infrastructure-as-code dependencies, versioning patterns, and module distribution across repositories.

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
3. Filtering files with .tf extension (Terraform) and terragrunt.hcl files (Terragrunt)
4. Parsing each file to extract module declarations:
   - For Terraform files: module blocks with source attributes
   - For Terragrunt files: terraform blocks with source attributes
5. Categorizing modules by source type (GitHub, Terraform Registry, local, etc.)
6. Analyzing version constraints and usage patterns

The tool handles rate limiting for GitHub API results and implements smart throttling to maximize throughput while staying within GitHub's limits.

## Project Structure

- `src/index.ts`: Main entry point and CLI interface
- `src/services/github.ts`: GitHub API integration for repository access and file content retrieval
- `src/parsers/terraform.ts`: Terraform file parsing logic for module extraction
- `src/parsers/terragrunt.ts`: Terragrunt file parsing logic for module extraction
- `src/services/logger.ts`: Logging utilities with component-based logging support

## Notes for Developers

- TerraWiz uses the GitHub API and includes rate limit protection by default
- The repository tree approach avoids the GitHub search API's 1000 result limit
- Source types are determined by analyzing the module source string pattern
- The tool supports various module source formats including GitHub URLs, Terraform Registry, and local paths
- You will need to set up a GITHUB_TOKEN environment variable in a .env file to authenticate with the GitHub API
- The tool categorizes module sources into types:
  - For Terraform: local, artifactory, archive, registry, or unknown
  - For Terragrunt: local, artifactory, archive, registry, git, or unknown
- Terragrunt files are identified by the extension .hcl and either:
  - File named exactly "terragrunt.hcl"
  - Located in a directory with "terragrunt" in the path

## License

MIT