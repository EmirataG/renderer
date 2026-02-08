import { useState, useEffect, useRef } from 'react';
import { VerovioToolkit } from 'verovio/esm';
import { createToolkit } from '../lib/verovioService';

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

function extractPageHeight(svgString: string): number {
  const match = svgString.match(/height="(\d+(?:\.\d+)?)px"/);
  if (match) return parseFloat(match[1]);
  // Fallback: parse viewBox
  const vbMatch = svgString.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/);
  if (vbMatch) return parseFloat(vbMatch[1]);
  return 0;
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
        if (cancelled) return;

        toolkitRef.current = toolkit;

        const options = {
          font: font,  // Font name (Bravura, Petaluma, Leland, Gootville, Leipzig)
          fontLoadAll: true,  // Load all music fonts to enable runtime font switching
          pageWidth: (containerWidth * 100) / scale,
          pageHeight: 2970,
          scale: scale,
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
          pages.push(toolkit.renderToSVG(i));
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
