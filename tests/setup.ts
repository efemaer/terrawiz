/**
 * Jest setup file for test environment configuration
 */

// Set test timeout for longer API operations
jest.setTimeout(10000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';

// Suppress console.log in tests unless explicitly testing logging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Reset console mocks before each test
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  // Restore console methods after each test
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
(global as typeof global & { testUtils: unknown }).testUtils = {
  /**
   * Create a mock GitHub token for tests
   */
  getMockGitHubToken: () => 'github_test_token_123',

  /**
   * Create a mock environment setup
   */
  setupMockEnv: (overrides: Record<string, string> = {}) => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'github_test_token_123',
      NODE_ENV: 'test',
      ...overrides,
    };
    return () => {
      process.env = originalEnv;
    };
  },
};
