/** Narrow declarations for audited, pinned JS releases. Not an assertion about future APIs. */
declare module "spectral.js" {
  class Color {
    constructor(value: string | number[]);
    readonly R: number[];
    readonly KS: number[];
    readonly sRGB: number[];
    readonly OKLab: number[];
    tintingStrength: number;
    toString(options?: { format?: "hex" | "rgb"; method?: "map" | "clip" }): string;
  }
  const spectral: {
    Color: typeof Color;
    mix(...colors: [Color, number][]): Color;
    palette(first: Color, second: Color, steps: number): Color[];
  };
  export default spectral;
}
declare module "colormix/dist/index.mjs" {
  class Color {
    constructor(value: string);
    getRed(): number;
    getGreen(): number;
    getBlue(): number;
    toString(mode?: "hex" | "rgb"): string;
  }
  const colorMix: {
    Color: typeof Color;
    mix(colors: Color[], percents: number[]): Color;
  };
  export default colorMix;
}
