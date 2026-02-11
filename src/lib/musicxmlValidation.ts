import { createToolkit } from './verovioService';

export interface MusicXMLValidationResult {
  valid: boolean;
  error?: string;
  measureCount?: number;
}

/**
 * Validate that a MusicXML string can be rendered by Verovio.
 * This catches files that are valid XML but not valid MusicXML,
 * or have elements Verovio cannot handle.
 */
export async function validateMusicXML(
  xmlContent: string
): Promise<MusicXMLValidationResult> {
  try {
    const toolkit = await createToolkit();
    const loaded = toolkit.loadData(xmlContent);

    if (!loaded) {
      return {
        valid: false,
        error:
          'Invalid MusicXML file. Please ensure it is a properly formatted MusicXML file.',
      };
    }

    // Render to verify it produces valid output
    const svg = toolkit.renderToSVG(1);
    if (!svg || svg.length === 0) {
      return {
        valid: false,
        error: 'MusicXML file contains elements that cannot be rendered.',
      };
    }

    // Get page count as a rough measure count proxy
    const pageCount = toolkit.getPageCount();

    return {
      valid: true,
      measureCount: pageCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: `Could not process MusicXML file: ${errorMessage}`,
    };
  }
}

// Validates MusicXML and MEI formats (both supported by Verovio)
/**
 * Quick validation that content appears to be MusicXML or MEI without full Verovio render.
 * Useful for pre-flight checks before the full validation.
 */
export function isLikelyMusicXML(content: string): boolean {
  const trimmed = content.trim();

  // MusicXML root elements
  const hasScorePartwise = trimmed.includes("<score-partwise");
  const hasScoreTimewise = trimmed.includes("<score-timewise");

  // MEI root element
  const hasMeiRoot = trimmed.includes("<mei");

  return hasScorePartwise || hasScoreTimewise || hasMeiRoot;
}
