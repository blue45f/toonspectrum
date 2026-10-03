/**
 * Ambient module shims for ONNX Runtime Web asset URLs and the bundled
 * U-2-Netp model asset. The packages ship their own types for code imports;
 * these declarations only cover the Vite `?url` asset form, mirroring the
 * opencascade.js / rhino3dm shims in this directory.
 */
declare module "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url" {
  const url: string;
  export default url;
}

declare module "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url" {
  const url: string;
  export default url;
}

declare module "*.onnx?url" {
  const url: string;
  export default url;
}
