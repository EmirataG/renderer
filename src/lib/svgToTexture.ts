/**
 * SVG-to-Texture conversion module for PixiJS rendering.
 *
 * Converts Verovio SVG section strings into PixiJS GPU textures with:
 * - Color preprocessing for tint compatibility (black -> dark gray)
 * - Caching to prevent duplicate conversions
 * - Font loading verification
 * - Texture size limit detection
 *
 * @module svgToTexture
 */

import { Texture } from 'pixi.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of SVG-to-texture conversion.
 *
 * Includes the texture plus metadata about dimensions and whether
 * the SVG exceeds GPU texture size limits.
 */
export interface TextureResult {
  texture: Texture;
  width: number;
  height: number;
  /** True if SVG dimensions exceed GPU max texture size */
  exceedsLimit: boolean;
}

// =============================================================================
// Texture size limits
// =============================================================================

/** Cached max texture size (queried once from WebGL) */
let maxTextureSize: number | null = null;

/**
 * Get the maximum texture size supported by the GPU.
 *
 * Queries WebGL for MAX_TEXTURE_SIZE and caches the result.
 * Falls back to 4096 if WebGL is unavailable (safe minimum for most GPUs).
 *
 * @param gl - Optional WebGL context to use (otherwise creates temporary canvas)
 * @returns Maximum texture dimension in pixels
 */
export function getMaxTextureSize(gl?: WebGLRenderingContext | null): number {
  if (maxTextureSize !== null) return maxTextureSize;

  // Try to get from passed context or create temporary canvas
  const context = gl ?? document.createElement('canvas').getContext('webgl');
  if (context) {
    maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number;
  } else {
    maxTextureSize = 4096; // Safe default for most hardware
  }
  return maxTextureSize;
}

/**
 * Reset the cached max texture size (for testing).
 * @internal
 */
export function resetMaxTextureSize(): void {
  maxTextureSize = null;
}

// =============================================================================
// SVG dimension extraction
// =============================================================================

/**
 * Extract width and height from an SVG string.
 *
 * Attempts to parse dimensions from:
 * 1. Explicit width/height attributes (e.g., width="500px" height="200")
 * 2. viewBox attribute (e.g., viewBox="0 0 500 200")
 *
 * @param svgString - The SVG string to parse
 * @returns Object with width and height (0,0 if parsing fails)
 */
export function extractSvgDimensions(svgString: string): { width: number; height: number } {
  // Match width="Npx" or width="N" (with or without px suffix)
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)(?:px)?"/);
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)(?:px)?"/);

  if (widthMatch && heightMatch) {
    return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) };
  }

  // Fall back to viewBox parsing
  const vbMatch = svgString.match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
  if (vbMatch) {
    return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  }

  return { width: 0, height: 0 };
}

// =============================================================================
// Regex patterns for color preprocessing (compiled once at module load)
// =============================================================================

// Match #000 not followed by additional hex chars (3-digit black)
const BLACK_3_DIGIT = /#000(?![0-9a-fA-F])/g;

// Match #000000 (6-digit black, case-insensitive)
const BLACK_6_DIGIT = /#000000/gi;

// Match rgb(0,0,0) with optional whitespace
const BLACK_RGB = /rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi;

// =============================================================================
// Texture cache
// =============================================================================

const textureCache = new Map<string, TextureResult>();

// =============================================================================
// Color preprocessing
// =============================================================================

/**
 * Preprocess SVG colors for PixiJS tint compatibility.
 *
 * PixiJS tint uses multiplicative blending: textureColor * tintColor = finalColor
 * Black (0x000000) * any color = 0x000000 (stays black, can't be tinted)
 * Dark gray (0x111111) * white = 0x111111 (can be tinted to any color)
 *
 * This function converts pure black (#000, #000000, rgb(0,0,0)) to dark gray
 * (#111, #111111, rgb(17,17,17)) so that tinting works correctly.
 *
 * @param svgString - The SVG string to preprocess
 * @returns SVG string with black colors replaced by dark gray
 *
 * @see https://github.com/pixijs/pixijs/issues/3004 for tint multiplication explanation
 */
export function preprocessSvgForTint(svgString: string): string {
  return svgString
    .replace(BLACK_3_DIGIT, '#111')
    .replace(BLACK_6_DIGIT, '#111111')
    .replace(BLACK_RGB, 'rgb(17,17,17)');
}

// =============================================================================
// Cache key generation
// =============================================================================

/**
 * Generate cache key from SVG content and render settings.
 *
 * Uses a content fingerprint (length + first/last 100 chars) combined with
 * scale and font settings to create a unique cache key. This is efficient
 * while avoiding hash collisions for real score content.
 *
 * @param svgString - The SVG string
 * @param scale - The render scale
 * @param font - The music font name
 * @returns A cache key string
 */
