import * as constants from '../../../src/constants';

describe('Constants', () => {
  it('should export concurrency defaults', () => {
    expect(constants.DEFAULT_REPO_CONCURRENCY).toBe(5);
    expect(constants.DEFAULT_FILE_CONCURRENCY).toBe(10);
  });

  it('should export retry configuration', () => {
    expect(constants.DEFAULT_MAX_RETRIES).toBe(3);
    expect(constants.MAX_BACKOFF_MS).toBe(10000);
    expect(constants.BASE_BACKOFF_MS).toBe(1000);
  });

  it('should export skip directories', () => {
    expect(Array.isArray(constants.SKIP_DIRECTORIES)).toBe(true);
    expect(constants.SKIP_DIRECTORIES).toContain('node_modules');
    expect(constants.SKIP_DIRECTORIES).toContain('.git');
    expect(constants.SKIP_DIRECTORIES).toContain('.terraform');
  });

  it('should export log levels', () => {
    expect(constants.LOG_LEVELS.DEBUG).toBe(3);
    expect(constants.LOG_LEVELS.INFO).toBe(2);
    expect(constants.LOG_LEVELS.WARN).toBe(1);
    expect(constants.LOG_LEVELS.ERROR).toBe(0);
  });
});
