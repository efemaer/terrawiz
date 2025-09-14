# Terrawiz

Discover and analyze Terraform and Terragrunt modules across GitHub, GitLab, and local filesystems. Terrawiz gives you clear visibility into IaC usage: inventory modules, track versions, and export reports.

[![npm version](https://img.shields.io/npm/v/terrawiz.svg)](https://www.npmjs.com/package/terrawiz)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/efemaer/terrawiz)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Key Features
- Discover Terraform (.tf) and Terragrunt (.hcl) modules across repositories
- Summarize usage by module source and version constraints
- Export results as table, JSON, or CSV
- Filter repositories by name (regex)
- Parallel scanning with adjustable concurrency
- Rate‑limit aware for GitHub/GitLab APIs

## Quick Start (GitHub)

1) Install the CLI
```bash
npm install -g terrawiz
```

2) Set a GitHub token
```bash
# https://github.com/settings/tokens
export GITHUB_TOKEN=your_token
```

3) Run your first scan
```bash
# Scan a GitHub organization
terrawiz scan github:your-org

# Or scan a single repository
terrawiz scan github:your-org/your-repo
```

4) Export results (optional)
```bash
# JSON report
terrawiz scan github:your-org -f json -e audit.json

# CSV report
terrawiz scan github:your-org -f csv -e modules.csv
```

## Example Output

The examples below are captured from running the command against the repository `github:hashicorp/terraform-guides`.

Table (human‑readable):
```bash
terrawiz scan github:hashicorp/terraform-guides
```
```
Infrastructure as Code Module Usage Report
============================
Platform: GitHub
Target: hashicorp/terraform-guides
Scope: Single repository: terraform-guides
Total modules found: 28 (28 Terraform, 0 Terragrunt)
Total files analyzed: 135 (124 Terraform, 11 Terragrunt)

Module Summary by Source:

Azure/compute/azurerm (1 instances, type: registry)
  Versions:
    - 1.1.5: 1 instances

./modules/openshift (1 instances, type: local)

git::ssh://git@github.com/hashicorp-modules/hashistack-gcp (1 instances, type: git)

... (additional sources omitted for brevity)
```

JSON (API‑friendly):
```json
{
  "metadata": {
    "platform": "GitHub",
    "moduleCount": 28,
    "timestamp": "2025-09-14T16:06:48.575Z"
  },
  "modules": [
    {
      "source": "Azure/compute/azurerm",
      "sourceType": "registry",
      "version": "1.1.5",
      "repository": "hashicorp/terraform-guides",
      "filePath": "infrastructure-as-code/azure-vm/main.tf",
      "lineNumber": 19
    }
  ]
}
```

CSV (spreadsheet‑ready):
```csv
module,source_type,file_type,version,repository,file_path,line_number,file_link
Azure/compute/azurerm,registry,terraform,1.1.5,hashicorp/terraform-guides,infrastructure-as-code/azure-vm/main.tf,19,https://github.com/hashicorp/terraform-guides/blob/master/infrastructure-as-code/azure-vm/main.tf#L19
./modules/openshift,local,terraform,,hashicorp/terraform-guides,infrastructure-as-code/k8s-cluster-openshift-aws/main.tf,42,https://github.com/hashicorp/terraform-guides/blob/master/infrastructure-as-code/k8s-cluster-openshift-aws/main.tf#L42
git::ssh://git@github.com/hashicorp-modules/hashistack-gcp,git,terraform,,hashicorp/terraform-guides,infrastructure-as-code/hashistack/dev/terraform-gcp/main.tf,22,https://github.com/hashicorp/terraform-guides/blob/master/infrastructure-as-code/hashistack/dev/terraform-gcp/main.tf#L22
```

## Authentication

- GitHub
  - Env var: `GITHUB_TOKEN` (required)
  - Scope: public repos work with a basic token; for private repos and org scans, grant `repo` (private) and `read:org` as needed.
  - GitHub Enterprise uses the same `GITHUB_TOKEN`; include the host in the source (e.g., `github://github.company.com/org`).

- GitLab
  - Env var: `GITLAB_TOKEN` (required)
  - Scope: `read_api` (or `api`) for private projects; sufficient rights to list projects and read files.
  - Self‑hosted GitLab uses the same `GITLAB_TOKEN`; include the host in the source (e.g., `gitlab://gitlab.company.com/group`).

- Local
  - No authentication required for `local:` sources.

## CLI Reference

- Command structure
  - `terrawiz scan <source> [options]`
  - `terrawiz help [command]`

- Commands
  - `scan` — Scan and analyze IaC modules from a target
  - `help` — Show help for the CLI or a command

- Positional arguments
  - `source` — what to scan. Supported forms:
    - GitHub (cloud): `github:org` or `github:org/repo`
    - GitHub Enterprise: `github://host/org` or `github://host/org/repo`
    - GitLab (cloud): `gitlab:group` or `gitlab:group/project`
    - GitLab Self‑Hosted: `gitlab://host/group` or `gitlab://host/group/project`
    - Local filesystem: `local:.`, `local:/abs/path`, `local:./relative/path`
    - Note: Bitbucket is not supported yet.

- Options
  - `-f, --format <format>` — Output format: `table` (default), `json`, `csv`
  - `-e, --export <file>` — Write results to a file
  - `-c, --concurrency <repos:files>` — Concurrency (e.g., `5:10`)
  - `--limit <number>` — Limit repositories to scan
  - `--include-archived` — Include archived repositories (default is skip)
  - `-p, --pattern <regex>` — Filter repositories by name pattern
  - `--terraform-only` — Scan only Terraform (.tf) files
  - `--terragrunt-only` — Scan only Terragrunt (.hcl) files
  - `--disable-rate-limit` — Disable API rate limiting
  - `--debug` — Enable verbose debug logging
  - [Deprecated] `--org`, `--repo` — Legacy flags (use the `source` argument instead)

## Advanced Usage

- Filtering & scope
  - Focus on certain repos: `-p "^terraform-"`
  - Restrict file types: `--terraform-only` or `--terragrunt-only`
  - Include archived repos: `--include-archived`
  - Limit breadth for quick checks: `--limit 10`

- Performance & rate limits
  - Tune concurrency: `-c 10:20` (repos:files)
  - Respect API limits by default; to disable: `--disable-rate-limit`
  - Use `--debug` to see detailed progress and timings

- Enterprise/self‑hosted targets
  - GitHub Enterprise: `github://github.company.com/org`
  - GitLab self‑hosted: `gitlab://gitlab.company.com/group`

- Local scanning
  - Scan current project: `terrawiz scan local:.`
  - Scan absolute path: `terrawiz scan local:/path/to/terraform`

- CI/CD & Docker
  - Docker (GitHub example):
    ```bash
    docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN \
      ghcr.io/efemaer/terrawiz:latest scan github:your-org -f json
    ```

- No‑install option
  - Prefer not to install globally? Run once with: `npx terrawiz scan github:your-org`

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Quick start:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Run checks: `npm test && npm run lint && npm run format:check`
4. Open a pull request

## License

MIT — see [LICENSE](LICENSE).
