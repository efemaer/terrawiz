/**
 * Unit tests for sortModulesBySource utility function
 */

import { sortModulesBySource } from '../../../src/utils/sort-modules';
import { IaCModule } from '../../../src/parsers';

describe('sortModulesBySource', () => {
  describe('basic sorting', () => {
    it('should sort modules by source name', () => {
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
        {
          name: 'security_group',
          source: 'terraform-aws-modules/security-group/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
        {
          name: 'local_module',
          source: './modules/compute',
          sourceType: 'local',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 15,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // Sources should be in alphabetical order
      expect(sorted[0].source).toBe('./modules/compute');
      expect(sorted[1].source).toBe('terraform-aws-modules/security-group/aws');
      expect(sorted[2].source).toBe('terraform-aws-modules/vpc/aws');
    });

    it('should group modules with the same source together', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc1',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'vpc2',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
        {
          name: 'security_group',
          source: 'terraform-aws-modules/security-group/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 15,
          type: 'terraform',
        },
        {
          name: 'vpc3',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.5.0',
          repository: 'repo2',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 20,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // Count consecutive vpc modules
      let vpcConsecutiveCount = 0;
      let inVpcSection = false;
      let vpcSectionStart = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].source === 'terraform-aws-modules/vpc/aws') {
          vpcConsecutiveCount++;
          if (!inVpcSection) {
            inVpcSection = true;
            vpcSectionStart = i;
          }
        } else if (inVpcSection) {
          // We've left the vpc section
          break;
        }
      }

      // All 3 vpc modules should be grouped together consecutively
      expect(vpcConsecutiveCount).toBe(3);
      
      // Verify all vpc modules are together at the start (security-group comes alphabetically first)
      for (let i = 0; i < 3; i++) {
        expect(sorted[vpcSectionStart + i].source).toBe('terraform-aws-modules/vpc/aws');
      }
      
      // Verify security-group comes before vpc (alphabetical order)
      const securityGroupSource = 'terraform-aws-modules/security-group/aws';
      const firstVpcIndex = sorted.findIndex(m => m.source === 'terraform-aws-modules/vpc/aws');
      const securityGroupIndex = sorted.findIndex(m => m.source === securityGroupSource);
      expect(securityGroupIndex).toBeLessThan(firstVpcIndex);
    });

    it('should sort same-source modules by version', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc1',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'vpc2',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '2.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
        {
          name: 'vpc3',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 15,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // All have same source, should sort by version (lexicographically)
      expect(sorted[0].version).toBe('2.0.0');
      expect(sorted[1].version).toBe('3.0.0');
      expect(sorted[2].version).toBe('4.0.0');
    });

    it('should handle modules without versions', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc1',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'local_module',
          source: './modules/compute',
          sourceType: 'local',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
        {
          name: 'vpc2',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 15,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // Should still sort correctly without errors
      expect(sorted).toHaveLength(3);
      expect(sorted[0].source).toBe('./modules/compute');
      expect(sorted[1].source).toBe('terraform-aws-modules/vpc/aws');
      expect(sorted[2].source).toBe('terraform-aws-modules/vpc/aws');
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const sorted = sortModulesBySource([]);

      expect(sorted).toEqual([]);
    });

    it('should handle single module', () => {
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

      const sorted = sortModulesBySource(modules);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toEqual(modules[0]);
    });

    it('should not mutate original array', () => {
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
        {
          name: 'security_group',
          source: 'terraform-aws-modules/security-group/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
      ];

      const originalOrder = modules.map(m => m.source);
      sortModulesBySource(modules);

      // Original should remain unchanged
      expect(modules.map(m => m.source)).toEqual(originalOrder);
    });
  });

  describe('multi-level sorting', () => {
    it('should sort by repository when sources and versions match', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo2',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // Both have same source and version, should sort by repository
      expect(sorted[0].repository).toBe('repo1');
      expect(sorted[1].repository).toBe('repo2');
    });

    it('should sort by file path when source, version, and repository match', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'vpc.tf',
          fileUrl: 'https://example.com/vpc.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 10,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // Same source, version and repo, should sort by file path
      expect(sorted[0].filePath).toBe('main.tf');
      expect(sorted[1].filePath).toBe('vpc.tf');
    });

    it('should sort by line number as final tiebreaker', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'main.tf',
          fileUrl: 'https://example.com/main.tf',
          lineNumber: 20,
          type: 'terraform',
        },
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

      const sorted = sortModulesBySource(modules);

      // Same source, version, repo, and file, should sort by line number
      expect(sorted[0].lineNumber).toBe(5);
      expect(sorted[1].lineNumber).toBe(20);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle a complex mix of sources and versions', () => {
      const modules: IaCModule[] = [
        {
          name: 'vpc_production',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '4.0.0',
          repository: 'infrastructure',
          filePath: 'prod.tf',
          fileUrl: 'https://example.com/prod.tf',
          lineNumber: 10,
          type: 'terraform',
        },
        {
          name: 'database',
          source: 'terraform-aws-modules/rds/aws',
          sourceType: 'registry',
          version: '5.0.0',
          repository: 'infrastructure',
          filePath: 'databases.tf',
          fileUrl: 'https://example.com/databases.tf',
          lineNumber: 15,
          type: 'terraform',
        },
        {
          name: 'vpc_staging',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.5.0',
          repository: 'infrastructure',
          filePath: 'staging.tf',
          fileUrl: 'https://example.com/staging.tf',
          lineNumber: 5,
          type: 'terraform',
        },
        {
          name: 'vpc_dev',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'dev-infra',
          filePath: 'dev.tf',
          fileUrl: 'https://example.com/dev.tf',
          lineNumber: 8,
          type: 'terraform',
        },
        {
          name: 'local_networking',
          source: './modules/networking',
          sourceType: 'local',
          repository: 'infrastructure',
          filePath: 'local_modules.tf',
          fileUrl: 'https://example.com/local_modules.tf',
          lineNumber: 3,
          type: 'terraform',
        },
      ];

      const sorted = sortModulesBySource(modules);

      // First, all local modules (alphabetically first)
      expect(sorted[0].source).toBe('./modules/networking');

      // Then, terraform-aws-modules/rds
      expect(sorted[1].source).toBe('terraform-aws-modules/rds/aws');

      // Then, all terraform-aws-modules/vpc (with different versions and repos)
      expect(sorted[2].source).toBe('terraform-aws-modules/vpc/aws');
      expect(sorted[3].source).toBe('terraform-aws-modules/vpc/aws');
      expect(sorted[4].source).toBe('terraform-aws-modules/vpc/aws');

      // Verify vpc modules are sorted by version
      const vpcModules = sorted.slice(2, 5);
      const versions = vpcModules.map(m => m.version);
      expect(versions).toEqual(['3.0.0', '3.5.0', '4.0.0']);
    });

    it('should preserve terraform and terragrunt mixed modules', () => {
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
        {
          name: 'vpc_tg',
          source: 'terraform-aws-modules/vpc/aws',
          sourceType: 'registry',
          version: '3.0.0',
          repository: 'repo1',
          filePath: 'terragrunt.hcl',
          fileUrl: 'https://example.com/terragrunt.hcl',
          lineNumber: 10,
          type: 'terragrunt',
        },
      ];

      const sorted = sortModulesBySource(modules);

      expect(sorted).toHaveLength(2);
      expect(sorted.some(m => m.type === 'terraform')).toBe(true);
      expect(sorted.some(m => m.type === 'terragrunt')).toBe(true);
    });
  });
});
