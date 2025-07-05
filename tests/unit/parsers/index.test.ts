import * as parsers from '../../../src/parsers';

describe('Parsers Index', () => {
  it('should export all parser classes', () => {
    expect(parsers.TerraformParser).toBeDefined();
    expect(parsers.TerragruntParser).toBeDefined();
    expect(parsers.BaseParser).toBeDefined();
  });

  it('should export all parser types', () => {
    // These are TypeScript interfaces/types, not runtime values
    // Just verify they compile by using them in type assertions
    const module: parsers.IaCModule = {} as any;
    const sourceType: parsers.SourceType = 'local';
    expect(module).toBeDefined();
    expect(sourceType).toBeDefined();
  });
});
