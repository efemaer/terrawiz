# Contributing to Terrawiz

Thank you for your interest in contributing to Terrawiz! This guide covers the technical architecture, development setup, and contribution guidelines.

## Architecture Overview

Terrawiz is built with a clean, modular TypeScript architecture designed for extensibility and maintainability.

### Core Architecture

```
src/
├── index.ts              # CLI entry point and command parsing
├── types/                # TypeScript type definitions
│   └── vcs.ts           # VCS platform types and interfaces
├── vcs/                  # Version Control System integrations
│   ├── base.ts          # Abstract base class with common VCS patterns
│   ├── factory.ts       # Service factory for creating VCS instances
│   ├── github.ts        # GitHub/GitHub Enterprise implementation
│   ├── gitlab.ts        # GitLab/GitLab Self-Hosted implementation
│   └── index.ts         # Barrel exports
├── scanners/            # File system scanners
│   └── local-filesystem.ts # Local directory scanning implementation
├── parsers/             # Infrastructure as Code file parsers
│   ├── base.ts          # Abstract parser base class
│   ├── terraform.ts     # Terraform (.tf) file parser
│   ├── terragrunt.ts    # Terragrunt (.hcl) file parser
│   └── index.ts         # Barrel exports
├── utils/               # Shared utilities
│   ├── concurrent.ts    # Parallel processing utilities
│   ├── source-parser.ts # CLI source argument parsing
│   ├── file-type-detector.ts # File type identification
│   ├── error-handler.ts # Standardized error handling
│   └── repository-mapper.ts # Repository data mapping
├── services/            # Shared services
│   └── logger.ts        # Structured logging service
└── constants/           # Application constants
    └── index.ts         # Centralized configuration constants
```

### Design Principles

1. **Platform Agnostic**: VCS operations are abstracted through common interfaces
2. **Extensible**: New VCS platforms can be added by implementing the base interfaces
3. **Type Safe**: Comprehensive TypeScript types prevent runtime errors
4. **Parallel Processing**: Concurrent operations for optimal performance
5. **Error Resilient**: Graceful error handling with detailed reporting
6. **Testable**: Clean separation of concerns enables comprehensive testing

### Key Components

#### VCS Services (`src/vcs/`)

The VCS layer abstracts different version control platforms:

- **BaseVcsService**: Abstract base class defining common VCS operations
- **GitHubService**: Implements GitHub.com and GitHub Enterprise support
- **GitLabService**: Implements GitLab.com and self-hosted GitLab support
- **VcsServiceFactory**: Creates appropriate service instances based on platform

**Adding a New VCS Platform:**

1. Create a new service class extending `BaseVcsService`
2. Implement required abstract methods: `repositoryExists`, `getRepositories`, `getSingleRepository`, `findIacFilesInRepository`
3. Add platform enum to `VcsPlatform` in `types/vcs.ts`
4. Update the factory in `vcs/factory.ts`
5. Add error handling patterns in `utils/error-handler.ts`

#### Parsers (`src/parsers/`)

The parser layer extracts module information from IaC files:

- **BaseParser**: Common parsing functionality and interfaces
- **TerraformParser**: Parses `.tf` files for module declarations
- **TerragruntParser**: Parses `.hcl` files for Terragrunt configurations

**Parser Architecture:**
- **Source Detection**: Identifies module source types (registry, git, local, etc.)
- **Version Extraction**: Extracts version constraints from module declarations
- **Line Number Tracking**: Provides precise file locations for modules
- **Error Handling**: Graceful handling of malformed or incomplete files

#### Concurrent Processing (`src/utils/concurrent.ts`)

High-performance parallel processing utilities:

- **processConcurrently**: Parallel processing with configurable concurrency limits
- **processConcurrentlySettled**: Parallel processing that collects both successes and failures
- **Error Aggregation**: Comprehensive error reporting for failed operations

### Configuration and Extensibility

#### Platform Configuration

Each VCS platform accepts a standardized configuration:

```typescript
interface BaseVcsConfig {
  platform: VcsPlatform;
  debug?: boolean;
  skipArchived?: boolean;
  maxRetries?: number;
  cacheEnabled?: boolean;
}
```

Platform-specific configurations extend the base:

```typescript
interface GitHubServiceConfig extends BaseVcsConfig {
  token: string;
  host?: string; // For GitHub Enterprise
  useRateLimit?: boolean;
  repoPattern?: string;
  iacFileTypes?: readonly IacFileType[];
  maxConcurrentRepos?: number;
  maxConcurrentFiles?: number;
}
```

#### Source URI Format

Terrawiz uses a consistent URI-style format for specifying scan targets:

- **Public platforms**: `github:org`, `gitlab:group`
- **Self-hosted instances**: `github://host.com/org`, `gitlab://host.com:port/group`
- **Local filesystem**: `local:/path/to/directory`, `local:./relative/path`

The source parser (`utils/source-parser.ts`) handles all format variations and platform detection.

### Testing Strategy

#### Test Structure

```
tests/
├── unit/                # Unit tests for individual components
│   ├── vcs/            # VCS service tests
│   ├── parsers/        # Parser tests
│   ├── utils/          # Utility function tests
│   └── types/          # Type validation tests
└── utils/              # Test utilities and builders
```

#### Testing Patterns

- **Mocked Dependencies**: VCS services use mocked HTTP clients for isolated testing
- **Builder Pattern**: Test utilities create consistent test data
- **Comprehensive Coverage**: All public interfaces and error conditions tested
- **Integration Tests**: End-to-end flows through the CLI

#### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm test -- --testPathPattern=vcs/github
```

### Performance Considerations

#### Concurrency Configuration

Terrawiz balances performance with API rate limits:

- **Repository-level parallelism**: Process multiple repositories simultaneously
- **File-level parallelism**: Scan files within repositories concurrently
- **Configurable limits**: Tune concurrency based on API limits and system resources

Default concurrency settings:
- **Repositories**: 5 concurrent (adjustable via `-c` flag)
- **Files per repository**: 10 concurrent (adjustable via `-c` flag)

#### Rate Limiting

- **GitHub**: Automatic throttling with exponential backoff
- **GitLab**: Configurable rate limiting
- **Retry Logic**: Intelligent retry with backoff for transient failures

#### Caching

- **Repository Metadata**: Cache repository information to avoid redundant API calls
- **Processed Repository Tracking**: Avoid duplicate processing of repositories
- **File Content Caching**: Optional caching of file contents (disabled by default)

### Error Handling

#### Error Types

Terrawiz defines comprehensive error types for different failure scenarios:

```typescript
enum VcsErrorType {
  AUTHENTICATION_FAILED = 'authentication_failed',
  AUTHORIZATION_FAILED = 'authorization_failed',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  NETWORK_ERROR = 'network_error',
  PLATFORM_ERROR = 'platform_error',
  INVALID_CONFIGURATION = 'invalid_configuration',
  UNKNOWN_ERROR = 'unknown_error',
}
```

#### Error Handling Strategy

- **Platform-Specific Detection**: Each VCS platform has specific error detection patterns
- **Graceful Degradation**: Failed repositories don't stop the entire scan
- **Detailed Reporting**: Comprehensive error information for debugging
- **User-Friendly Messages**: Convert technical errors to actionable user messages

### Development Setup

#### Prerequisites

- **Node.js**: Version 22 or higher
- **npm**: Latest version
- **Git**: For version control
- **Platform Tokens**: GitHub and/or GitLab tokens for testing

#### Initial Setup

```bash
# Clone the repository
git clone https://github.com/efemaer/terrawiz.git
cd terrawiz

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your platform tokens
```

#### Development Workflow

```bash
# Run in development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Run all quality checks
npm run quality

# Build for production
npm run build
```

#### Adding Features

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Write tests first**: Follow TDD approach
3. **Implement feature**: Follow existing patterns and architecture
4. **Update documentation**: Update README or CONTRIBUTING.md as needed
5. **Run quality checks**: `npm run quality`
6. **Submit pull request**: Include tests and documentation

#### Code Style Guidelines

- **TypeScript**: Use strict type checking
- **ESLint**: Follow configured rules
- **Prettier**: Use for code formatting
- **Naming**: Use descriptive, self-documenting names
- **Comments**: Focus on "why" not "what"
- **Error Handling**: Always handle errors gracefully
- **Testing**: Write tests for all public interfaces

### Platform-Specific Implementation Details

#### GitHub Integration

- **API Client**: Octokit with throttling plugin
- **Authentication**: Personal access tokens
- **Rate Limiting**: Built-in GitHub API rate limit handling
- **Enterprise Support**: Custom base URL configuration

Key endpoints used:
- `/orgs/{org}` - Organization information
- `/orgs/{org}/repos` - Organization repositories
- `/users/{username}/repos` - User repositories
- `/repos/{owner}/{repo}` - Repository details
- `/repos/{owner}/{repo}/git/trees/{sha}` - Repository file tree

#### GitLab Integration

- **API Client**: @gitbeaker/rest
- **Authentication**: Personal access tokens
- **Rate Limiting**: Configurable throttling
- **Self-Hosted Support**: Custom host configuration

Key endpoints used:
- `/groups/{id}` - Group information
- `/projects` - Projects listing
- `/projects/{id}` - Project details
- `/projects/{id}/repository/tree` - Repository file tree
- `/projects/{id}/repository/files/{path}` - File contents

### Release Process

#### Version Management

- **Semantic Versioning**: Major.Minor.Patch
- **Automated Releases**: GitHub Actions for CI/CD
- **Changelog**: Automated generation from commit messages

#### Testing Requirements

Before release:
- All tests must pass (`npm test`)
- Code coverage must be maintained
- Linting must pass (`npm run lint`)
- Type checking must pass (`npm run type-check`)
- Manual testing of core scenarios

### Future Architecture Considerations

#### Planned Enhancements

1. **Additional VCS Platforms**: Bitbucket, Azure DevOps
2. **Configuration File Support**: `.terrawiz.json` for project-specific settings
3. **Plugin System**: Extensible architecture for custom parsers
4. **Web Dashboard**: Browser-based interface for scan results
5. **Caching Layer**: Persistent caching for improved performance

#### Scalability Considerations

- **Database Integration**: Optional database backend for large-scale usage
- **API Server Mode**: REST API for integration with other tools
- **Distributed Processing**: Support for distributed scanning across multiple workers

### Getting Help

- **Issues**: Report bugs and request features on GitHub
- **Discussions**: Technical discussions and questions
- **Documentation**: This file and inline code documentation
- **Code Review**: Pull request reviews and feedback

### License and Legal

- **MIT License**: Open source with permissive licensing
- **Dependencies**: All dependencies are compatible with MIT license
- **Security**: Regular dependency updates and security scanning