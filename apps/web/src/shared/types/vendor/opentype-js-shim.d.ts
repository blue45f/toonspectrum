declare module "opentype.js" {
  export interface OpentypePathCommand {
    readonly type: string;
    readonly x?: number;
    readonly y?: number;
    readonly x1?: number;
    readonly y1?: number;
    readonly x2?: number;
    readonly y2?: number;
  }

  export interface OpentypePath {
    readonly commands: readonly OpentypePathCommand[];
    toPathData(decimalPlaces?: number): string;
  }

  export interface OpentypeGlyph {
    readonly name?: string;
    readonly advanceWidth: number;
    getPath(x?: number, y?: number, fontSize?: number): OpentypePath;
  }

  export interface OpentypeFont {
    readonly names: Record<string, Record<string, string>>;
    getAdvanceWidth(text: string, fontSize: number): number;
    charToGlyph(char: string): OpentypeGlyph;
    getPath(text: string, x?: number, y?: number, fontSize?: number): OpentypePath;
  }

  export function load(url: string): Promise<OpentypeFont>;
  export function parse(buffer: ArrayBuffer): OpentypeFont;
}
