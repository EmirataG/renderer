import { useState, useEffect, useRef } from 'react';
import { VerovioToolkit } from 'verovio/esm';
import { createToolkit } from '../lib/verovioService';

interface UseVerovioResult {
  svgString: string | null;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

export function useVerovio(
  xml: string,
  containerWidth: number,
  scale: number = 40
): UseVerovioResult {
  const [svgString, setSvgString] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toolkitRef = useRef<VerovioToolkit | null>(null);

  useEffect(() => {
    if (!xml || containerWidth <= 0) {
      setSvgString(null);
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

        toolkit.setOptions(
          JSON.stringify({
            pageWidth: (containerWidth * 100) / scale,
            pageHeight: 60000,
            adjustPageHeight: true,
            scale: scale,
            svgViewBox: true,
            svgRemoveXlink: true,
            breaks: 'auto',
            header: 'none',
            footer: 'none',
          })
        );

        const loaded = toolkit.loadData(xml);
        if (!loaded) {
          if (!cancelled) {
            setError('Failed to load MusicXML data');
            setSvgString(null);
            setIsLoading(false);
          }
          return;
        }

        const svg = toolkit.renderToSVG(1);
        // Must call renderToMIDI for timing queries to work later
        toolkit.renderToMIDI();

        if (!cancelled) {
          setSvgString(svg);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setSvgString(null);
          setIsLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [xml, containerWidth, scale]);

  return {
    svgString,
    toolkit: toolkitRef.current,
    isLoading,
    error,
  };
}
