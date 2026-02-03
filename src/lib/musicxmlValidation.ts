import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export interface MusicXMLValidationResult {
  valid: boolean;
  error?: string;
  measureCount?: number;
}

/**
 * Validate that a MusicXML string can be rendered by OSMD.
 * This catches files that are valid XML but not valid MusicXML,
 * or have elements OSMD cannot handle.
 */
export async function validateMusicXML(
  xmlContent: string
): Promise<MusicXMLValidationResult> {
  // Create a hidden container for OSMD validation
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "1000px";
  container.style.height = "1000px";
  container.style.visibility = "hidden";
  document.body.appendChild(container);

  let osmd: OpenSheetMusicDisplay | null = null;

  try {
    // Create OSMD instance with minimal options
    osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false,
      backend: "svg",
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
    });

    // Attempt to load the XML content
    await osmd.load(xmlContent);

    // Attempt to render (this catches issues OSMD can't handle)
    osmd.render();

    // Extract measure count from the rendered sheet
    const measureCount = countMeasures(osmd);

    return {
      valid: true,
      measureCount,
    };
  } catch (error) {
    // Categorize the error for user-friendly messages
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("parse") ||
      errorMessage.includes("XML") ||
      errorMessage.includes("Invalid")
    ) {
      return {
        valid: false,
        error:
          "File is not valid MusicXML. Please ensure it is a properly formatted MusicXML file.",
      };
    }

    if (
      errorMessage.includes("render") ||
      errorMessage.includes("element") ||
      errorMessage.includes("unsupported")
    ) {
      return {
        valid: false,
        error:
          "MusicXML file contains elements that cannot be rendered. Please simplify the score or use a different file.",
      };
    }

    // Generic error fallback
    return {
      valid: false,
      error: `Could not process MusicXML file: ${errorMessage}`,
    };
  } finally {
    // Clean up
    if (osmd) {
      osmd.clear();
    }
    document.body.removeChild(container);
  }
}

/**
 * Count measures from an OSMD instance after rendering
 */
function countMeasures(osmd: OpenSheetMusicDisplay): number {
  try {
    // Access the sheet's source measures
    const sheet = osmd.Sheet;
    if (sheet && sheet.SourceMeasures) {
      return sheet.SourceMeasures.length;
    }

    // Fallback: count from graphic sheet if available
    if (osmd.GraphicSheet && osmd.GraphicSheet.MeasureList) {
      return osmd.GraphicSheet.MeasureList.length;
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Quick validation that content appears to be MusicXML without full OSMD render
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
