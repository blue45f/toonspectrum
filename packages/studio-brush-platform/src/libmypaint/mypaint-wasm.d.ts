/**
 * Hand-written declarations for the emcc-generated glue `mypaint-wasm.mjs`
 * (ADR-0011 lane 11; rebuilt by bridge/build.sh — regenerate INTEGRITY.sha256
 * after any rebuild). Only the surface the loader in ./index.ts consumes is
 * declared; everything else on the emscripten Module object is deliberately
 * out of contract.
 */

export interface LibMypaintEmscriptenModule {
  cwrap(
    name: string,
    returnType: "number",
    argTypes: ReadonlyArray<"number" | "string">,
  ): (...args: Array<number | string>) => number;
  cwrap(
    name: string,
    returnType: null,
    argTypes: ReadonlyArray<"number" | "string">,
  ): (...args: Array<number | string>) => void;
  UTF8ToString(pointer: number): string;
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
}

export interface LibMypaintModuleOverrides {
  instantiateWasm?(
    imports: WebAssembly.Imports,
    receiveInstance: (
      instance: WebAssembly.Instance,
      module?: WebAssembly.Module,
    ) => void,
  ): void;
  locateFile?(path: string, scriptDirectory: string): string;
}

declare function createLibMypaintModule(
  overrides?: LibMypaintModuleOverrides,
): Promise<LibMypaintEmscriptenModule>;

export default createLibMypaintModule;
