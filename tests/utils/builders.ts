/**
 * Test data builders using the Builder pattern for creating mock data
 */

import {
  IacFile,
  IacFileType,
  VcsConfig,
  VcsPlatform,
  VcsRepository,
  VcsFileTreeItem,
  VcsOperationResult,
  VcsPagination,
  VcsRateLimit,
} from '../../src/types/vcs';
import {
  MutableIacFile,
  MutableVcsRepository,
  MutableVcsConfig,
  MutableVcsFileTreeItem,
  MutableVcsOperationResult,
  TestTypeConverters,
} from '../types/test-types';

/**
 * Builder for creating mock VCS repositories
 */
export class VcsRepositoryBuilder {
  private repository: MutableVcsRepository = {
    owner: 'test-owner',
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    defaultBranch: 'main',
    archived: false,
    private: false,
    webUrl: 'https://github.com/test-owner/test-repo',
    cloneUrl: 'https://github.com/test-owner/test-repo.git',
  };

  withOwner(owner: string): VcsRepositoryBuilder {
    this.repository.owner = owner;
    this.repository.fullName = `${owner}/${this.repository.name}`;
    this.repository.webUrl = `https://github.com/${owner}/${this.repository.name}`;
    this.repository.cloneUrl = `https://github.com/${owner}/${this.repository.name}.git`;
    return this;
  }

  withName(name: string): VcsRepositoryBuilder {
    this.repository.name = name;
    this.repository.fullName = `${this.repository.owner}/${name}`;
    this.repository.webUrl = `https://github.com/${this.repository.owner}/${name}`;
    this.repository.cloneUrl = `https://github.com/${this.repository.owner}/${name}.git`;
    return this;
  }

  withFullName(fullName: string): VcsRepositoryBuilder {
    this.repository.fullName = fullName;
    const [owner, name] = fullName.split('/');
    this.repository.owner = owner;
    this.repository.name = name;
    this.repository.webUrl = `https://github.com/${fullName}`;
    this.repository.cloneUrl = `https://github.com/${fullName}.git`;
    return this;
  }

  withDefaultBranch(branch: string): VcsRepositoryBuilder {
    this.repository.defaultBranch = branch;
    return this;
  }

  withArchived(archived: boolean): VcsRepositoryBuilder {
    this.repository.archived = archived;
    return this;
  }

  withPrivate(isPrivate: boolean): VcsRepositoryBuilder {
    this.repository.private = isPrivate;
    return this;
  }

  withWebUrl(webUrl: string): VcsRepositoryBuilder {
    this.repository.webUrl = webUrl;
    return this;
  }

  withCloneUrl(cloneUrl: string): VcsRepositoryBuilder {
    this.repository.cloneUrl = cloneUrl;
    return this;
  }

  build(): VcsRepository {
    return TestTypeConverters.toVcsRepository(this.repository);
  }

  static create(): VcsRepositoryBuilder {
    return new VcsRepositoryBuilder();
  }
}

/**
 * Builder for creating mock IaC files
 */
export class IacFileBuilder {
  private file: MutableIacFile = {
    type: 'terraform',
    repository: 'test-owner/test-repo',
    path: 'main.tf',
    content: 'resource "aws_instance" "example" {\n  ami = "ami-12345"\n}',
    webUrl: 'https://github.com/test-owner/test-repo/blob/main/main.tf',
    sha: 'abc123',
    size: 100,
  };

  withType(type: IacFileType): IacFileBuilder {
    this.file.type = type;
    if (type === 'terraform' && this.file.path === 'main.hcl') {
      this.file.path = 'main.tf';
    } else if (type === 'terragrunt' && this.file.path === 'main.tf') {
      this.file.path = 'terragrunt.hcl';
    }
    return this;
  }

  withRepository(repository: string): IacFileBuilder {
    this.file.repository = repository;
    this.file.webUrl = `https://github.com/${repository}/blob/main/${this.file.path}`;
    return this;
  }

  withPath(path: string): IacFileBuilder {
    this.file.path = path;
    // Auto-detect type from path
    if (path.endsWith('.tf')) {
      this.file.type = 'terraform';
    } else if (path.endsWith('.hcl')) {
      this.file.type = 'terragrunt';
    }
    this.file.webUrl = `https://github.com/${this.file.repository}/blob/main/${path}`;
    return this;
  }

  withContent(content: string): IacFileBuilder {
    this.file.content = content;
    this.file.size = content.length;
    return this;
  }

  withWebUrl(webUrl: string): IacFileBuilder {
    this.file.webUrl = webUrl;
    return this;
  }

  withSha(sha: string): IacFileBuilder {
    this.file.sha = sha;
    return this;
  }

