# 🧙‍♂️ TerraWiz

**A blazing-fast CLI tool for discovering and analyzing Terraform & Terragrunt modules across GitHub organizations.**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/efemaer/terrawiz)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- 🚀 **High-Performance Scanning** - Parallel processing with configurable concurrency limits
- 🔍 **Comprehensive Discovery** - Scan entire GitHub organizations or specific repositories
- 📊 **Multi-Format Export** - JSON, CSV, and formatted table outputs
- 🎯 **Smart Filtering** - Repository patterns, file types, and version analysis
- 🛡️ **Built-in Rate Limiting** - Automatic GitHub API throttling and protection
- 📈 **Detailed Analytics** - Module usage patterns, source types, and version tracking
- ⚡ **Intuitive CLI** - Short options, logical grouping, and concise command syntax


## 🗺️ Roadmap

### ✅ Completed
- **Testing Infrastructure** - Comprehensive test suite with Jest for reliability and confident development
- **Clean Architecture** - Domain-organized structure with proper separation of concerns
- **High-Performance Parallel Processing** - Configurable concurrent repository and file processing
- **Intuitive CLI Interface** - Short options, logical grouping, and user-friendly command syntax

### 🚧 In Progress
- **Increase Reliability** - Expand test suite to increase coverage and overall reliability
- **Multi-Platform VCS Support** - GitLab, Bitbucket, and Azure DevOps integration

### 🔮 Planned
- **Advanced Analytics** - Dependency graphs, security scanning, and compliance reporting
- **Performance Monitoring** - Built-in metrics and performance optimization suggestions

### 💡 Future Ideas
- **Web Dashboard** - Browser-based interface for scan results and analytics
- **CI/CD Integration** - GitHub Actions, GitLab CI, and Jenkins plugins
- **Plugin System** - Custom parsers and output formatters

## 🚀 Quick Start

### 📋 Requirements

- **Node.js** 22+ 
- **GitHub Token** with repository read access

### Installation

```bash
# Clone and build
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz
npm install && npm run build

# Create global command
npm link
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

# Scan with high performance settings
terrawiz scan -o your-org -c 10:20

# Export results to CSV
terrawiz scan -o your-org -f csv -e modules.csv
```

## 📖 Documentation

### Core Commands

```bash
terrawiz scan [options]
```

### Core Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --org <name>` | **Required.** GitHub organization or user | - |
| `-r, --repo <name>` | Scan specific repository only | All repos |
| `-p, --pattern <regex>` | Filter repositories by name pattern | - |

### Output Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <type>` | Output format: `table`, `json`, `csv` | `table` |
| `-e, --export <file>` | Export results to file | - |

### Performance Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --concurrency <repos:files>` | Concurrent processing (e.g., `5:10`) | `5:10` |
| `--limit <number>` | Maximum repositories to scan | Unlimited |

### Filtering Options

| Option | Description | Default |
|--------|-------------|---------|
| `--include-archived` | Include archived repositories | Skip archived |
| `--terraform-only` | Scan only Terraform (.tf) files | Both types |
| `--terragrunt-only` | Scan only Terragrunt (.hcl) files | Both types |

### Advanced Options

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

## 📊 Output Formats

### Table Format (Default)
```
Infrastructure as Code Module Usage Report
============================
Scope: hashicorp (organization)
Total modules found: 42 (38 Terraform, 4 Terragrunt)
Total files analyzed: 156 (134 Terraform, 22 Terragrunt)

Module Summary by Source:

terraform-aws-modules/vpc/aws (12 instances, type: registry)
  Versions:
    - ~> 3.0: 8 instances
    - ~> 2.0: 4 instances
```

### JSON Format
```json
{
  "metadata": {
    "owner": "hashicorp",
    "repository": "All repositories",
    "timestamp": "2024-06-29T23:15:30.123Z",
    "moduleCount": 42
  },
  "modules": [...],
  "summary": {...}
}
```

### CSV Format
```csv
module,source_type,file_type,version,repository,file_path,line_number,github_link
terraform-aws-modules/vpc/aws,registry,terraform,~> 3.0,terraform-aws-vpc,main.tf,15,https://github.com/...
```

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