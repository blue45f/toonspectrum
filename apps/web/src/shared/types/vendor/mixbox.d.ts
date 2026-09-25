declare module "mixbox" {
  export type MixboxRgb = readonly [number, number, number];
  export type MixboxLatent = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  export interface MixboxApi {
    readonly LATENT_SIZE: 7;
    lerp(color1: readonly number[], color2: readonly number[], ratio: number): number[];
    lerpFloat(color1: readonly number[], color2: readonly number[], ratio: number): number[];
    lerpLinearFloat(color1: readonly number[], color2: readonly number[], ratio: number): number[];
    rgbToLatent(rgb: readonly number[]): number[];
    latentToRgb(latent: readonly number[]): number[];
    floatRgbToLatent(rgb: readonly number[]): number[];
    latentToFloatRgb(latent: readonly number[]): number[];
    linearFloatRgbToLatent(rgb: readonly number[]): number[];
    latentToLinearFloatRgb(latent: readonly number[]): number[];
    readonly glsl: string;
    readonly lutTexture: string;
  }

  const mixbox: MixboxApi;
  export default mixbox;
}
