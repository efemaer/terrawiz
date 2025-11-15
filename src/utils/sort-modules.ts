import { IaCModule } from '../parsers';

/**
 * Sort modules by source name to group modules with the same source together.
 * Modules with versions are sorted before modules without versions.
 * @param modules Array of IaC modules to sort
 * @returns Sorted array with modules grouped by source name, version (modules with versions first), repository, file path, and line number
 */
export function sortModulesBySource(modules: IaCModule[]): IaCModule[] {
  return [...modules].sort((a, b) => {
    // Primary sort: by source name
    const sourceComparison = a.source.localeCompare(b.source);
    if (sourceComparison !== 0) {
      return sourceComparison;
    }

    // Secondary sort: by version (if both have versions)
    if (a.version && b.version) {
      const versionComparison = a.version.localeCompare(b.version);
      if (versionComparison !== 0) {
        return versionComparison;
      }
    } else if (a.version && !b.version) {
      return -1; // Module with version comes before module without
    } else if (!a.version && b.version) {
      return 1; // Module without version comes after module with
    }

    // Tertiary sort: by repository name
    const repoComparison = a.repository.localeCompare(b.repository);
    if (repoComparison !== 0) {
      return repoComparison;
    }

    // Quaternary sort: by file path
    const fileComparison = a.filePath.localeCompare(b.filePath);
    if (fileComparison !== 0) {
      return fileComparison;
    }

    // Final sort: by line number
    return a.lineNumber - b.lineNumber;
  });
}
