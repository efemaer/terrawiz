# 🧙‍♂️ TerraWiz

**A blazing-fast CLI tool for discovering and analyzing Terraform modules across you organization.**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/efemaer/terrawiz)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TerraWiz performs source-code scanning across your GitHub organization to find all Terraform and Terragrunt module usage. It identifies module sources (registry, local, git), tracks versions, and generates comprehensive reports in table, JSON, or CSV formats. Perfect for infrastructure audits, dependency tracking, security reviews, and understanding your IaC module ecosystem at scale.

---

## ✨ Features

- 🚀 **High-Performance Scanning** - Parallel processing with configurable concurrency limits
- 🔍 **Comprehensive Discovery** - Scan entire GitHub organizations or specific repositories
- 🏗️ **Terraform & Terragrunt Support** - Parse both .tf and .hcl files with source-code analysis
- 📊 **Multi-Format Export** - JSON, CSV, and formatted table outputs
- 🎯 **Smart Filtering** - Repository patterns, file types, and version analysis
- 🛡️ **Built-in Rate Limiting** - Automatic GitHub API throttling and protection
- 📈 **Detailed Analytics** - Module usage patterns, source types, and version tracking
- ⚡ **Intuitive CLI** - Short options, logical grouping, and concise command syntax

## 🚀 Quick Start

### 📋 Requirements
- **Node.js** 22+
- **GitHub Token** with repository read access

### Installation
```bash
# Clone and build
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz
npm install && npm run build && npm link
```

### Setup GitHub Token
Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with repository read access:
```bash
# Set environment variable
export GITHUB_TOKEN=your_token_here

# Or create .env file
echo "GITHUB_TOKEN=your_token_here" > .env
```

### Basic Usage
```bash
# Scan an entire organization
terrawiz scan -o your-org

# Export to CSV with performance tuning
terrawiz scan -o your-org -f csv -e modules.csv -c 10:20

# Scan specific repository
terrawiz scan -o your-org -r specific-repo
```

## 📖 CLI Reference

### Core Command
```bash
terrawiz scan [options]
```

### Options

#### Core Options
| Option | Description | Default |
|--------|-------------|---------|
| `-o, --org <name>` | **Required.** GitHub organization or user | - |
| `-r, --repo <name>` | Scan specific repository only | All repos |
| `-p, --pattern <regex>` | Filter repositories by name pattern | - |

#### Output Options
| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <type>` | Output format: `table`, `json`, `csv` | `table` |
| `-e, --export <file>` | Export results to file | - |

#### Performance Options
| Option | Description | Default |
|--------|-------------|---------|
| `-c, --concurrency <repos:files>` | Concurrent processing (e.g., `5:10`) | `5:10` |
| `--limit <number>` | Maximum repositories to scan | Unlimited |

#### Filtering Options
| Option | Description | Default |
|--------|-------------|---------|
| `--include-archived` | Include archived repositories | Skip archived |
| `--terraform-only` | Scan only Terraform (.tf) files | Both types |
| `--terragrunt-only` | Scan only Terragrunt (.hcl) files | Both types |

#### Advanced Options
| Option | Description | Default |
|--------|-------------|---------|
| `--disable-rate-limit` | Disable GitHub API rate limiting | Enabled |
| `--debug` | Enable detailed logging | Disabled |

## 💡 Usage Examples

### Organization Analysis

```bash
# Complete organization scan
terrawiz scan -o hashicorp

# High-performance scan for large organizations
terrawiz scan -o aws -c 15:25 -f json -e aws-modules.json
```

### Targeted Scanning

```bash
# Specific repository
terrawiz scan -o hashicorp -r terraform-aws-vpc

# Pattern-based filtering
terrawiz scan -o mycompany -p "^terraform-" -f csv

# Infrastructure-specific scans
terrawiz scan -o myorg --terraform-only -e terraform-only.json
terrawiz scan -o myorg --terragrunt-only --limit 20
```

### Development & Debugging

```bash
# Debug mode with detailed logging
terrawiz scan -o myorg --debug --limit 3

# Conservative scanning for rate-limited tokens
terrawiz scan -o myorg -c 2:5

