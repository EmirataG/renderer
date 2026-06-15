import { createToolkit } from './verovioService';

interface MusicXMLValidationResult {
  valid: boolean;
  error?: string;
  measureCount?: number;
  /** For MXL files, the extracted XML string after decompression. */
  xml?: string;
}

/**
 * Check whether a filename has the .mxl extension (compressed MusicXML).
 */
export function isMxlFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.mxl');
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
 * Validate a compressed MXL file (ZIP containing MusicXML).
 * Uses Verovio's native loadZipDataBuffer, then extracts the MEI XML
 * so the rest of the pipeline can work with a plain string.
 */
export async function validateMxl(
  buffer: ArrayBuffer
): Promise<MusicXMLValidationResult> {
  try {
    const toolkit = await createToolkit();
    const loaded = toolkit.loadZipDataBuffer(buffer);

    if (!loaded) {
      return {
        valid: false,
        error:
          'Invalid MXL file. The compressed archive could not be read.',
      };
    }

    // Extract the loaded score as MEI XML so the rest of the pipeline
    // can work with a plain XML string.
    const xml = toolkit.getMEI();
    if (!xml) {
      return {
        valid: false,
        error: 'MXL file does not contain a valid score.',
      };
    }

    // Render to verify it produces valid output
    const svg = toolkit.renderToSVG(1);
    if (!svg || svg.length === 0) {
      return {
        valid: false,
        error: 'MXL file contains elements that cannot be rendered.',
      };
    }

    const pageCount = toolkit.getPageCount();

    return {
      valid: true,
      measureCount: pageCount,
      xml,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: `Could not process MXL file: ${errorMessage}`,
    };
  }
}

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
