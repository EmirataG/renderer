import { useState, useEffect, useRef } from 'react';
import { VerovioToolkit } from 'verovio/esm';
import { createToolkit } from '../lib/verovioService';

// Pre-compiled regex patterns (module scope) - compiled once at module load
const WIDTH_REGEX = /width="(\d+(?:\.\d+)?)px"/;
const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
const VIEWBOX_REGEX = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;
const MEASURE_REGEX = /<measure /g;

export interface UseSingleLineVerovioResult {
  sections: string[];           // Array of SVG strings, one per section
  sectionWidths: number[];      // Width of each section in pixels
  sectionHeights: number[];     // Height of each section in pixels
  sectionOffsets: number[];     // Cumulative X offset for each section (accounting for overlap clipping)
  sectionOverlapWidths: number[];  // Width of overlap region per section (0 for first section)
  totalWidth: number;           // Total visual width (accounting for clipped overlaps)
  maxHeight: number;            // Maximum section height for alignment
  sectionCount: number;         // Number of sections
  measureCount: number;         // Total measures in score
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

function extractSectionDimensions(svgString: string): { width: number; height: number } {
  // Try explicit width/height attributes first
  const widthMatch = svgString.match(WIDTH_REGEX);
  const heightMatch = svgString.match(HEIGHT_REGEX);
  if (widthMatch && heightMatch) {
    return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) };
  }
  // Fall back to viewBox
  const vbMatch = svgString.match(VIEWBOX_REGEX);
  if (vbMatch) {
    return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  }
  return { width: 0, height: 0 };
}

