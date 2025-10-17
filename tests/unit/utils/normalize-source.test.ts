/**
 * Unit tests for normalize-source utility functions
 */

import { normalizeModuleSource, createNormalizedSummary } from '../../../src/utils/normalize-source';
import { IaCModule } from '../../../src/parsers';

describe('normalizeModuleSource', () => {
  describe('basic normalization', () => {
    it('should remove ref parameter from git sources', () => {
      const source = 'git::https://github.com/example/repo.git?ref=v1.0.0';
      const normalized = normalizeModuleSource(source);

      expect(normalized).toBe('git::https://github.com/example/repo.git');
    });

    it('should remove version parameter from registry sources', () => {
      const source = 'terraform-aws-modules/vpc/aws?version=3.0.0';
      const normalized = normalizeModuleSource(source);

      expect(normalized).toBe('terraform-aws-modules/vpc/aws');
    });

    it('should handle local sources without parameters', () => {
      const source = './modules/vpc';
      const normalized = normalizeModuleSource(source);

      expect(normalized).toBe('./modules/vpc');
    });

    it('should handle sources with multiple parameters', () => {
      const source = 'git::https://github.com/example/repo.git?ref=v1.0.0&other=value';
      const normalized = normalizeModuleSource(source);

      // ref should be removed, but other parameters are kept
      expect(normalized).toBe('git::https://github.com/example/repo.git?other=value');
    });

    it('should handle sources with only ?', () => {
      const source = 'git::https://github.com/example/repo.git?';
      const normalized = normalizeModuleSource(source);

      expect(normalized).toBe('git::https://github.com/example/repo.git');
    });
  });

  describe('real-world examples', () => {
    it('should normalize Azure DevOps git source with ref', () => {
      const source = 'git::git@ssh.dev.azure.com:v3/itsc-germany/Merlin/terraform-module-compute-instance-VMware?ref=v2.0';
      const normalized = normalizeModuleSource(source);

      expect(normalized).toBe('git::git@ssh.dev.azure.com:v3/itsc-germany/Merlin/terraform-module-compute-instance-VMware');
    });

    it('should handle multiple different refs consistently', () => {
      const source1 = 'git::git@ssh.dev.azure.com:v3/itsc-germany/Merlin/terraform-module-subnet-nsxt?ref=v1.0';
      const source2 = 'git::git@ssh.dev.azure.com:v3/itsc-germany/Merlin/terraform-module-subnet-nsxt?ref=v2.0';

      const normalized1 = normalizeModuleSource(source1);
      const normalized2 = normalizeModuleSource(source2);

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe('git::git@ssh.dev.azure.com:v3/itsc-germany/Merlin/terraform-module-subnet-nsxt');
    });
  });
});

describe('createNormalizedSummary', () => {
  it('should group modules with same normalized source but different versions', () => {
    const modules: IaCModule[] = [
      {
        name: 'vpc1',
        source: 'git::git@ssh.dev.azure.com:v3/org/repo/module?ref=v1.0',
        sourceType: 'git',
        version: 'v1.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 5,
        type: 'terraform',
      },
      {
        name: 'vpc2',
        source: 'git::git@ssh.dev.azure.com:v3/org/repo/module?ref=v2.0',
        sourceType: 'git',
        version: 'v2.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 10,
        type: 'terraform',
      },
    ];

    const summary = createNormalizedSummary(modules);

    const normalizedSource = 'git::git@ssh.dev.azure.com:v3/org/repo/module';
    expect(Object.keys(summary)).toContain(normalizedSource);
    expect(summary[normalizedSource].count).toBe(2);
    expect(summary[normalizedSource].versions).toEqual({
      'v1.0': 1,
      'v2.0': 1,
    });
  });

  it('should preserve source type in summary', () => {
    const modules: IaCModule[] = [
      {
        name: 'vpc',
        source: 'terraform-aws-modules/vpc/aws',
        sourceType: 'registry',
        version: '3.0.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 5,
        type: 'terraform',
      },
    ];

    const summary = createNormalizedSummary(modules);

    expect(summary['terraform-aws-modules/vpc/aws'].sourceType).toBe('registry');
  });

  it('should handle multiple different modules', () => {
    const modules: IaCModule[] = [
      {
        name: 'vpc',
        source: 'terraform-aws-modules/vpc/aws?version=3.0.0',
        sourceType: 'registry',
        version: '3.0.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 5,
        type: 'terraform',
      },
      {
        name: 'sg',
        source: 'terraform-aws-modules/security-group/aws?version=4.0.0',
        sourceType: 'registry',
        version: '4.0.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 10,
        type: 'terraform',
      },
      {
        name: 'vpc2',
        source: 'terraform-aws-modules/vpc/aws?version=4.0.0',
        sourceType: 'registry',
        version: '4.0.0',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 15,
        type: 'terraform',
      },
    ];

    const summary = createNormalizedSummary(modules);

    expect(Object.keys(summary)).toHaveLength(2);
    expect(summary['terraform-aws-modules/vpc/aws'].count).toBe(2);
    expect(summary['terraform-aws-modules/security-group/aws'].count).toBe(1);
  });

  it('should handle empty modules array', () => {
    const summary = createNormalizedSummary([]);

    expect(summary).toEqual({});
  });

  it('should count modules without versions', () => {
    const modules: IaCModule[] = [
      {
        name: 'local_module',
        source: './modules/vpc',
        sourceType: 'local',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 5,
        type: 'terraform',
      },
      {
        name: 'local_module2',
        source: './modules/vpc',
        sourceType: 'local',
        repository: 'repo1',
        filePath: 'main.tf',
        fileUrl: 'https://example.com/main.tf',
        lineNumber: 10,
        type: 'terraform',
      },
    ];

    const summary = createNormalizedSummary(modules);

    expect(summary['./modules/vpc'].count).toBe(2);
    expect(summary['./modules/vpc'].versions).toEqual({});
  });
});
