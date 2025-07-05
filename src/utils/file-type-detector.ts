import { IacFileType } from '../types';

/**
 * Determines the IaC file type based on file path and name
 */
export function getIacFileType(filePath: string): IacFileType | null {
  const filename = filePath.split('/').pop() || '';

  // Terraform files
  if (filePath.endsWith('.tf') || filePath.endsWith('.tfvars')) {
    return 'terraform';
  }

  // Terraform lock files
  if (filename === '.terraform.lock.hcl') {
    return 'terraform';
  }

  // Terragrunt files (specific patterns only)
  if (
    filename === 'terragrunt.hcl' ||
    (filePath.endsWith('.hcl') && !filename.includes('.terraform.lock'))
  ) {
    return 'terragrunt';
  }

  return null;
}

/**
 * Checks if a file path should be included based on its type and filter options
 */
export function shouldIncludeFileByType(filePath: string, allowedTypes?: IacFileType[]): boolean {
  const fileType = getIacFileType(filePath);
  if (!fileType) {
    return false;
  }

  if (allowedTypes && allowedTypes.length > 0) {
    return allowedTypes.includes(fileType);
  }

  return true;
}
