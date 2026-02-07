// No imports - using globals from vitest config

console.log('TEST FILE LOADED - describe:', typeof describe, 'it:', typeof it);

describe('Minimal Test', () => {
  console.log('INSIDE DESCRIBE BLOCK');
  it('should pass', () => {
    console.log('INSIDE IT BLOCK');
    expect(1 + 1).toBe(2);
  });
});
