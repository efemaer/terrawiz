# 🧙‍♂️ TerraWiz

**A blazing-fast open-source CLI tool for discovering and analyzing Terraform modules across multiple platforms.**

[![npm version](https://img.shields.io/npm/v/terrawiz.svg)](https://www.npmjs.com/package/terrawiz)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/efemaer/terrawiz)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TerraWiz performs source-code scanning across GitHub organizations, local directories, and other platforms to find all Terraform and Terragrunt module usage. It identifies module sources (registry, local, git), tracks versions, and generates comprehensive reports in table, JSON, or CSV formats. Perfect for infrastructure audits, dependency tracking, security reviews, and understanding your IaC module ecosystem at scale.

---

## ✨ Features

- 🚀 **High-Performance Scanning** - Parallel processing with configurable concurrency limits
- 🌐 **Multi-Platform Support** - GitHub organizations, local directories, and extensible for GitLab/Bitbucket
- 🔍 **Comprehensive Discovery** - Scan entire organizations, specific repositories, or local file systems
- 🏗️ **Terraform & Terragrunt Support** - Parse both .tf and .hcl files with source-code analysis
- 📊 **Multi-Format Export** - JSON, CSV, and formatted table outputs
- 🎯 **Smart Filtering** - Repository patterns, file types, and version analysis
- 🛡️ **Built-in Rate Limiting** - Automatic GitHub API throttling and protection
- 📈 **Detailed Analytics** - Module usage patterns, source types, and version tracking
- ⚡ **Intuitive CLI** - URI-style source format with backward compatibility

## 🚀 Quick Start

### 📋 Requirements

- **Node.js** 22+
- **GitHub Token** with repository read access (for GitHub scanning)
- **Local filesystem access** (for local directory scanning)

### Installation

#### Option 1: Install from NPM (Recommended)

```bash
# Install globally
npm install -g terrawiz

# Or run directly with npx
npx terrawiz scan github:your-org
```

#### Option 2: Build from Source

```bash
# Clone and build
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz
npm install && npm run build && npm link
```

### Setup

#### For GitHub Scanning

Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with repository read access:

```bash
# Set environment variable
export GITHUB_TOKEN=your_token_here

# Or create .env file
echo "GITHUB_TOKEN=your_token_here" > .env
```

#### For Local Directory Scanning

No additional setup required - just ensure you have read access to the target directory.

### Basic Usage

```bash
# Scan GitHub organization
terrawiz scan github:your-org

# Scan local directory
terrawiz scan local:/path/to/terraform/code

# Scan specific GitHub repository
terrawiz scan github:your-org/specific-repo

# Export to CSV with performance tuning
terrawiz scan github:your-org -f csv -e modules.csv -c 10:20

# Scan relative local path
terrawiz scan local:./infrastructure
```

## 📖 CLI Reference

### Core Command

```bash
terrawiz scan <source> [options]
```

### Sources

TerraWiz uses a URI-style format to specify what to scan:

| Format            | Description                          | Examples                     |
| ----------------- | ------------------------------------ | ---------------------------- |
| `github:org`      | Scan GitHub organization             | `github:hashicorp`           |
| `github:org/repo` | Scan specific GitHub repository      | `github:hashicorp/terraform` |
| `local:/path`     | Scan local directory (absolute path) | `local:/home/user/terraform` |
| `local:./path`    | Scan local directory (relative path) | `local:./infrastructure`     |

### Options

#### Legacy Options (Deprecated)

| Option              | Description                          | Migration             |
| ------------------- | ------------------------------------ | --------------------- |
| `-o, --org <name>`  | **[DEPRECATED]** GitHub organization | Use `github:org`      |
| `-r, --repo <name>` | **[DEPRECATED]** Specific repository | Use `github:org/repo` |

#### Core Options

| Option                  | Description                         | Default |
| ----------------------- | ----------------------------------- | ------- |
| `-p, --pattern <regex>` | Filter repositories by name pattern | -       |

#### Output Options

| Option                | Description                           | Default |
| --------------------- | ------------------------------------- | ------- |
| `-f, --format <type>` | Output format: `table`, `json`, `csv` | `table` |
| `-e, --export <file>` | Export results to file                | -       |

#### Performance Options

| Option                            | Description                          | Default   |
| --------------------------------- | ------------------------------------ | --------- |
| `-c, --concurrency <repos:files>` | Concurrent processing (e.g., `5:10`) | `5:10`    |
| `--limit <number>`                | Maximum repositories to scan         | Unlimited |

#### Filtering Options

| Option               | Description                                 | Default       |
| -------------------- | ------------------------------------------- | ------------- |
| `--include-archived` | Include archived repositories (GitHub only) | Skip archived |
| `--terraform-only`   | Scan only Terraform (.tf) files             | Both types    |
| `--terragrunt-only`  | Scan only Terragrunt (.hcl) files           | Both types    |

#### Advanced Options

| Option                 | Description                                    | Default  |
| ---------------------- | ---------------------------------------------- | -------- |
| `--disable-rate-limit` | Disable GitHub API rate limiting (GitHub only) | Enabled  |
| `--debug`              | Enable detailed logging                        | Disabled |

## 💡 Usage Examples

### GitHub Organization Analysis

```bash
# Complete organization scan
terrawiz scan github:hashicorp

# High-performance scan for large organizations
terrawiz scan github:aws -c 15:25 -f json -e aws-modules.json

# Legacy format (deprecated but still works)
terrawiz scan -o hashicorp
```

### Targeted Scanning

```bash
# Specific GitHub repository
terrawiz scan github:hashicorp/terraform-aws-vpc

# Pattern-based filtering
terrawiz scan github:mycompany -p "^terraform-" -f csv

# Local directory scanning
terrawiz scan local:/home/user/terraform-projects
terrawiz scan local:./infrastructure

# Infrastructure-specific scans
terrawiz scan github:myorg --terraform-only -e terraform-only.json
terrawiz scan local:./terraform --terragrunt-only
```

### Development & Debugging

```bash
# Debug mode with detailed logging
terrawiz scan github:myorg --debug --limit 3

# Conservative scanning for rate-limited tokens
terrawiz scan github:myorg -c 2:5

# Include archived repositories (GitHub only)
terrawiz scan github:myorg --include-archived

# Local development workflow
terrawiz scan local:. --debug
```

### Local Filesystem Features

```bash
# Scan current directory
terrawiz scan local:.

# Scan with absolute path
terrawiz scan local:/home/user/infrastructure

# Export local scan results
terrawiz scan local:./terraform -f json -e local-modules.json

# Filter file types locally
terrawiz scan local:/projects/terraform --terraform-only

# High concurrency for large local directories
terrawiz scan local:/enterprise/iac -c 1:20
```

**Local Filesystem Benefits:**

- ⚡ **No API Rate Limits** - Scan as fast as your filesystem allows
- 🔒 **Complete Privacy** - No external API calls or data transmission
- 📁 **Recursive Scanning** - Automatically traverses subdirectories
- 🔗 **Symlink Support** - Follows symbolic links with loop protection
- 🚫 **Smart Filtering** - Skips common directories (.git, node_modules, etc.)
- 🔧 **Development Friendly** - Perfect for CI/CD pipelines and local development

## 📊 Sample Outputs

### Table Format (Default)

```
Infrastructure as Code Module Usage Report
============================
Platform: GitHub
Target: mycompany
Scope: All repositories in mycompany
Total modules found: 14 (11 Terraform, 3 Terragrunt)
Total files analyzed: 38 (31 Terraform, 7 Terragrunt)

Module Summary by Source:

terraform-aws-modules/vpc/aws (5 instances, type: registry)
  Versions:
    - ~> 5.0: 3 instances
    - ~> 4.0: 2 instances

./modules/networking (4 instances, type: local)

terraform-aws-modules/eks/aws (2 instances, type: registry)
  Versions:
    - ~> 19.0: 2 instances

git::https://github.com/company/terraform-modules.git//s3?ref=v2.0 (2 instances, type: git)
  Versions:
    - ref=v2.0: 1 instance
    - ref=main: 1 instance

artifactory.company.com/terraform/aws-rds (1 instance, type: artifactory)
  Versions:
    - 1.2.3: 1 instance

Modules by Source Type:
  registry: 7 (50.0%)
  local: 4 (28.6%)
  git: 2 (14.3%)
  artifactory: 1 (7.1%)

Modules by File Type:
  terraform: 11 (78.6%)
  terragrunt: 3 (21.4%)
```

### JSON Format

```json
{
  "metadata": {
    "platform": "GitHub",
    "source": "github:mycompany",
    "target": "mycompany",
    "scope": "All repositories in mycompany",
    "timestamp": "2024-06-29T14:23:15.456Z",
    "moduleCount": 14,
    "fileCount": 38,
    "terraformModuleCount": 11,
    "terragruntModuleCount": 3,
    "terraformFileCount": 31,
    "terragruntFileCount": 7
  },
  "modules": [
    {
      "name": "vpc_main",
      "source": "terraform-aws-modules/vpc/aws",
      "sourceType": "registry",
      "version": "~> 5.0",
      "repository": "infrastructure-core",
      "filePath": "networking/vpc.tf",
      "fileUrl": "https://github.com/mycompany/infrastructure-core/blob/main/networking/vpc.tf",
      "lineNumber": 12,
      "type": "terraform"
    },
    {
      "name": "network_module",
      "source": "./modules/networking",
      "sourceType": "local",
      "repository": "app-platform",
      "filePath": "main.tf",
      "fileUrl": "https://github.com/mycompany/app-platform/blob/main/main.tf",
      "lineNumber": 25,
      "type": "terraform"
    },
    {
      "name": "s3_bucket",
      "source": "git::https://github.com/company/terraform-modules.git//s3?ref=v2.0",
      "sourceType": "git",
      "version": "ref=v2.0",
      "repository": "data-storage",
      "filePath": "storage.tf",
      "fileUrl": "https://github.com/mycompany/data-storage/blob/main/storage.tf",
      "lineNumber": 8,
      "type": "terraform"
    }
  ],
  "summary": {
    "terraform-aws-modules/vpc/aws": {
      "count": 5,
      "versions": {
        "~> 5.0": 3,
        "~> 4.0": 2
      }
    },
    "./modules/networking": {
      "count": 4,
      "versions": {}
    }
  }
}
```

### CSV Format

| Module                                                        | Source Type | File Type | Version   | Repository          | File Path           | Line | File Link                                                                                               |
|---------------------------------------------------------------|-------------|-----------|-----------|---------------------|---------------------|------|---------------------------------------------------------------------------------------------------------|
| `terraform-aws-modules/vpc/aws`                              | registry    | terraform | `~> 5.0`  | infrastructure-core | `networking/vpc.tf` | 12   | https://github.com/mycompany/infrastructure-core/blob/main/networking/vpc.tf#L12                       |
| `terraform-aws-modules/vpc/aws`                              | registry    | terraform | `~> 4.0`  | legacy-infra        | `main.tf`           | 8    | https://github.com/mycompany/legacy-infra/blob/main/main.tf#L8                                         |
| `./modules/networking`                                        | local       | terraform | -         | app-platform        | `main.tf`           | 25   | https://github.com/mycompany/app-platform/blob/main/main.tf#L25                                        |
| `./modules/networking`                                        | local       | terragrunt| -         | service-mesh        | `terragrunt.hcl`    | 15   | https://github.com/mycompany/service-mesh/blob/main/terragrunt.hcl#L15                                 |
| `git::github.com/company/terraform-modules.git//s3?ref=v2.0` | git         | terraform | `ref=v2.0`| data-storage        | `storage.tf`        | 8    | https://github.com/mycompany/data-storage/blob/main/storage.tf#L8                                      |

## 🗺️ Roadmap

### ✅ Completed

- **Local Filesystem Support** - Scan local directories with full feature parity
- **Modern CLI Interface** - URI-style source format with backward compatibility
- **Testing Infrastructure** - Comprehensive test suite with Jest (85%+ coverage)
- **Clean Architecture** - Domain-organized structure with proper separation
- **High-Performance Parallel Processing** - Configurable concurrent processing
- **Service Factory Pattern** - Extensible architecture for multiple platforms
- **Unified Output Format** - Consistent metadata across JSON, CSV, and table formats
- **Code Quality Standards** - ESLint, Prettier, and TypeScript with zero warnings

### 🚧 In Progress

- **Extended VCS Support** - GitLab, Bitbucket, and Azure DevOps integration

### 🔮 Planned

- **Advanced Analytics** - Dependency graphs, security scanning, compliance reporting
- **Performance Monitoring** - Built-in metrics and optimization suggestions
- **Web Dashboard** - Browser-based interface for scan results
- **CI/CD Integration** - GitHub Actions, GitLab CI, and Jenkins plugins

## 🏗️ Architecture

TerraWiz features a clean, modular architecture:

```
src/
├── index.ts              # CLI entry point with platform routing
├── vcs/                  # VCS platform integrations
│   ├── base.ts          # Common VCS patterns
│   ├── factory.ts       # Service factory
│   └── github.ts        # GitHub implementation
├── scanners/            # Filesystem scanners
│   └── local-filesystem.ts # Local directory scanner
├── parsers/             # IaC file parsers
│   ├── base.ts          # Common parsing logic
│   ├── terraform.ts     # Terraform parser
│   └── terragrunt.ts    # Terragrunt parser
├── utils/               # Utilities
│   ├── concurrent.ts    # Parallel processing
│   ├── source-parser.ts # Source URI parsing
│   └── file-type-detector.ts # File type utilities
├── constants/           # Configuration constants
│   └── index.ts         # Centralized constants
└── services/            # Shared services
    └── logger.ts        # Logging service
```

### Key Design Principles

- **🔄 Parallel Processing** - Concurrent repository and file processing for maximum performance
- **🎯 Type Safety** - Comprehensive TypeScript types with proper error handling
- **🏗️ Platform-Agnostic** - Early routing with dedicated scanners for VCS vs local filesystem
- **🔧 Extensible** - Clean architecture ready for GitLab, Bitbucket, and other VCS platforms
- **⚡ Performance-First** - Optimized API usage with intelligent rate limiting and caching

## 🧪 Module Source Detection

TerraWiz automatically categorizes modules by source type:

| Type            | Examples                            | Description                |
| --------------- | ----------------------------------- | -------------------------- |
| **registry**    | `terraform-aws-modules/vpc/aws`     | Terraform Registry modules |
| **git**         | `github.com/org/repo.git`           | Git repositories           |
| **local**       | `./modules/vpc`, `../shared`        | Local file paths           |
| **artifactory** | `jfrog.io/modules/vpc`              | Artifactory-hosted modules |
| **archive**     | `https://releases.../module.tar.gz` | Archive downloads          |

## 🚀 Performance Features

### Parallel Processing

- **Repository-level parallelism**: Process multiple repositories simultaneously
- **File-level parallelism**: Download and parse files concurrently within each repository
- **Configurable limits**: Balance performance with API rate limits

### Optimizations

- **Smart caching**: Avoid redundant API calls for repository metadata
- **Batch operations**: Efficient GitHub API usage patterns
- **Progress tracking**: Real-time feedback for long-running scans

### Rate Limiting

- **Automatic throttling**: Built-in GitHub API rate limit protection
- **Retry logic**: Exponential backoff for failed requests
- **Monitoring**: Rate limit status reporting in debug mode

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Develop** your changes with tests
4. **Test** your implementation: `npm test`
5. **Commit** your changes: `git commit -m 'Add amazing feature'`
6. **Push** to your branch: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run type-check

# Run all quality checks
npm run quality

# Build
npm run build
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ for Infrastructure as Code teams</strong>
</p>
