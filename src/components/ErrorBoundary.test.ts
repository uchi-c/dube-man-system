import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from './ErrorBoundary';

describe('isChunkLoadError', () => {
  it('matches Vite/Rollup dynamic import failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://example.com/assets/Dashboard-B6Z9FykK.js'))).toBe(true);
  });

  it('matches Firefox\'s "error loading dynamically imported module" wording', () => {
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('matches Safari\'s "Importing a module script failed" wording', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true);
  });

  it('matches webpack\'s ChunkLoadError', () => {
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 42 failed'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isChunkLoadError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
  });

  it('does not match an unrelated render error', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });

  it('does not match a plain network fetch failure', () => {
    expect(isChunkLoadError(new Error('Failed to fetch'))).toBe(false);
  });

  it('handles an error with no message', () => {
    expect(isChunkLoadError(new Error())).toBe(false);
  });
});