export function useSingleLineVerovio(
  xml: string,
  scale: number = 40,
  measuresPerSection: number = 15,
  font: string = 'Bravura',
  overlapMeasures: number = 1  // Number of measures to overlap between sections
): UseSingleLineVerovioResult {
  const [sections, setSections] = useState<string[]>([]);
  const [sectionWidths, setSectionWidths] = useState<number[]>([]);
  const [sectionHeights, setSectionHeights] = useState<number[]>([]);
  const [sectionOffsets, setSectionOffsets] = useState<number[]>([]);
  const [sectionOverlapWidths, setSectionOverlapWidths] = useState<number[]>([]);
  const [totalWidth, setTotalWidth] = useState<number>(0);
  const [maxHeight, setMaxHeight] = useState<number>(0);
  const [sectionCount, setSectionCount] = useState<number>(0);
  const [measureCount, setMeasureCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toolkitRef = useRef<VerovioToolkit | null>(null);

  useEffect(() => {
    if (!xml) {
      setSections([]);
      setSectionWidths([]);
      setSectionHeights([]);
      setSectionOffsets([]);
      setSectionOverlapWidths([]);
      setTotalWidth(0);
      setMaxHeight(0);
      setSectionCount(0);
      setMeasureCount(0);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function render() {
      console.log('[useSingleLineVerovio] Render starting with font:', font);
      setIsLoading(true);
      setError(null);

      try {
        const toolkit = await createToolkit();
        if (cancelled) return;

        toolkitRef.current = toolkit;

        // Verovio options for horizontal layout (single system, no breaks)
        const options = {
          font: font,  // Font name (Bravura, Petaluma, Leland, Gootville, Leipzig)
          fontLoadAll: true,           // Load all music fonts to enable runtime font switching
          breaks: 'none',              // Force single horizontal system
          pageWidth: 100000,           // Large width to prevent wrapping
          pageHeight: 100,             // Minimal height, adjustPageHeight expands
          adjustPageHeight: true,      // Expand to fit content
          scale: scale,
          pageMarginTop: 0,
          pageMarginBottom: 0,
          pageMarginLeft: 0,
          pageMarginRight: 0,
          svgViewBox: true,
          svgRemoveXlink: true,
          header: 'none',
          footer: 'none',
        };
        toolkit.setOptions(options);
        console.log('[useSingleLineVerovio] Options set, font:', font);

        const loaded = toolkit.loadData(xml);
        if (!loaded) {
          if (!cancelled) {
            setError('Failed to load MusicXML data');
            setSections([]);
            setSectionWidths([]);
            setSectionHeights([]);
            setSectionOffsets([]);
            setSectionOverlapWidths([]);
            setTotalWidth(0);
            setMaxHeight(0);
            setSectionCount(0);
            setMeasureCount(0);
            setIsLoading(false);
          }
          return;
        }

        // Must call renderToMIDI after loadData for timing queries to work
        toolkit.renderToMIDI();

        // Get measure count from MEI using pre-compiled regex
        const mei = toolkit.getMEI();
        const measureMatches = mei.match(MEASURE_REGEX);
        MEASURE_REGEX.lastIndex = 0; // Reset lastIndex for global regex reuse
        const totalMeasures = measureMatches ? measureMatches.length : 0;

        if (totalMeasures === 0) {
          if (!cancelled) {
            setSections([]);
            setSectionWidths([]);
            setSectionHeights([]);
            setSectionOffsets([]);
            setSectionOverlapWidths([]);
            setTotalWidth(0);
            setMaxHeight(0);
            setSectionCount(0);
            setMeasureCount(0);
            setIsLoading(false);
          }
          return;
        }

        // Section rendering loop with overlap for seamless boundaries
        const renderedSections: string[] = [];

        // First, compute nominal section start positions
        const sectionStarts: number[] = [];
        for (let start = 1; start <= totalMeasures; start += measuresPerSection) {
          sectionStarts.push(start);
        }

        // Render each section with overlap (extending backward for continuation sections)
        for (let sectionIdx = 0; sectionIdx < sectionStarts.length; sectionIdx++) {
          const nominalStart = sectionStarts[sectionIdx];
          const nominalEnd = Math.min(nominalStart + measuresPerSection - 1, totalMeasures);

          // For sections after the first, extend backward by overlapMeasures
          const renderStart = sectionIdx === 0 ? nominalStart : Math.max(1, nominalStart - overlapMeasures);
          const renderEnd = nominalEnd;

          toolkit.select({ measureRange: `${renderStart}-${renderEnd}` });
          toolkit.redoLayout();
          const svg = toolkit.renderToSVG(1); // Always page 1 after select
          renderedSections.push(svg);
        }

        // Clear selection for future operations
        toolkit.select({});
        toolkit.redoLayout();

        // Compute widths, heights, and offsets
        const dimensions = renderedSections.map(extractSectionDimensions);
        const widths = dimensions.map(d => d.width);
        const heights = dimensions.map(d => d.height);
        const maxH = Math.max(...heights);

        // Compute overlap widths (how much to clip from each section's left edge)
        const overlapWidths: number[] = [];
        for (let i = 0; i < renderedSections.length; i++) {
          if (i === 0) {
            // First section has no overlap
            overlapWidths.push(0);
          } else {
            // Estimate overlap width from the section's width and number of measures rendered
            // For section i: it renders (overlapMeasures + measuresPerSection) measures
            // The overlap portion is (overlapMeasures / total rendered measures) * width
            const nominalStart = sectionStarts[i];
            const renderStart = Math.max(1, nominalStart - overlapMeasures);
            const nominalEnd = Math.min(nominalStart + measuresPerSection - 1, totalMeasures);
            const totalRendered = nominalEnd - renderStart + 1;
            const overlapRatio = overlapMeasures / totalRendered;
            overlapWidths.push(widths[i] * overlapRatio);
          }
        }

        // Compute offsets accounting for overlap clipping
        // Visual width of each section is full width minus the overlap that gets clipped
        const offsets: number[] = [];
        let cumulative = 0;
        for (let i = 0; i < widths.length; i++) {
          offsets.push(cumulative);
          // Visual width is full width minus the overlap that gets clipped
          const visualWidth = widths[i] - overlapWidths[i];
          cumulative += visualWidth;
        }

        // Total visual width (accounting for clipped overlaps)
        const totalVisualWidth = cumulative;

        if (!cancelled) {
          setSections(renderedSections);
          setSectionWidths(widths);
          setSectionHeights(heights);
          setSectionOffsets(offsets);
          setSectionOverlapWidths(overlapWidths);
          setTotalWidth(totalVisualWidth);
          setMaxHeight(maxH);
          setSectionCount(renderedSections.length);
          setMeasureCount(totalMeasures);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setSections([]);
          setSectionWidths([]);
          setSectionHeights([]);
          setSectionOffsets([]);
          setSectionOverlapWidths([]);
          setTotalWidth(0);
          setMaxHeight(0);
          setSectionCount(0);
          setMeasureCount(0);
          setIsLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [xml, scale, measuresPerSection, font, overlapMeasures]);

  return {
    sections,
    sectionWidths,
    sectionHeights,
    sectionOffsets,
    sectionOverlapWidths,
    totalWidth,
    maxHeight,
    sectionCount,
    measureCount,
    toolkit: toolkitRef.current,
    isLoading,
    error,
  };
}
