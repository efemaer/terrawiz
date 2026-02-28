# Changelog

## [1.0.0] - 2026-02-28

### Added

- **Azure DevOps support** — scan Terraform and Terragrunt modules across Azure DevOps repositories (cloud and self-hosted)
- **Bitbucket support** — scan modules across Bitbucket Cloud and Server/Data Center repositories
- **GitLab support** — full group and project scanning (cloud and self-hosted)
- **Local filesystem scanning** — analyze modules directly from local directories
- **Terragrunt support** — parse `.hcl` files alongside Terraform `.tf` files
- **Multiple output formats** — table, JSON, and CSV
- **Export to file** — write results directly to a file
- **Repository filtering** — filter repos by regex pattern
- **Configurable concurrency** — parallel repository and file scanning
- **Docker support** — multi-stage builds, published to GitHub Container Registry
- **Self-hosted platform support** — GitHub Enterprise, GitLab self-hosted, Azure DevOps Server, Bitbucket Data Center
- **API rate limiting** — intelligent retry with exponential backoff
- **Module normalization and sorting** — consistent, deterministic output
- **Safe regex validation** — prevent ReDoS attacks on user-provided patterns
- Comprehensive test suite
- CI/CD pipeline with quality checks
- Published to npm registry
