/**
 * Ambient module shims for opencascade.js Embind factory + wasm asset URL.
 * Package ships without TypeScript types.
 */
declare module "opencascade.js/dist/opencascade.wasm.js" {
  type OcctFactory = (config?: {
    wasmBinary?: ArrayBuffer | Uint8Array;
    locateFile?: (path: string, prefix?: string) => string;
  }) => Promise<Record<string, unknown>>;
  const factory: OcctFactory;
  export default factory;
}

declare module "opencascade.js/dist/opencascade.wasm.wasm?url" {
  const url: string;
  export default url;
}

declare module "opencascade.js/dist/opencascade.wasm.wasm" {
  const url: string;
  export default url;
}
