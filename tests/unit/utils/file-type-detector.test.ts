import { getIacFileType, shouldIncludeFileByType } from '../../../src/utils/file-type-detector';
import { IacFileType } from '../../../src/types';

describe('File Type Detector', () => {
  describe('getIacFileType', () => {
    it('should identify terraform files', () => {
      expect(getIacFileType('main.tf')).toBe('terraform');
      expect(getIacFileType('variables.tf')).toBe('terraform');
      expect(getIacFileType('terraform.tfvars')).toBe('terraform');
      expect(getIacFileType('prod.tfvars')).toBe('terraform');
    });

    it('should identify terraform lock files', () => {
      expect(getIacFileType('.terraform.lock.hcl')).toBe('terraform');
      expect(getIacFileType('path/to/.terraform.lock.hcl')).toBe('terraform');
    });

    it('should identify terragrunt files', () => {
      expect(getIacFileType('terragrunt.hcl')).toBe('terragrunt');
      expect(getIacFileType('config.hcl')).toBe('terragrunt');
      expect(getIacFileType('path/to/terragrunt.hcl')).toBe('terragrunt');
    });

    it('should correctly identify terraform lock files', () => {
      expect(getIacFileType('.terraform.lock.hcl')).toBe('terraform');
      expect(getIacFileType('test.terraform.lock.hcl')).toBe(null); // Not exactly .terraform.lock.hcl, so not a lock file
    });

    it('should return null for non-IaC files', () => {
      expect(getIacFileType('README.md')).toBe(null);
      expect(getIacFileType('script.sh')).toBe(null);
      expect(getIacFileType('package.json')).toBe(null);
    });
  });

  describe('shouldIncludeFileByType', () => {
    it('should include all IaC files when no filter provided', () => {
      expect(shouldIncludeFileByType('main.tf')).toBe(true);
      expect(shouldIncludeFileByType('terragrunt.hcl')).toBe(true);
      expect(shouldIncludeFileByType('.terraform.lock.hcl')).toBe(true);
    });

    it('should exclude non-IaC files', () => {
      expect(shouldIncludeFileByType('README.md')).toBe(false);
      expect(shouldIncludeFileByType('script.js')).toBe(false);
    });

    it('should filter by allowed types', () => {
      expect(shouldIncludeFileByType('main.tf', ['terraform'])).toBe(true);
      expect(shouldIncludeFileByType('terragrunt.hcl', ['terraform'])).toBe(false);
      expect(shouldIncludeFileByType('terragrunt.hcl', ['terragrunt'])).toBe(true);
      expect(shouldIncludeFileByType('main.tf', ['terragrunt'])).toBe(false);
    });

    it('should include both types when both are allowed', () => {
      const allowedTypes: IacFileType[] = ['terraform', 'terragrunt'];
      expect(shouldIncludeFileByType('main.tf', allowedTypes)).toBe(true);
      expect(shouldIncludeFileByType('terragrunt.hcl', allowedTypes)).toBe(true);
      expect(shouldIncludeFileByType('.terraform.lock.hcl', allowedTypes)).toBe(true);
    });
  });
});
