declare module 'verovio/wasm' {
  export default function createVerovioModule(): Promise<any>;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: any);
    loadData(data: string): boolean;
    renderToSVG(pageNo?: number, xmlDeclaration?: boolean): string;
    renderToMIDI(): string;
    setOptions(options: Record<string, unknown> | string): boolean;
    getOptions(): string;
    getPageCount(): number;
    getTimeForElement(xmlId: string): number;
    getElementsAtTime(millisec: number): string;
    getTimesForElement(xmlId: string): string;
    getElementAttr(xmlId: string): string;
    getMIDIValuesForElement(xmlId: string): string;
    getMEI(jsonOptions?: string): string;
    loadZipDataBuffer(data: ArrayBuffer): boolean;
    loadZipDataBase64(data: string): boolean;
    getPageWithElement(xmlId: string): number;
    redoLayout(): void;
    renderToTimemap(options?: { includeMeasures?: boolean; includeRests?: boolean }): Array<{
      tstamp: number;
      qstamp: number;
      on?: string[];
      off?: string[];
      tempo?: number;
    }>;
    /**
     * Select a portion of the score for rendering.
     * @param selection - JSON object with measureRange
     * @returns boolean indicating success
     */
    select(selection: VerovioSelection): boolean;
  }

  export interface VerovioSelection {
    /** Measure range like "1-10", "20-end", or empty object to clear */
    measureRange?: string;
  }
}
