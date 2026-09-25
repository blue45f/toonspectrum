// Vite 8.0.16 can leave React Compiler's named `c` import pointed at a
// default-only CommonJS prebundle when the import was injected into another
// optimized dependency. apps/web/vite.config.ts aliases this module only during serve;
// production builds continue to consume React's official runtime directly.
import runtime from "@toonspectrum/react-compiler-runtime-cjs";

export const c = runtime.c;
