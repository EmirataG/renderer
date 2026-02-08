/**
 * SVG-to-Texture conversion module for PixiJS rendering.
 *
 * Converts Verovio SVG section strings into PixiJS GPU textures with:
 * - Color preprocessing for tint compatibility (black -> dark gray)
 * - Caching to prevent duplicate conversions
 * - Font loading verification
 *
 * @module svgToTexture
 */

import { Texture } from 'pixi.js';

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

const textureCache = new Map<string, Texture>();

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
function getCacheKey(svgString: string, scale: number, font: string): string {
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
 * 1. Apply color preprocessing for tint compatibility
 * 2. Create data URI from SVG string (using encodeURIComponent, not btoa)
 * 3. Load via HTMLImageElement with decode() Promise
 * 4. Create PixiJS Texture from loaded image
 *
 * @param svgString - The SVG string to convert
 * @returns Promise resolving to a PixiJS Texture
 *
 * @see https://github.com/pixijs/pixijs/discussions/10953 for data URI + decode pattern
 */
export async function svgToTexture(svgString: string): Promise<Texture> {
  // 1. Preprocess colors for tint compatibility
  const processedSvg = preprocessSvgForTint(svgString);

  // 2. Create data URI (encodeURIComponent handles Unicode correctly, unlike btoa)
  const dataUri = `data:image/svg+xml,${encodeURIComponent(processedSvg)}`;

  // 3. Create Image element and wait for decode
  const image = new Image();
  image.src = dataUri;

  // decode() is Promise-based, more reliable than onload callback
  await image.decode();

  // 4. Create PixiJS texture from loaded image
  return Texture.from(image);
}

// =============================================================================
// Cached conversion
// =============================================================================

/**
 * Get texture from cache or create new one.
 *
 * Checks the cache for an existing texture with the same content + settings.
 * If found, returns the cached texture. Otherwise, converts the SVG and
 * caches the result.
 *
 * @param svgString - The SVG string to convert
 * @param scale - The render scale (for cache key)
 * @param font - The music font name (for cache key)
 * @returns Promise resolving to a PixiJS Texture (cached or newly created)
 */
export async function getOrCreateTexture(
  svgString: string,
  scale: number,
  font: string
): Promise<Texture> {
  const key = getCacheKey(svgString, scale, font);

  // Check cache first
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  // Convert and cache
  const texture = await svgToTexture(svgString);
  textureCache.set(key, texture);
  return texture;
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
 * @returns Promise resolving to array of PixiJS Textures
 */
export async function sectionsToTextures(
  sections: string[],
  scale: number,
  font: string
): Promise<Texture[]> {
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
  for (const texture of textureCache.values()) {
    texture.destroy(true); // true = destroy base texture too
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
