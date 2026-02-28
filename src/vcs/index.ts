/**
 * Barrel export for VCS services
 */

// Base VCS functionality
export * from './base';

// Platform implementations
export * from './github';
export * from './gitlab';
export * from './azure-devops';
export * from './bitbucket';

// Service factory
export * from './factory';
