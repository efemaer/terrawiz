import { LocalFilesystemService } from '../../../src/vcs/local';
import { VcsPlatform } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LocalFilesystemService', () => {
  let service: LocalFilesystemService;
  let tempDir: string;

  beforeEach(() => {
    service = new LocalFilesystemService({
      platform: VcsPlatform.LOCAL,
      debug: false,
      maxConcurrentFiles: 5,
    });

    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrawiz-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create a LocalFilesystemService instance', () => {
      expect(service).toBeInstanceOf(LocalFilesystemService);
      expect(service.platformName).toBe('Local Filesystem');
    });

    it('should use default maxConcurrentFiles when not specified', () => {
      const defaultService = new LocalFilesystemService({
        platform: VcsPlatform.LOCAL,
      });
      expect(defaultService).toBeInstanceOf(LocalFilesystemService);
    });
  });

  describe('repositoryExists', () => {
    it('should return true for existing directory', async () => {
      const result = await service.repositoryExists(tempDir, '');
      expect(result).toBe(true);
    });

    it('should return false for non-existent directory', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent');
      const result = await service.repositoryExists(nonExistentPath, '');
      expect(result).toBe(false);
    });

    it('should return false for file instead of directory', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'test content');

      const result = await service.repositoryExists(filePath, '');
      expect(result).toBe(false);
    });
  });

  describe('getRepositories', () => {
    it('should return repository information for valid directory', async () => {
      const repositories = await service.getRepositories(tempDir);

      expect(repositories).toHaveLength(1);
      expect(repositories[0]).toEqual({
        owner: path.dirname(tempDir),
        name: path.basename(tempDir),
        fullName: tempDir,
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: `file://${tempDir}`,
        cloneUrl: `file://${tempDir}`,
      });
    });

    it('should throw error for non-existent directory', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent');

      await expect(service.getRepositories(nonExistentPath)).rejects.toThrow(
        `Directory does not exist: ${nonExistentPath}`
      );
    });

    it('should throw error for file instead of directory', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'test content');

      await expect(service.getRepositories(filePath)).rejects.toThrow(
        `Path is not a directory: ${filePath}`
      );
    });
  });

  describe('findIacFilesInRepository', () => {
    beforeEach(() => {
      // Create test directory structure with IaC files
      const subDir = path.join(tempDir, 'modules');
      fs.mkdirSync(subDir, { recursive: true });

      // Create Terraform files
      fs.writeFileSync(
        path.join(tempDir, 'main.tf'),
        `
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
}
`
      );

      fs.writeFileSync(
        path.join(subDir, 'networking.tf'),
        `
module "subnets" {
  source = "./local-subnets"
}
`
      );

      // Create Terragrunt file
      fs.writeFileSync(
        path.join(tempDir, 'terragrunt.hcl'),
        `
terraform {
  source = "git::https://github.com/company/modules.git//vpc?ref=v1.0.0"
}
`
      );

      // Create non-IaC files (should be ignored)
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test project');
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

      // Create node_modules directory (should be skipped)
      const nodeModulesDir = path.join(tempDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir);
      fs.writeFileSync(path.join(nodeModulesDir, 'test.tf'), 'should be ignored');
    });

    it('should find all IaC files in directory', async () => {
      const repository = {
        owner: path.dirname(tempDir),
        name: path.basename(tempDir),
        fullName: tempDir,
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: `file://${tempDir}`,
        cloneUrl: `file://${tempDir}`,
      };

      const files = await service.findIacFilesInRepository(repository);

      expect(files).toHaveLength(3);

      // Check that all expected files are found
      const filePaths = files.map(f => f.path).sort();
      expect(filePaths).toEqual(['main.tf', 'modules/networking.tf', 'terragrunt.hcl']);

      // Check file types
      const terraformFiles = files.filter(f => f.type === 'terraform');
      const terragruntFiles = files.filter(f => f.type === 'terragrunt');
      expect(terraformFiles).toHaveLength(2);
      expect(terragruntFiles).toHaveLength(1);

      // Check file content is read
      const mainTfFile = files.find(f => f.path === 'main.tf');
      expect(mainTfFile?.content).toContain('terraform-aws-modules/vpc/aws');
    });

    it('should filter by file types when specified', async () => {
      const repository = {
        owner: path.dirname(tempDir),
        name: path.basename(tempDir),
        fullName: tempDir,
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: `file://${tempDir}`,
        cloneUrl: `file://${tempDir}`,
      };

      // Test Terraform only
      const terraformFiles = await service.findIacFilesInRepository(repository, {
        fileTypes: ['terraform'],
      });
      expect(terraformFiles).toHaveLength(2);
      expect(terraformFiles.every(f => f.type === 'terraform')).toBe(true);

      // Test Terragrunt only
      const terragruntFiles = await service.findIacFilesInRepository(repository, {
        fileTypes: ['terragrunt'],
      });
      expect(terragruntFiles).toHaveLength(1);
      expect(terragruntFiles.every(f => f.type === 'terragrunt')).toBe(true);
    });

    it('should skip common directories', async () => {
      // Create .git directory (should be skipped)
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir);
      fs.writeFileSync(path.join(gitDir, 'config.tf'), 'should be ignored');

      const repository = {
        owner: path.dirname(tempDir),
        name: path.basename(tempDir),
        fullName: tempDir,
        defaultBranch: 'main',
        archived: false,
        private: true,
        url: `file://${tempDir}`,
        cloneUrl: `file://${tempDir}`,
      };

      const files = await service.findIacFilesInRepository(repository);

      // Should not include files from .git directory
      const gitFiles = files.filter(f => f.path.startsWith('.git'));
      expect(gitFiles).toHaveLength(0);
    });
  });

  describe('getConcurrencyLimits', () => {
    it('should return correct concurrency limits', () => {
      const limits = (service as any).getConcurrencyLimits();
      expect(limits).toEqual({
        repos: 1, // Local filesystem only processes one directory at a time
        files: 5, // Configured max concurrent files (set in beforeEach)
      });
    });
  });
});
