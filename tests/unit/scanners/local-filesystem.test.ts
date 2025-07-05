import { LocalFilesystemScanner } from '../../../src/scanners/local-filesystem';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LocalFilesystemScanner', () => {
  let scanner: LocalFilesystemScanner;
  let tempDir: string;

  beforeEach(() => {
    scanner = new LocalFilesystemScanner({
      maxConcurrentFiles: 5,
    });

    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrawiz-scanner-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create a LocalFilesystemScanner instance', () => {
      expect(scanner).toBeInstanceOf(LocalFilesystemScanner);
    });

    it('should use default maxConcurrentFiles when not specified', () => {
      const defaultScanner = new LocalFilesystemScanner();
      expect(defaultScanner).toBeInstanceOf(LocalFilesystemScanner);
    });
  });

  describe('scanDirectory', () => {
    it('should scan directory and find IaC files', async () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'resource "aws_instance" "web" {}');
      fs.writeFileSync(path.join(tempDir, 'terragrunt.hcl'), 'terraform { source = "../modules" }');
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Documentation');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'terraform',
            path: 'main.tf',
            repository: path.basename(tempDir),
            content: 'resource "aws_instance" "web" {}',
          }),
          expect.objectContaining({
            type: 'terragrunt',
            path: 'terragrunt.hcl',
            repository: path.basename(tempDir),
            content: 'terraform { source = "../modules" }',
          }),
        ])
      );
    });

    it('should recursively scan subdirectories', async () => {
      // Create nested structure
      const subDir = path.join(tempDir, 'modules', 'vpc');
      fs.mkdirSync(subDir, { recursive: true });

      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'module "vpc" { source = "./modules/vpc" }');
      fs.writeFileSync(path.join(subDir, 'vpc.tf'), 'resource "aws_vpc" "main" {}');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'terraform',
            path: 'main.tf',
          }),
          expect.objectContaining({
            type: 'terraform',
            path: 'modules/vpc/vpc.tf',
          }),
        ])
      );
    });

    it('should filter by file types when specified', async () => {
      // Create both terraform and terragrunt files
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'resource "aws_instance" "web" {}');
      fs.writeFileSync(path.join(tempDir, 'terragrunt.hcl'), 'terraform { source = "../modules" }');

      // Scan only terraform files
      const terraformFiles = await scanner.scanDirectory(tempDir, {
        fileTypes: ['terraform'],
      });

      expect(terraformFiles).toHaveLength(1);
      expect(terraformFiles[0].type).toBe('terraform');

      // Scan only terragrunt files
      const terragruntFiles = await scanner.scanDirectory(tempDir, {
        fileTypes: ['terragrunt'],
      });

      expect(terragruntFiles).toHaveLength(1);
      expect(terragruntFiles[0].type).toBe('terragrunt');
    });

    it('should skip common directories', async () => {
      // Create directories that should be skipped
      const skipDirs = ['node_modules', '.git', '.terraform'];
      for (const dir of skipDirs) {
        const dirPath = path.join(tempDir, dir);
        fs.mkdirSync(dirPath);
        fs.writeFileSync(path.join(dirPath, 'main.tf'), 'resource "aws_instance" "web" {}');
      }

      // Create a file in the root that should be found
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'resource "aws_instance" "web" {}');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('main.tf');
    });

    it('should return empty array for directory with no IaC files', async () => {
      // Create non-IaC files
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Documentation');
      fs.writeFileSync(path.join(tempDir, 'script.sh'), '#!/bin/bash');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(0);
    });

    it('should throw error for non-existent directory', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent');

      await expect(scanner.scanDirectory(nonExistentPath)).rejects.toThrow(
        `Directory does not exist: ${nonExistentPath}`
      );
    });

    it('should throw error for file instead of directory', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      await expect(scanner.scanDirectory(filePath)).rejects.toThrow(
        `Path is not a directory: ${filePath}`
      );
    });

    it('should handle terraform lock files correctly', async () => {
      // Create terraform lock file
      fs.writeFileSync(path.join(tempDir, '.terraform.lock.hcl'), '# terraform lock file');
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'resource "aws_instance" "web" {}');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'terraform',
            path: '.terraform.lock.hcl',
          }),
          expect.objectContaining({
            type: 'terraform',
            path: 'main.tf',
          }),
        ])
      );
    });

    it('should handle symbolic links to files', async () => {
      const targetFile = path.join(tempDir, 'target.tf');
      const linkFile = path.join(tempDir, 'link.tf');

      fs.writeFileSync(targetFile, 'resource "aws_instance" "web" {}');
      fs.symlinkSync(targetFile, linkFile);

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.path === 'target.tf')).toBe(true);
      expect(files.some(f => f.path === 'link.tf')).toBe(true);
    });

    it('should skip broken symbolic links gracefully', async () => {
      const linkFile = path.join(tempDir, 'broken-link.tf');

      // Create a broken symlink
      fs.symlinkSync('/nonexistent/path', linkFile);
      fs.writeFileSync(path.join(tempDir, 'main.tf'), 'resource "aws_instance" "web" {}');

      const files = await scanner.scanDirectory(tempDir);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('main.tf');
    });

    it('should handle permission errors gracefully', async () => {
      const restrictedDir = path.join(tempDir, 'restricted');
      fs.mkdirSync(restrictedDir);
      fs.writeFileSync(path.join(restrictedDir, 'main.tf'), 'resource "aws_instance" "web" {}');

      // Make directory unreadable (if possible on this system)
      try {
        fs.chmodSync(restrictedDir, 0o000);

        // Should not throw, but should handle the error gracefully
        const files = await scanner.scanDirectory(tempDir);
        expect(Array.isArray(files)).toBe(true);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(restrictedDir, 0o755);
      }
    });
  });
});