  withSize(size: number): IacFileBuilder {
    this.file.size = size;
    return this;
  }

  build(): IacFile {
    return TestTypeConverters.toIacFile(this.file);
  }

  static create(): IacFileBuilder {
    return new IacFileBuilder();
  }

  static terraform(): IacFileBuilder {
    return new IacFileBuilder().withType('terraform');
  }

  static terragrunt(): IacFileBuilder {
    return new IacFileBuilder().withType('terragrunt');
  }
}

/**
 * Builder for creating mock VCS configurations
 */
export class VcsConfigBuilder {
  private config: MutableVcsConfig = {
    platform: VcsPlatform.GITHUB,
    auth: {
      token: 'test-token-123',
      tokenType: 'bearer',
    },
    timeout: 30000,
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 10000,
    },
    rateLimit: {
      enabled: true,
      requestsPerMinute: 5000,
    },
  };

  withPlatform(platform: VcsPlatform): VcsConfigBuilder {
    this.config.platform = platform;
    return this;
  }

  withBaseUrl(baseUrl: string): VcsConfigBuilder {
    this.config.baseUrl = baseUrl;
    return this;
  }

  withAuth(token: string, tokenType: 'bearer' | 'basic' | 'oauth' = 'bearer'): VcsConfigBuilder {
    this.config.auth = { token, tokenType };
    return this;
  }

  withTimeout(timeout: number): VcsConfigBuilder {
    this.config.timeout = timeout;
    return this;
  }

  withRetryConfig(
    maxRetries: number,
    backoffMultiplier: number,
    maxBackoffMs: number
  ): VcsConfigBuilder {
    this.config.retryConfig = { maxRetries, backoffMultiplier, maxBackoffMs };
    return this;
  }

  withRateLimit(enabled: boolean, requestsPerMinute?: number): VcsConfigBuilder {
    this.config.rateLimit = { enabled, requestsPerMinute };
    return this;
  }

  build(): VcsConfig {
    return TestTypeConverters.toVcsConfig(this.config);
  }

  static create(): VcsConfigBuilder {
    return new VcsConfigBuilder();
  }

  static github(): VcsConfigBuilder {
    return new VcsConfigBuilder().withPlatform(VcsPlatform.GITHUB);
  }

  static githubEnterprise(baseUrl: string): VcsConfigBuilder {
    return new VcsConfigBuilder().withPlatform(VcsPlatform.GITHUB_ENTERPRISE).withBaseUrl(baseUrl);
  }

  static gitlab(): VcsConfigBuilder {
    return new VcsConfigBuilder()
      .withPlatform(VcsPlatform.GITLAB)
      .withBaseUrl('https://gitlab.com');
  }

  static bitbucket(): VcsConfigBuilder {
    return new VcsConfigBuilder()
      .withPlatform(VcsPlatform.BITBUCKET)
      .withBaseUrl('https://api.bitbucket.org');
  }
}

/**
 * Builder for creating mock file tree items
 */
export class VcsFileTreeItemBuilder {
  private item: MutableVcsFileTreeItem = {
    path: 'main.tf',
    type: 'file',
    sha: 'abc123',
    size: 100,
    webUrl: 'https://github.com/test-owner/test-repo/blob/main/main.tf',
  };

  withPath(path: string): VcsFileTreeItemBuilder {
    this.item.path = path;
    this.item.webUrl = `https://github.com/test-owner/test-repo/blob/main/${path}`;
    return this;
  }

  withType(type: 'file' | 'directory'): VcsFileTreeItemBuilder {
    this.item.type = type;
    return this;
  }

  withSha(sha: string): VcsFileTreeItemBuilder {
    this.item.sha = sha;
    return this;
  }

  withSize(size: number): VcsFileTreeItemBuilder {
    this.item.size = size;
    return this;
  }

  withWebUrl(webUrl: string): VcsFileTreeItemBuilder {
    this.item.webUrl = webUrl;
    return this;
  }

  build(): VcsFileTreeItem {
    return TestTypeConverters.toVcsFileTreeItem(this.item);
  }

  static create(): VcsFileTreeItemBuilder {
    return new VcsFileTreeItemBuilder();
  }

  static file(path: string): VcsFileTreeItemBuilder {
    return new VcsFileTreeItemBuilder().withPath(path).withType('file');
  }

  static directory(path: string): VcsFileTreeItemBuilder {
    return new VcsFileTreeItemBuilder().withPath(path).withType('directory').withSize(0);
  }
}

/**
 * Builder for creating mock VCS operation results
 */
export class VcsOperationResultBuilder<T> {
  private result: MutableVcsOperationResult<T> = {
    data: {} as T,
    pagination: undefined,
    rateLimit: undefined,
    requestId: 'req-123',
    cached: false,
  };

