import { IaCModule } from '../parsers';

/**
 * Normalize a module source by removing version/ref parameters
 * This allows grouping of the same module regardless of version
 * @param source The module source string
 * @returns Normalized source without version parameters
 */
export function normalizeModuleSource(source: string): string {
  // Handle Terraform module sources with regex-based approach
  // since they're not standard URLs and may have special prefixes like git::

  let normalized = source;

  // Remove ref parameter and its value
  normalized = normalized.replace(/\?ref=[^&]*&/, '?'); // ?ref=value& -> ?
  normalized = normalized.replace(/\?ref=[^&]*$/, ''); // ?ref=value (at end) -> (empty)
  normalized = normalized.replace(/&ref=[^&]*/g, ''); // &ref=value -> (empty)

  // Remove version parameter and its value
  normalized = normalized.replace(/\?version=[^&]*&/, '?'); // ?version=value& -> ?
  normalized = normalized.replace(/\?version=[^&]*$/, ''); // ?version=value (at end) -> (empty)
  normalized = normalized.replace(/&version=[^&]*/g, ''); // &version=value -> (empty)

  // Clean up trailing ? or & characters
  normalized = normalized.replace(/[?&]+$/, '');

  return normalized;
}

/**
 * Create a summary grouped by normalized source
 * This groups all versions of the same module together
 * @param modules Array of IaC modules
 * @returns Summary with normalized sources as keys
 */
export function createNormalizedSummary(
  modules: IaCModule[]
): Record<string, { count: number; versions: Record<string, number>; sourceType: string }> {
  const summary: Record<string, { count: number; versions: Record<string, number>; sourceType: string }> = {};

  for (const module of modules) {
    const normalizedSource = normalizeModuleSource(module.source);

    if (!summary[normalizedSource]) {
      summary[normalizedSource] = {
        count: 0,
        versions: {},
        sourceType: module.sourceType,
      };
    }

    summary[normalizedSource].count++;

    if (module.version) {
      if (!summary[normalizedSource].versions[module.version]) {
        summary[normalizedSource].versions[module.version] = 0;
      }
      summary[normalizedSource].versions[module.version]++;
    }
  }

  return summary;
}
