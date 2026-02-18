import { useState, useEffect, useRef } from 'react';
import { VerovioToolkit } from 'verovio/esm';
import { createToolkit } from '../lib/verovioService';
import { reorderNoteheadsInSvgString } from '../lib/noteAnimation';

// Pre-compiled regex patterns (module scope) - compiled once at module load
const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
const VIEWBOX_HEIGHT_REGEX = /viewBox="0 0 [\d.]+ ([\d.]+)"/;

export interface UseVerovioResult {
  svgPages: string[];
  pageHeights: number[];
  pageOffsets: number[];
  totalHeight: number;
  pageCount: number;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

// Regex for viewBox with arbitrary x/y/w/h values (for trimming)
const VIEWBOX_REGEX = /viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/;

function extractPageHeight(svgString: string): number {
  const match = svgString.match(HEIGHT_REGEX);
  if (match) return parseFloat(match[1]);
  // Fallback: parse viewBox
  const vbMatch = svgString.match(VIEWBOX_HEIGHT_REGEX);
  if (vbMatch) return parseFloat(vbMatch[1]);
  return 0;
}

/**
 * Trim the top margin of a page SVG by adjusting the viewBox to start
 * at the first system's Y position. This removes Verovio's internal
 * "half staff space" padding above the first system on pages 2+,
 * making pages stack flush with no visible seam.
 *
 * Only applied to pages 2+ (first page keeps its natural top margin).
 */
function trimPageTopMargin(svgString: string): string {
  // Find the first <g class="system"> element's transform to detect top margin
  // Verovio system elements have transform="translate(X, Y)" where Y is the top margin
  const systemMatch = svgString.match(
    /<g\s+class="system"[^>]*transform="translate\(([\d.]+),\s*([\d.]+)\)"/
  );
  if (!systemMatch) return svgString;

  const systemY = parseFloat(systemMatch[2]);
  if (systemY <= 0) return svgString;

  // Adjust viewBox to start at systemY (removing top margin)
  const vbMatch = svgString.match(VIEWBOX_REGEX);
  if (!vbMatch) return svgString;

  const vbX = parseFloat(vbMatch[1]);
  const vbY = parseFloat(vbMatch[2]);
  const vbW = parseFloat(vbMatch[3]);
  const vbH = parseFloat(vbMatch[4]);

  const newVbY = vbY + systemY;
  const newVbH = vbH - systemY;

  return svgString
    .replace(VIEWBOX_REGEX, `viewBox="${vbX} ${newVbY} ${vbW} ${newVbH}"`)
    .replace(HEIGHT_REGEX, `height="${newVbH}px"`);
}

export function useVerovio(
  xml: string,
  containerWidth: number,
  scale: number = 40,
  font: string = 'Bravura'
): UseVerovioResult {
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const [pageOffsets, setPageOffsets] = useState<number[]>([]);
  const [totalHeight, setTotalHeight] = useState<number>(0);
  const [pageCount, setPageCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toolkitRef = useRef<VerovioToolkit | null>(null);

  useEffect(() => {
    if (!xml || containerWidth <= 0) {
      setSvgPages([]);
      setPageHeights([]);
      setPageOffsets([]);
      setTotalHeight(0);
      setPageCount(0);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function render() {
      setIsLoading(true);
      setError(null);

      try {
        const toolkit = await createToolkit();
        if (cancelled) {
          (toolkit as any).destroy?.();
          return;
        }

        toolkitRef.current = toolkit;

        const options = {
          font: font,  // Font name (Bravura, Petaluma, Leland, Gootville, Leipzig)
          pageWidth: (containerWidth * 100) / scale,
          pageHeight: 2970,
          scale: scale,
          adjustPageHeight: true,  // Shrink pages to actual content height (no fixed A4 gaps)
          pageMarginTop: 0,
          pageMarginBottom: 0,
          svgViewBox: true,
          svgRemoveXlink: true,
          breaks: 'auto',
          header: 'none',
          footer: 'none',
        };
        toolkit.setOptions(options);

        const loaded = toolkit.loadData(xml);
        if (!loaded) {
          if (!cancelled) {
            setError('Failed to load MusicXML data');
            setSvgPages([]);
            setPageHeights([]);
            setPageOffsets([]);
            setTotalHeight(0);
            setPageCount(0);
            setIsLoading(false);
          }
          return;
        }

        // Must call renderToMIDI after loadData for timing queries to work
        toolkit.renderToMIDI();

        const count = toolkit.getPageCount();
        const pages: string[] = [];
        for (let i = 1; i <= count; i++) {
          let svg = toolkit.renderToSVG(i);
          // Trim top margin for pages 2+ (first page keeps its natural top margin)
          // This removes Verovio's internal padding above the first system,
          // creating seamless stacking between adjacent pages.
          if (i > 1) {
            svg = trimPageTopMargin(svg);
          }
          // Reorder noteheads above stems in the SVG string so the correct
          // paint order survives React re-renders via dangerouslySetInnerHTML.
          svg = reorderNoteheadsInSvgString(svg);
          pages.push(svg);
        }

        const heights = pages.map(extractPageHeight);
        const offsets: number[] = [];
        let cumulative = 0;
        for (const h of heights) {
          offsets.push(cumulative);
          cumulative += h;
        }

        if (!cancelled) {
          setSvgPages(pages);
          setPageHeights(heights);
          setPageOffsets(offsets);
          setTotalHeight(cumulative);
          setPageCount(count);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setSvgPages([]);
          setPageHeights([]);
          setPageOffsets([]);
          setTotalHeight(0);
          setPageCount(0);
          setIsLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (toolkitRef.current) {
        (toolkitRef.current as any).destroy?.();
        toolkitRef.current = null;
      }
    };
  }, [xml, containerWidth, scale, font]);

  return {
    svgPages,
    pageHeights,
    pageOffsets,
    totalHeight,
    pageCount,
    toolkit: toolkitRef.current,
    isLoading,
    error,
  };
}