  withData(data: T): VcsOperationResultBuilder<T> {
    this.result.data = data;
    return this;
  }

  withPagination(
    page: number,
    perPage: number,
    totalPages?: number,
    totalItems?: number,
    hasNext?: boolean
  ): VcsOperationResultBuilder<T> {
    this.result.pagination = {
      page,
      perPage,
      totalPages,
      totalItems,
      hasNext: hasNext ?? page < (totalPages ?? 1),
    };
    return this;
  }

  withRateLimit(remaining: number, total: number, resetAt?: Date): VcsOperationResultBuilder<T> {
    this.result.rateLimit = {
      remaining,
      total,
      resetAt: resetAt ?? new Date(Date.now() + 3600000), // 1 hour from now
    };
    return this;
  }

  withRequestId(requestId: string): VcsOperationResultBuilder<T> {
    this.result.requestId = requestId;
    return this;
  }

  withCached(cached: boolean): VcsOperationResultBuilder<T> {
    this.result.cached = cached;
    return this;
  }

  build(): VcsOperationResult<T> {
    return TestTypeConverters.toVcsOperationResult(this.result);
  }

  static create<T>(data: T): VcsOperationResultBuilder<T> {
    return new VcsOperationResultBuilder<T>().withData(data);
  }
}

/**
 * Utility class for creating collections of test data
 */
export class TestDataFactory {
  /**
   * Create multiple repositories with varying properties
   */
  static createRepositories(
    count: number,
    options?: {
      owner?: string;
      namePrefix?: string;
      includeArchived?: boolean;
    }
  ): VcsRepository[] {
    const repositories: VcsRepository[] = [];
    const owner = options?.owner ?? 'test-org';
    const namePrefix = options?.namePrefix ?? 'repo';

    for (let i = 0; i < count; i++) {
      const builder = VcsRepositoryBuilder.create()
        .withOwner(owner)
        .withName(`${namePrefix}-${i + 1}`);

      if (options?.includeArchived && i % 3 === 0) {
        builder.withArchived(true);
      }

      repositories.push(builder.build());
    }

    return repositories;
  }

  /**
   * Create multiple IaC files with varying types and content
   */
  static createIacFiles(
    count: number,
    options?: {
      repository?: string;
      mixTypes?: boolean;
      pathPrefix?: string;
    }
  ): IacFile[] {
    const files: IacFile[] = [];
    const repository = options?.repository ?? 'test-owner/test-repo';
    const pathPrefix = options?.pathPrefix ?? '';

    for (let i = 0; i < count; i++) {
      const type = options?.mixTypes && i % 2 === 0 ? 'terragrunt' : 'terraform';
      const extension = type === 'terraform' ? '.tf' : '.hcl';
      const path = `${pathPrefix}${pathPrefix ? '/' : ''}file-${i + 1}${extension}`;

      const builder = IacFileBuilder.create()
        .withType(type)
        .withRepository(repository)
        .withPath(path)
        .withContent(TestDataFactory.createSampleContent(type));

      files.push(builder.build());
    }

    return files;
  }

  /**
   * Create sample content for different file types
   */
  static createSampleContent(type: IacFileType): string {
    if (type === 'terraform') {
      return `resource "aws_instance" "example" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
  
  tags = {
    Name = "example-instance"
  }
}

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "3.14.0"
  
  name = "my-vpc"
  cidr = "10.0.0.0/16"
}`;
    } else {
      return `terraform {
  source = "git::https://github.com/example/terraform-modules.git//vpc?ref=v1.0.0"
}

include {
  path = find_in_parent_folders()
}

inputs = {
  vpc_name = "production"
  cidr_block = "10.0.0.0/16"
}`;
    }
  }

  /**
   * Create sample file tree structure
   */
  static createFileTree(): VcsFileTreeItem[] {
    return [
      VcsFileTreeItemBuilder.directory('modules').build(),
      VcsFileTreeItemBuilder.directory('modules/vpc').build(),
      VcsFileTreeItemBuilder.file('modules/vpc/main.tf').build(),
      VcsFileTreeItemBuilder.file('modules/vpc/variables.tf').build(),
      VcsFileTreeItemBuilder.file('modules/vpc/outputs.tf').build(),
      VcsFileTreeItemBuilder.directory('environments').build(),
      VcsFileTreeItemBuilder.directory('environments/prod').build(),
      VcsFileTreeItemBuilder.file('environments/prod/terragrunt.hcl').build(),
      VcsFileTreeItemBuilder.file('environments/prod/vpc.tf').build(),
      VcsFileTreeItemBuilder.file('README.md').build(),
    ];
  }
}
