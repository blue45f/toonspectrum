export * from "./descriptor";
export * from "./feature-contract";
export * from "./capability-gap-plan";
export * from "./workload-fingerprint";
export * from "./island-compiler";
export * from "./registry";
export * from "./planner";
export * from "./planner-cost-shadow";
export * from "./manifest";
export * from "./filter-providers";
export * from "./effect-compiler";
export * from "./benchmark-registry";
export * from "./tournament";
export * from "./wgsl-variants";
export * from "./wgsl-sandbox";
export * from "./wgsl-pipeline-cache";
// The WESL variant compiler imports `*.wesl?raw` sources and the ESM-only `wesl` package, so it
// only loads under Vite. Keeping it out of this barrel lets tsx-run tooling (the brush verifier,
// benchmarks, migration scripts) import brush modules that reach this package through
// `@toonspectrum/studio-brush-platform` — the static `wesl` import here was rejecting every one of
// them with ERR_PACKAGE_PATH_NOT_EXPORTED. Import it from
// "@toonspectrum/studio-engine-registry/wesl-compile" instead.
export * from "./external-filter-bridge";
// The renderer role ledger is documentation and test evidence, not runtime code. It stays out of
// this barrel so the Studio route bundle does not carry ~35 KiB of ledger notes; import it from
// "@toonspectrum/studio-engine-registry/renderer-roles" (tests, the doc generator, CI gates).
