/**
 * PixiJS-based single line score renderer.
 *
 * Renders score sections as GPU-accelerated WebGL sprites positioned horizontally.
 * This replaces SVG DOM rendering for smooth 60fps scrolling.
 *
 * Features:
 * - WebGL rendering via PixiJS v8
 * - Texture caching with automatic cleanup
 * - WebGL context loss/restore handling
 * - Horizontal sprite layout matching useSingleLineVerovio output
 *
 * @module PixiSingleLineRenderer
 */

import { Application, extend, useApplication } from '@pixi/react';
import { Container, Sprite } from 'pixi.js';
import { useEffect, useState } from 'react';
import { useSingleLineVerovio } from '../hooks/useSingleLineVerovio';
import {
  sectionsToTextures,
  clearTextureCache,
  TextureResult,
} from '../lib/svgToTexture';

// Register PixiJS components at module level for tree-shaking
// Must be called before using pixiContainer/pixiSprite in JSX
extend({ Container, Sprite });

// =============================================================================
// Props
// =============================================================================

interface Props {
  xml: string;
  scoreScale?: number; // Default 1
  musicFont?: string; // Default 'Bravura'
}

// =============================================================================
// ContextLossHandler
// =============================================================================

/**
 * Child component to handle WebGL context loss/restore events.
 *
 * Must be a child of Application because useApplication() hook only works
 * in components rendered inside the Application tree.
 *
 * Renders nothing - just registers event listeners on app.canvas.
 */
function ContextLossHandler(): null {
  const { app } = useApplication();

  useEffect(() => {
    const canvas = app.canvas;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[PixiRenderer] WebGL context lost');
    };

    const handleContextRestored = () => {
      console.log('[PixiRenderer] WebGL context restored');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [app]);

  return null;
}

// =============================================================================
// PixiSingleLineRenderer
// =============================================================================

/**
 * Main PixiJS renderer component for single-line score display.
 *
 * Converts Verovio SVG sections to GPU textures and displays them
 * as horizontally positioned sprites in a WebGL canvas.
 *
 * @param props.xml - MusicXML string to render
 * @param props.scoreScale - Scale factor (default 1, maps to verovioScale 40)
 * @param props.musicFont - Music font name (default 'Bravura')
 */
export default function PixiSingleLineRenderer({
  xml,
  scoreScale = 1,
  musicFont = 'Bravura',
}: Props) {
  // Convert scoreScale to Verovio scale (1 -> 40, 2 -> 80, etc.)
  const verovioScale = Math.round(40 * scoreScale);

  // Get sections and layout info from Verovio
  const { sections, sectionOffsets, totalWidth, maxHeight, isLoading } =
    useSingleLineVerovio(xml, verovioScale, 15, musicFont);

  // Texture state for rendered sections
  const [textures, setTextures] = useState<TextureResult[]>([]);

  // Convert sections to textures when they change
  useEffect(() => {
    if (sections.length === 0) return;

    let cancelled = false;

    sectionsToTextures(sections, verovioScale, musicFont).then((results) => {
      if (!cancelled) {
        setTextures(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sections, verovioScale, musicFont]);

  // Cleanup textures on unmount to free GPU memory
  useEffect(() => {
    return () => {
      clearTextureCache();
    };
  }, []);

  // Loading state
  if (isLoading || textures.length === 0) {
    return <div>Loading score...</div>;
  }

  return (
    <Application
      width={totalWidth}
      height={maxHeight}
      backgroundColor={0xffffff}
      backgroundAlpha={0}
    >
      <ContextLossHandler />
      <pixiContainer x={0} y={0}>
        {textures.map((result, index) => (
          <pixiSprite
            key={index}
            texture={result.texture}
            x={sectionOffsets[index]}
            y={0}
          />
        ))}
      </pixiContainer>
    </Application>
  );
}
