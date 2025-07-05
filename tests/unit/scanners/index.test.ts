import * as scanners from '../../../src/scanners';

describe('Scanners Index', () => {
  it('should export LocalFilesystemScanner', () => {
    expect(scanners.LocalFilesystemScanner).toBeDefined();
  });

  it('should be able to create scanner instance', () => {
    const scanner = new scanners.LocalFilesystemScanner();
    expect(scanner).toBeInstanceOf(scanners.LocalFilesystemScanner);
  });
});