# Include archived repositories
terrawiz scan -o myorg --include-archived
```

## 📊 Sample Outputs

### Table Format (Default)
```
Infrastructure as Code Module Usage Report
============================
Scope: mycompany (organization)
Total modules found: 14 (11 Terraform, 3 Terragrunt)
Total files analyzed: 38 (31 Terraform, 7 Terragrunt)
Repositories scanned: 8

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
    "owner": "mycompany",
    "repository": "All repositories",
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
      "name": "terraform-aws-modules/vpc/aws",
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
      "name": "./modules/networking",
      "source": "./modules/networking",
      "sourceType": "local",
      "repository": "app-platform",
      "filePath": "main.tf",
      "fileUrl": "https://github.com/mycompany/app-platform/blob/main/main.tf",
      "lineNumber": 25,
      "type": "terraform"
    },
    {
      "name": "git::https://github.com/company/terraform-modules.git//s3?ref=v2.0",
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
| Module | Type | Format | Version | Repository | File | Line | Link |
|:-------|:-----|:-------|:--------|:-----------|:-----|:-----|:-----|
| `terraform-aws-modules/vpc/aws` | registry | terraform | `~> 5.0` | infrastructure-core | `networking/vpc.tf` | 12 | [🔗](https://github.com/mycompany/infrastructure-core/blob/main/networking/vpc.tf#L12) |
| `terraform-aws-modules/vpc/aws` | registry | terraform | `~> 4.0` | legacy-infra | `main.tf` | 8 | [🔗](https://github.com/mycompany/legacy-infra/blob/main/main.tf#L8) |
| `./modules/networking` | local | terraform | - | app-platform | `main.tf` | 25 | [🔗](https://github.com/mycompany/app-platform/blob/main/main.tf#L25) |
| `./modules/networking` | local | terragrunt | - | service-mesh | `terragrunt.hcl` | 15 | [🔗](https://github.com/mycompany/service-mesh/blob/main/terragrunt.hcl#L15) |
| `git::github.com/company/`<br>`terraform-modules.git//s3?ref=v2.0` | git | terraform | `ref=v2.0` | data-storage | `storage.tf` | 8 | [🔗](https://github.com/mycompany/data-storage/blob/main/storage.tf#L8) |
| `artifactory.company.com/`<br>`terraform/aws-rds` | artifactory | terraform | `1.2.3` | database-tier | `rds.tf` | 33 | [🔗](https://github.com/mycompany/database-tier/blob/main/rds.tf#L33) |

## 🗺️ Roadmap

### ✅ Completed
- **Testing Infrastructure** - Comprehensive test suite with Jest
- **Clean Architecture** - Domain-organized structure with proper separation
- **High-Performance Parallel Processing** - Configurable concurrent processing
- **Intuitive CLI Interface** - Short options and user-friendly syntax

### 🚧 In Progress
- **Increase Reliability** - Expand test coverage and overall reliability
- **Multi-Platform VCS Support** - GitLab, Bitbucket, and Azure DevOps integration

### 🔮 Planned
- **Advanced Analytics** - Dependency graphs, security scanning, compliance reporting
- **Performance Monitoring** - Built-in metrics and optimization suggestions
- **Web Dashboard** - Browser-based interface for scan results
- **CI/CD Integration** - GitHub Actions, GitLab CI, and Jenkins plugins

## 🏗️ Architecture

TerraWiz features a clean, modular architecture:

```
src/
├── index.ts              # CLI entry point
├── vcs/                  # VCS platform integrations
│   ├── base.ts          # Common VCS patterns
│   └── github.ts        # GitHub implementation
├── parsers/             # IaC file parsers
│   ├── base.ts          # Common parsing logic
│   ├── terraform.ts     # Terraform parser
│   └── terragrunt.ts    # Terragrunt parser
├── utils/               # Utilities
│   └── concurrent.ts    # Parallel processing
└── services/            # Shared services
    └── logger.ts        # Logging service
```

### Key Design Principles

- **🔄 Parallel Processing** - Concurrent repository and file processing for maximum performance
- **🎯 Type Safety** - Comprehensive TypeScript types with proper error handling
- **🔧 Extensible** - Plugin architecture ready for GitLab, Bitbucket, and other VCS platforms
- **⚡ Performance-First** - Optimized GitHub API usage with intelligent rate limiting

## 🧪 Module Source Detection

TerraWiz automatically categorizes modules by source type:

| Type | Examples | Description |
|------|----------|-------------|
| **registry** | `terraform-aws-modules/vpc/aws` | Terraform Registry modules |
| **git** | `github.com/org/repo.git` | Git repositories |
| **local** | `./modules/vpc`, `../shared` | Local file paths |
| **artifactory** | `jfrog.io/modules/vpc` | Artifactory-hosted modules |
| **archive** | `https://releases.../module.tar.gz` | Archive downloads |

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

# Lint and format
npm run lint
npm run format

# Build
npm run build
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ for Infrastructure as Code teams</strong>
</p>