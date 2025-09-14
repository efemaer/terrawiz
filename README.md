# Terrawiz

> **Discover and analyze Terraform modules across GitHub, GitLab, and local filesystems**

[![npm version](https://img.shields.io/npm/v/terrawiz.svg)](https://www.npmjs.com/package/terrawiz)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/efemaer/terrawiz)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Get complete visibility into your Infrastructure as Code. Scan organizations, export reports, and track module usage across your infrastructure.

```bash
# Scan GitHub organization
npx terrawiz scan github:your-org

# Self-hosted instances
npx terrawiz scan github://github.company.com/your-org
```

## Why Terrawiz?

**Common Infrastructure Challenges:**
- "Which repositories use the VPC module?"
- "What version of terraform-aws-eks are we running?"
- "Do we have any deprecated modules?"
- Manual searching across repositories takes hours

**Terrawiz Solutions:**
- Complete module inventory across platforms
- Version tracking across all repositories  
- Export reports for compliance and audits
- Identify security risks and technical debt

## Example Output

```bash
terrawiz scan github:hashicorp
```

```
Infrastructure as Code Module Usage Report
============================
Platform: GitHub
Target: hashicorp
Total modules found: 47 (38 Terraform, 9 Terragrunt)
Total files analyzed: 156

Module Summary by Source:

terraform-aws-modules/vpc/aws (12 instances, type: registry)
  Versions:
    - ~> 5.0: 8 instances
    - ~> 4.0: 4 instances

./modules/networking (8 instances, type: local)

terraform-aws-modules/eks/aws (6 instances, type: registry)
  Versions:
    - ~> 19.0: 6 instances

git::github.com/company/modules.git//s3?ref=v2.0 (3 instances, type: git)
```

**Use Cases:**
- **DevOps Teams** - Audit infrastructure dependencies
- **Security Teams** - Identify vulnerable module versions  
- **Compliance** - Generate module inventory reports
- **Platform Teams** - Track module adoption across organizations

## Quick Start

### 1. Run without installation
```bash
# Scan GitHub organization
npx terrawiz scan github:your-org

# Export to CSV
npx terrawiz scan github:your-org -f csv -e modules.csv
```

### 2. Setup authentication tokens
```bash
# GitHub token: https://github.com/settings/tokens
export GITHUB_TOKEN=your_token

# GitLab token: https://gitlab.com/-/profile/personal_access_tokens
export GITLAB_TOKEN=your_token
```

### 3. Scan platforms
```bash
# Public platforms
terrawiz scan github:your-org
terrawiz scan gitlab:your-group

# Self-hosted instances  
terrawiz scan github://github.company.com/your-org
terrawiz scan gitlab://gitlab.company.com/your-group

# Local directories
terrawiz scan local:/path/to/terraform

# Export results
terrawiz scan github:your-org -f json -e audit-report.json
```

## Output Formats

### Table (Human-readable)
```
Module Summary by Source:
terraform-aws-modules/vpc/aws (5 instances)
  - ~> 5.0: 3 instances  
  - ~> 4.0: 2 instances
./modules/networking (4 instances)
```

### JSON (API-friendly)
```json
{
  "metadata": {
    "platform": "GitHub",
    "moduleCount": 14,
    "timestamp": "2024-06-29T14:23:15.456Z"
  },
  "modules": [
    {
      "source": "terraform-aws-modules/vpc/aws",
      "version": "~> 5.0",
      "repository": "infrastructure-core",
      "filePath": "networking/vpc.tf",
      "lineNumber": 12
    }
  ]
}
```

### CSV (Spreadsheet-ready)
```csv
module,source_type,version,repository,file_path,line
terraform-aws-modules/vpc/aws,registry,~> 5.0,infra-core,main.tf,12
```

## Module Detection

Terrawiz identifies these module source types:
- **Registry modules**: `terraform-aws-modules/vpc/aws`
- **Git sources**: `git::github.com/company/modules.git//vpc`
- **Local modules**: `./modules/networking`, `../shared/database`
- **Private registries**: `registry.company.com/team/vpc`

## Performance Features

- Parallel processing across repositories
- Concurrent file scanning within repositories
- Built-in rate limiting respects API limits
- Smart caching avoids redundant requests

## Advanced Usage

### Performance Tuning
```bash
# High-speed scanning (15 repos, 25 files concurrently)
terrawiz scan github:large-org -c 15:25

# Conservative (rate-limited tokens)
terrawiz scan github:your-org -c 2:5
```

### Filtering Options
```bash
# Only Terraform files
terrawiz scan github:your-org --terraform-only

# Pattern matching
terrawiz scan github:your-org -p "^terraform-"

# Include archived repos
terrawiz scan github:your-org --include-archived

# Limit scope
terrawiz scan github:your-org --limit 10
```

### Enterprise & Self-Hosted
```bash
# GitHub Enterprise
terrawiz scan github://github.company.com/devops

# GitLab self-hosted with custom port
terrawiz scan gitlab://gitlab.company.com:8080/platform-team

# Multiple platform audit
terrawiz scan github:public-org -e github-audit.csv
terrawiz scan gitlab://internal.com/team -e gitlab-audit.csv
```

### Local Development
```bash
# Scan current project
terrawiz scan local:.

# Scan with absolute path
terrawiz scan local:/home/user/terraform-projects

# Export local results
terrawiz scan local:./infrastructure -f json -e local-modules.json
```

### CI/CD Integration
```bash
# Docker usage
docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN \
  ghcr.io/efemaer/terrawiz:latest scan github:your-org -f json

# GitHub Actions / GitLab CI
terrawiz scan github:${{ github.repository_owner }} --terraform-only
```

## Installation Options

### NPM (Recommended)
```bash
npm install -g terrawiz
terrawiz scan github:your-org
```

### NPX (No Installation)
```bash
npx terrawiz scan github:your-org
```

### Docker (CI/CD)
```bash
docker pull ghcr.io/efemaer/terrawiz:latest
docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN \
  ghcr.io/efemaer/terrawiz:latest scan github:your-org
```

## Use Cases

### Security Audits
```bash
# Find all module versions for vulnerability scanning
terrawiz scan github:your-org -f csv -e security-audit.csv
```

### Compliance Reporting
```bash
# Generate compliance reports
terrawiz scan github:your-org -f json -e compliance-$(date +%Y%m%d).json
```

### Migration Planning
```bash
# Identify modules to upgrade
terrawiz scan github:your-org --terraform-only -p "legacy-"
```

### Architecture Analysis
```bash
# Cross-platform module usage analysis  
terrawiz scan github:public-repos -e github-modules.csv
terrawiz scan gitlab://internal.com/team -e internal-modules.csv
```

## Tips

### Performance
- Use `--limit` for quick checks: `terrawiz scan github:large-org --limit 5`
- Tune concurrency for your API limits: `-c 10:20` for fast, `-c 2:5` for conservative
- Export large results to files instead of console output

### Filtering
- Use regex patterns to focus: `-p "^terraform-aws-"` for AWS modules only
- Combine with file type filters: `--terraform-only -p "vpc"`
- Skip archived repos to focus on active code: default behavior

### Reporting
- JSON format for programmatic analysis
- CSV format for spreadsheets and data analysis  
- Table format for human review and terminal output

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development setup, architecture overview, and contribution guidelines.

Quick start:
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`  
3. Test your changes: `npm test && npm run lint`
4. Submit pull request

### Development Setup
```bash
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz
npm install
npm test
```

## License

MIT License - see [LICENSE](LICENSE) file for details.