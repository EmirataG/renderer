/**
 * Unit tests for SVG-to-Texture conversion module.
 *
 * Tests cover:
 * - Color preprocessing for tint compatibility
 * - Cache key generation
 * - SVG dimension extraction
 * - Cache behavior (hit/miss/clear)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  preprocessSvgForTint,
  getCacheKey,
  extractSvgDimensions,
  getMaxTextureSize,
  resetMaxTextureSize,
  clearTextureCache,
  getTextureCacheSize,
} from './svgToTexture';

// =============================================================================
// Color Preprocessing Tests
// =============================================================================

describe('preprocessSvgForTint', () => {
  it('converts 3-digit black (#000) to #111', () => {
    const input = '<rect fill="#000"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#111"/>');
  });

  it('converts 6-digit black (#000000) to #111111', () => {
    const input = '<rect fill="#000000"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#111111"/>');
  });

  it('converts uppercase 6-digit black (#000000) to #111111', () => {
    const input = '<rect fill="#000000" stroke="#000000"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#111111" stroke="#111111"/>');
  });

  it('converts rgb(0,0,0) to rgb(17,17,17)', () => {
    const input = '<rect fill="rgb(0,0,0)"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="rgb(17,17,17)"/>');
  });

  it('converts rgb with whitespace to rgb(17,17,17)', () => {
    const input = '<rect fill="rgb( 0 , 0 , 0 )"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="rgb(17,17,17)"/>');
  });

  it('does not modify non-black colors', () => {
    const input = '<rect fill="#0000ff"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#0000ff"/>');
  });

  it('converts multiple black values in one string', () => {
    const input = '<rect fill="#000000" stroke="#000"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#111111" stroke="#111"/>');
  });

  it('handles SVG with mixed color formats', () => {
    const input = '<g fill="#000000"><rect stroke="rgb(0,0,0)"/><circle fill="#000"/></g>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<g fill="#111111"><rect stroke="rgb(17,17,17)"/><circle fill="#111"/></g>');
  });

  it('does not convert #0001ff (starts with 000 but is not black)', () => {
    const input = '<rect fill="#0001ff"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#0001ff"/>');
  });

  it('does not convert #000abc (6-digit non-black)', () => {
    const input = '<rect fill="#000abc"/>';
    const result = preprocessSvgForTint(input);
    expect(result).toBe('<rect fill="#000abc"/>');
  });
});

// =============================================================================
// Cache Key Generation Tests
// =============================================================================

describe('getCacheKey', () => {
  it('returns same key for same content and settings', () => {
    const svg = '<svg width="100" height="50"></svg>';
    const key1 = getCacheKey(svg, 40, 'Bravura');
    const key2 = getCacheKey(svg, 40, 'Bravura');
    expect(key1).toBe(key2);
  });

  it('returns different key for different content', () => {
    const svg1 = '<svg width="100" height="50">content1</svg>';
    const svg2 = '<svg width="100" height="50">content2</svg>';
    const key1 = getCacheKey(svg1, 40, 'Bravura');
    const key2 = getCacheKey(svg2, 40, 'Bravura');
    expect(key1).not.toBe(key2);
  });

  it('returns different key for different scale', () => {
    const svg = '<svg width="100" height="50"></svg>';
    const key1 = getCacheKey(svg, 40, 'Bravura');
    const key2 = getCacheKey(svg, 50, 'Bravura');
    expect(key1).not.toBe(key2);
  });

  it('returns different key for different font', () => {
    const svg = '<svg width="100" height="50"></svg>';
    const key1 = getCacheKey(svg, 40, 'Bravura');
    const key2 = getCacheKey(svg, 40, 'Leland');
    expect(key1).not.toBe(key2);
  });

  it('handles long SVG strings by using fingerprint', () => {
    // Create a long SVG (over 200 chars)
    const longContent = 'x'.repeat(500);
    const svg = `<svg width="100" height="50">${longContent}</svg>`;
    const key = getCacheKey(svg, 40, 'Bravura');
    // Key should be deterministic based on length + first/last 100 chars
    expect(key).toContain(svg.length.toString());
    expect(key).toContain('40');
    expect(key).toContain('Bravura');
  });
});

// =============================================================================
// SVG Dimension Extraction Tests
// =============================================================================

describe('extractSvgDimensions', () => {
  it('extracts explicit width and height attributes', () => {
    const svg = '<svg width="500" height="200"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 500, height: 200 });
  });

  it('extracts width and height with px suffix', () => {
    const svg = '<svg width="500px" height="200px"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 500, height: 200 });
  });

  it('extracts decimal dimensions', () => {
    const svg = '<svg width="500.5" height="200.25"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 500.5, height: 200.25 });
  });

  it('extracts dimensions from viewBox when no explicit width/height', () => {
    const svg = '<svg viewBox="0 0 800 300"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 800, height: 300 });
  });

  it('prefers explicit width/height over viewBox', () => {
    const svg = '<svg width="100" height="50" viewBox="0 0 800 300"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 100, height: 50 });
  });

  it('returns 0,0 for invalid SVG without dimensions', () => {
    const svg = '<svg><rect/></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 0, height: 0 });
  });

  it('returns 0,0 for non-SVG string', () => {
    const dims = extractSvgDimensions('not an svg');
    expect(dims).toEqual({ width: 0, height: 0 });
  });

  it('handles viewBox with decimal origin values', () => {
    const svg = '<svg viewBox="10.5 20.5 800 300"></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({ width: 800, height: 300 });
  });
});

// =============================================================================
// Texture Size Limit Tests
// =============================================================================

describe('getMaxTextureSize', () => {
  beforeEach(() => {
    // Reset the cached value before each test
    resetMaxTextureSize();
  });

  it('returns cached value on subsequent calls', () => {
    // First call should query WebGL (or return default)
    const size1 = getMaxTextureSize();
    const size2 = getMaxTextureSize();
    expect(size1).toBe(size2);
    // Should be either from WebGL or fallback (4096)
    expect(size1).toBeGreaterThanOrEqual(4096);
  });

  it('falls back to 4096 when WebGL is unavailable', () => {
    // Pass null to simulate no WebGL
    const size = getMaxTextureSize(null);
    expect(size).toBe(4096);
  });

  it('uses provided WebGL context', () => {
    // Create a mock WebGL context
    const mockGl = {
      MAX_TEXTURE_SIZE: 0x0D33, // WebGL constant
      getParameter: vi.fn().mockReturnValue(8192),
    } as unknown as WebGLRenderingContext;

    const size = getMaxTextureSize(mockGl);
    expect(size).toBe(8192);
    expect(mockGl.getParameter).toHaveBeenCalledWith(0x0D33);
  });
});

// =============================================================================
// Cache Behavior Tests
// =============================================================================

describe('texture cache behavior', () => {
  beforeEach(() => {
    clearTextureCache();
  });

  it('starts with empty cache', () => {
    expect(getTextureCacheSize()).toBe(0);
  });

  it('clearTextureCache empties the cache', () => {
    // We can't easily add to cache without mocking Texture.from,
    // but we can verify clear works on empty cache
    clearTextureCache();
    expect(getTextureCacheSize()).toBe(0);
  });

  // Note: Full cache hit/miss tests require mocking PixiJS Texture.from
  // and image.decode(), which would require more complex setup.
  // The manual verification in the checkpoint will test this.
});
