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

/**
 * Quick validation that content appears to be MusicXML without full Verovio render
 * Useful for pre-flight checks before the full validation
 */
export function isLikelyMusicXML(content: string): boolean {
  // Check for common MusicXML markers
  const trimmed = content.trim();

  // Must start with XML declaration or root element
  const hasXmlDeclaration = trimmed.startsWith("<?xml");
  const hasScorePartwise = trimmed.includes("<score-partwise");
  const hasScoreTimewise = trimmed.includes("<score-timewise");

  // MusicXML must have one of these root elements
  return hasXmlDeclaration && (hasScorePartwise || hasScoreTimewise);
}
