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
export * from "./wesl-compile";
export * from "./external-filter-bridge";
// The renderer role ledger is documentation and test evidence, not runtime code. It stays out of
// this barrel so the Studio route bundle does not carry ~35 KiB of ledger notes; import it from
// "@toonspectrum/studio-engine-registry/renderer-roles" (tests, the doc generator, CI gates).
