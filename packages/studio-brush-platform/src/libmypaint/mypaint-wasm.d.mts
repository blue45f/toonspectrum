/**
 * Node ESM declaration companion for the committed `mypaint-wasm.mjs` glue.
 * The canonical hand-written contract remains in mypaint-wasm.d.ts; this file
 * only teaches TypeScript's NodeNext-style `.mjs` lookup about that contract.
 */
import type {
  LibMypaintEmscriptenModule,
  LibMypaintModuleOverrides,
} from "./mypaint-wasm";

export type {
  LibMypaintEmscriptenModule,
  LibMypaintModuleOverrides,
} from "./mypaint-wasm";

declare function createLibMypaintModule(
  overrides?: LibMypaintModuleOverrides,
): Promise<LibMypaintEmscriptenModule>;

export default createLibMypaintModule;