export function getCacheKey(svgString: string, scale: number, font: string): string {
  // Content fingerprint: length + first 100 chars + last 100 chars
  const fingerprint = `${svgString.length}_${svgString.slice(0, 100)}_${svgString.slice(-100)}`;
  return `${fingerprint}_${scale}_${font}`;
}

// =============================================================================
// Core conversion
// =============================================================================

/**
 * Convert SVG string to PixiJS Texture.
 *
 * Pipeline:
 * 1. Extract dimensions and check against GPU limits
 * 2. Apply color preprocessing for tint compatibility
 * 3. Create data URI from SVG string (using encodeURIComponent, not btoa)
 * 4. Load via HTMLImageElement with decode() Promise
 * 5. Create PixiJS Texture from loaded image
 *
 * @param svgString - The SVG string to convert
 * @returns Promise resolving to TextureResult with texture and metadata
 *
 * @see https://github.com/pixijs/pixijs/discussions/10953 for data URI + decode pattern
 */
export async function svgToTexture(svgString: string): Promise<TextureResult> {
  // 1. Extract dimensions and check against GPU limits
  const { width, height } = extractSvgDimensions(svgString);
  const maxSize = getMaxTextureSize();
  const exceedsLimit = width > maxSize || height > maxSize;

  // 2. Preprocess colors for tint compatibility
  const processedSvg = preprocessSvgForTint(svgString);

  // 3. Create data URI (encodeURIComponent handles Unicode correctly, unlike btoa)
  const dataUri = `data:image/svg+xml,${encodeURIComponent(processedSvg)}`;

  // 4. Create Image element and wait for decode
  const image = new Image();
  image.src = dataUri;

  // decode() is Promise-based, more reliable than onload callback
  await image.decode();

  // 5. Create PixiJS texture from loaded image
  const texture = Texture.from(image);

  return { texture, width, height, exceedsLimit };
}

// =============================================================================
// Cached conversion
// =============================================================================

/**
 * Get texture from cache or create new one.
 *
 * Checks the cache for an existing texture with the same content + settings.
 * If found, returns the cached result. Otherwise, converts the SVG and
 * caches the result.
 *
 * @param svgString - The SVG string to convert
 * @param scale - The render scale (for cache key)
 * @param font - The music font name (for cache key)
 * @returns Promise resolving to TextureResult (cached or newly created)
 */
export async function getOrCreateTexture(
  svgString: string,
  scale: number,
  font: string
): Promise<TextureResult> {
  const key = getCacheKey(svgString, scale, font);

  // Check cache first
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  // Convert and cache
  const result = await svgToTexture(svgString);
  textureCache.set(key, result);
  return result;
}

// =============================================================================
// Font loading
// =============================================================================

/**
 * Ensure all fonts are loaded before texture conversion.
 *
 * Verovio embeds SMuFL fonts as base64 in SVG by default (smuflTextFont: "embedded"),
 * so this is primarily a safety check. However, if external fonts are used,
 * this ensures they're ready before conversion.
 *
 * @returns Promise that resolves when all fonts are loaded
 */
export async function ensureFontsLoaded(): Promise<void> {
  await document.fonts.ready;
}

// =============================================================================
// Batch conversion
// =============================================================================

/**
 * Convert multiple SVG sections to textures with font loading verification.
 *
 * 1. Ensures all fonts are loaded first
 * 2. Converts all sections in parallel using getOrCreateTexture
 *
 * @param sections - Array of SVG strings to convert
 * @param scale - The render scale
 * @param font - The music font name
 * @returns Promise resolving to array of TextureResults
 */
export async function sectionsToTextures(
  sections: string[],
  scale: number,
  font: string
): Promise<TextureResult[]> {
  // Ensure fonts are ready before any conversion
  await ensureFontsLoaded();

  // Convert all sections in parallel (fonts are ready, safe to parallelize)
  return Promise.all(
    sections.map(svg => getOrCreateTexture(svg, scale, font))
  );
}

// =============================================================================
// Cache management
// =============================================================================

/**
 * Clear texture cache and destroy all cached textures.
 *
 * Call when unmounting renderer or changing scores to free GPU memory.
 * Properly destroys each texture including its base texture.
 */
export function clearTextureCache(): void {
  for (const result of textureCache.values()) {
    result.texture.destroy(true); // true = destroy base texture too
  }
  textureCache.clear();
}

/**
 * Get current texture cache size for debugging.
 *
 * @returns Number of textures currently in cache
 */
export function getTextureCacheSize(): number {
  return textureCache.size;
}
