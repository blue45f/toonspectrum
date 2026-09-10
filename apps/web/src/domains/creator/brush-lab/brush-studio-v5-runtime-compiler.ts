import { optimizeBrushQualityPolicy } from "./brush-studio-v5-quality-analysis";
import {
  PHYSICS_PROVIDER,
  type BrushPhysicsId,
  type BrushProviderId,
  type BrushQualityPolicy,
} from "./brush-studio-v5-quality-types";
import {
  BRUSH_RUNTIME_PROVIDER_EVIDENCE,
  BRUSH_STUDIO_V5_RUNTIME_SCHEMA_VERSION,
  brushRuntimeProviderEvidence,
  type BrushRuntimeActiveTileMode,
  type BrushRuntimeAuthority,
  type BrushRuntimeAuthorityBinding,
  type BrushRuntimeBenchmarkReceipt,
  type BrushRuntimeCapabilities,
  type BrushRuntimeCertification,
  type BrushRuntimeCompileOptions,
  type BrushRuntimeFieldDescriptor,
  type BrushRuntimeFieldFormat,
  type BrushRuntimeFieldId,
  type BrushRuntimeFusedPassGroup,
  type BrushRuntimeGate,
  type BrushRuntimePass,
  type BrushRuntimePhase,
  type BrushRuntimeProgram,
  type BrushRuntimeProviderEvidence,
  type BrushRuntimeProviderReadiness,
  type BrushRuntimeTilePlan,
} from "./brush-studio-v5-runtime-types";

const PRODUCT_READY = new Set<BrushRuntimeProviderReadiness>(["wired-product", "wired-conditional"]);
const FORMAT_BYTES: Readonly<Record<BrushRuntimeFieldFormat, number>> = Object.freeze({
  "sample-struct-v3": 64, "path-frame-v1": 48, "contact-struct-v2": 40,
  "bristle-struct-v1": 80, "particle-struct-v1": 48, r8unorm: 1,
  r16float: 2, rg16float: 4, rgba8unorm: 4, rgba16float: 8,
  rgba32float: 16, r32uint: 4, "json-receipt": 1,
});
const PIGMENT_PROVIDER: Readonly<Record<BrushQualityPolicy["pigment"]["provider"], BrushProviderId | null>> = Object.freeze({
  rgb: null, spectral: "spectral", "open-km": "open-km",
  "pigment-painter": "pigment-painter", mixbox: "mixbox",
  "inkwash-density": "inkwash",
});

type FieldSeed = Omit<BrushRuntimeFieldDescriptor, "scale" | "layers" | "pingPong" | "bytesPerElement" | "haloPx" | "activeTileMode" | "canonical" | "estimatedBytes"> & Partial<Pick<BrushRuntimeFieldDescriptor, "scale" | "layers" | "pingPong" | "haloPx" | "activeTileMode" | "canonical">> & { readonly elements?: number };
type PassSeed = Omit<BrushRuntimePass, "reads" | "writes" | "dependsOn" | "repeat" | "fusionKey" | "activeTileMode" | "haloPx" | "acceptsPredicted" | "implementationPath"> & Partial<Pick<BrushRuntimePass, "reads" | "writes" | "repeat" | "fusionKey" | "activeTileMode" | "haloPx" | "acceptsPredicted">>;
interface Graph { fields: Map<BrushRuntimeFieldId, BrushRuntimeFieldDescriptor>; passes: BrushRuntimePass[]; writers: Map<BrushRuntimeFieldId, string> }

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const unique = <T,>(items: readonly T[]): readonly T[] => Object.freeze([...new Set(items)]);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
}
function hash(value: unknown): string {
  const text = JSON.stringify(stable(value)); let result = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { result ^= text.charCodeAt(index); result = Math.imul(result, 0x01000193); }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function brushRuntimeCapabilityFingerprint(capabilities: BrushRuntimeCapabilities): string {
  const { scannedAt: _ignored, ...stableCapabilities } = capabilities;
  return hash(stableCapabilities);
}
export function createUnknownBrushRuntimeCapabilities(): BrushRuntimeCapabilities {
  return Object.freeze({ scannedAt: new Date(0).toISOString(), secureContext: false,
    webgpu: false, webgpuAdapter: false, webgpuTimestampQuery: false, webgl2: false,
    offscreenCanvas: false, sharedArrayBuffer: false, crossOriginIsolated: false,
    pointerRawUpdate: false, coalescedEvents: false, predictedEvents: false,
    hover: false, hardwareConcurrency: 1, deviceMemoryGb: null });
}
export function createCertifiedBrushRuntimeCapabilities(overrides: Partial<BrushRuntimeCapabilities> = {}): BrushRuntimeCapabilities {
  return Object.freeze({ scannedAt: "2026-09-09T00:00:00.000Z", secureContext: true,
    webgpu: true, webgpuAdapter: true, webgpuTimestampQuery: true, webgl2: true,
    offscreenCanvas: true, sharedArrayBuffer: true, crossOriginIsolated: true,
    pointerRawUpdate: true, coalescedEvents: true, predictedEvents: true,
    hover: true, hardwareConcurrency: 8, deviceMemoryGb: 8, ...overrides });
}

function providerIds(policy: BrushQualityPolicy): readonly BrushProviderId[] {
  const ids = new Set<BrushProviderId>(policy.providers); ids.add("native-webgpu");
  for (const physics of policy.simulation.physics) ids.add(PHYSICS_PROVIDER[physics]);
  const pigment = PIGMENT_PROVIDER[policy.pigment.provider]; if (pigment) ids.add(pigment);
  if (policy.pattern.grammar === "flow-field") ids.add("p5-brush");
  if (policy.pattern.grammar === "along-path" && policy.pattern.motif === "hatch") ids.add("krita-hatching");
  return Object.freeze([...ids]);
}
function choose(ids: readonly BrushProviderId[], authority: BrushRuntimeAuthority, fallback: BrushProviderId): BrushProviderId {
  const rank: Readonly<Record<BrushRuntimeProviderReadiness, number>> = Object.freeze({ "wired-product": 5, "wired-conditional": 4, "bridge-ready": 3, "descriptor-only": 2, "reference-only": 1 });
  return ids.map(brushRuntimeProviderEvidence).filter((item) => item.authorities.includes(authority)).sort((a, b) => rank[b.readiness] - rank[a.readiness])[0]?.id ?? fallback;
}
function authorityBindings(policy: BrushQualityPolicy, ids: readonly BrushProviderId[]): readonly BrushRuntimeAuthorityBinding[] {
  const wet = policy.simulation.physics.includes("wet-flow") || policy.pigment.provider === "inkwash-density";
  const values: BrushRuntimeAuthorityBinding[] = [
    { authority: "input", provider: "browser", reason: "Accepted PointerEvent stream only; predictions are disposable." },
    { authority: "motion", provider: choose(ids, "motion", "native-webgpu"), reason: "One motion authority." },
    { authority: "carrier", provider: choose(ids, "carrier", "native-webgpu"), reason: "One stroke carrier." },
    { authority: "surface", provider: choose(ids, "surface", "native-webgpu"), reason: "Document-space paper fields." },
    { authority: "deposition", provider: wet ? "inkwash" : choose(ids, "deposition", "native-webgpu"), reason: wet ? "Inkwash owns wet deposition." : "One deposition kernel." },
    { authority: "wet", provider: wet ? "inkwash" : "native-webgpu", reason: wet ? "Inkwash owns mobile/fixed pigment and wetness." : "No persistent wet solver." },
    { authority: "pickup", provider: choose(ids, "pickup", "native-webgpu"), reason: "One pickup reservoir." },
    { authority: "pigment", provider: PIGMENT_PROVIDER[policy.pigment.provider] ?? "native-webgpu", reason: `Pigment model: ${policy.pigment.provider}.` },
    { authority: "pattern", provider: policy.pattern.grammar === "flow-field" ? "p5-brush" : choose(ids, "pattern", "native-webgpu"), reason: "One pattern phase owner." },
    { authority: "height", provider: choose(ids, "height", "native-webgpu"), reason: "One height field owner." },
    { authority: "output", provider: "native-webgpu", reason: "Canonical tile commit and raster receipt." },
  ];
  return Object.freeze(values.map((value) => Object.freeze(value)));
}
const owner = (bindings: readonly BrushRuntimeAuthorityBinding[], authority: BrushRuntimeAuthority): BrushProviderId | "browser" => bindings.find((item) => item.authority === authority)?.provider ?? "native-webgpu";

function tilePlan(policy: BrushQualityPolicy, requested?: number): BrushRuntimeTilePlan {
  const base = policy.goal === "responsive" ? 40 : policy.goal === "balanced" ? 64 : policy.goal === "material" ? 96 : 128;
  const factor = policy.device === "desktop-pen" ? 1 : policy.device === "tablet-pen" ? 0.78 : 0.68;
  const count = Math.round(clamp(requested ?? base * factor, 8, 256));
  return Object.freeze({ tileSize: policy.output.tileSize, activeTileCount: count,
    liveTileLimit: Math.min(count, policy.goal === "responsive" ? 32 : 64),
    settleTileLimit: Math.min(count, policy.goal === "cinematic" ? 128 : 96),
    maxHaloPx: 0, atlasMemoryMb: 0,
    scheduling: Object.freeze(["dirty live tiles", "visible wet tiles", "offscreen settle within budget", "receipt-backed LRU eviction"]) });
}
const activeTiles = (mode: BrushRuntimeActiveTileMode, plan: BrushRuntimeTilePlan) => mode === "none" ? 1 : Math.max(1, Math.ceil(plan.activeTileCount * (mode === "dirty" ? 0.45 : mode === "wet" ? 0.7 : mode === "occupied" ? 0.58 : mode === "settling" ? 0.82 : 1)));
function field(graph: Graph, plan: BrushRuntimeTilePlan, seed: FieldSeed): void {
  if (graph.fields.has(seed.id)) return;
  const scale = clamp(seed.scale ?? 1, 0.0625, 4), layers = Math.max(1, Math.round(seed.layers ?? 1)), pingPong = seed.pingPong ?? false;
  const mode = seed.activeTileMode ?? "none", side = Math.ceil(plan.tileSize * scale), elements = seed.elements ?? side * side * activeTiles(mode, plan);
  graph.fields.set(seed.id, Object.freeze({ ...seed, scale, layers, pingPong,
    bytesPerElement: FORMAT_BYTES[seed.format], haloPx: Math.max(0, Math.round(seed.haloPx ?? 0)),
    activeTileMode: mode, canonical: seed.canonical ?? true,
    ...(seed.kind === "buffer" ? { elementsPerTile: elements } : {}),
    estimatedBytes: seed.kind === "receipt" ? 4096 : Math.ceil(elements * FORMAT_BYTES[seed.format] * layers * (pingPong ? 2 : 1)) }));
}
function pass(graph: Graph, seed: PassSeed): void {
  const reads = unique(seed.reads ?? []), writes = unique(seed.writes ?? []);
  const evidence = seed.provider === "browser" ? null : brushRuntimeProviderEvidence(seed.provider);
  const value: BrushRuntimePass = Object.freeze({ ...seed, reads, writes,
    dependsOn: unique(reads.map((id) => graph.writers.get(id)).filter((id): id is string => Boolean(id))),
    repeat: Math.max(1, Math.round(seed.repeat ?? 1)), fusionKey: seed.fusionKey ?? null,
    activeTileMode: seed.activeTileMode ?? "none", haloPx: Math.max(0, Math.round(seed.haloPx ?? 0)),
    acceptsPredicted: seed.acceptsPredicted ?? false, budgetMs: Number(seed.budgetMs.toFixed(3)),
    implementationPath: evidence?.evidencePaths[0] ?? null });
  graph.passes.push(value); for (const id of writes) graph.writers.set(id, value.id);
}
const present = (graph: Graph, ids: readonly BrushRuntimeFieldId[]) => Object.freeze(ids.filter((id) => graph.fields.has(id)));

function allocate(graph: Graph, policy: BrushQualityPolicy, plan: BrushRuntimeTilePlan): void {
  const physics = new Set(policy.simulation.physics), wet = physics.has("wet-flow") || policy.pigment.provider === "inkwash-density", patterned = policy.pattern.grammar !== "continuous" || policy.pattern.motif !== "none";
  field(graph, plan, { id: "samples.accepted", label: "Accepted samples", kind: "buffer", format: "sample-struct-v3", lifetime: "stroke", elements: 8192 });
  field(graph, plan, { id: "samples.predicted", label: "Predicted samples", kind: "buffer", format: "sample-struct-v3", lifetime: "frame", elements: 256, canonical: false });
  field(graph, plan, { id: "path.modeled", label: "Modeled path", kind: "buffer", format: "path-frame-v1", lifetime: "stroke", elements: 8192 });
  field(graph, plan, { id: "contacts.tip", label: "Tip contacts", kind: "buffer", format: "contact-struct-v2", lifetime: "stroke", elements: 16384 });
  field(graph, plan, { id: "paper.height", label: "Paper height", kind: "tile-texture", format: "r16float", lifetime: "document", activeTileMode: "all-visible" });
  field(graph, plan, { id: "paper.absorbency", label: "Paper absorbency", kind: "tile-texture", format: "r8unorm", lifetime: "document", scale: 0.5, activeTileMode: "all-visible" });
  field(graph, plan, { id: "paper.fiber", label: "Paper fiber", kind: "tile-texture", format: "rg16float", lifetime: "document", scale: 0.5, activeTileMode: "all-visible" });
  field(graph, plan, { id: "coverage.live", label: "Live coverage", kind: "tile-texture", format: "r16float", lifetime: "stroke", activeTileMode: "dirty" });
  if (patterned) { field(graph, plan, { id: "pattern.phase", label: "Pattern phase", kind: "tile-texture", format: "rg16float", lifetime: "document", activeTileMode: "all-visible" }); field(graph, plan, { id: "coverage.pattern", label: "Pattern coverage", kind: "tile-texture", format: "r16float", lifetime: "stroke", activeTileMode: "dirty" }); }
  field(graph, plan, { id: "pigment.weights", label: "Pigment weights", kind: "tile-texture", format: "rgba16float", lifetime: "document", layers: Math.max(1, Math.ceil(policy.pigment.spectralSamples / 16)), activeTileMode: "occupied" });
  if (wet) {
    field(graph, plan, { id: "pigment.mobile", label: "Mobile pigment", kind: "tile-texture", format: "rgba16float", lifetime: "settle", pingPong: true, activeTileMode: "wet", haloPx: 3 });
    field(graph, plan, { id: "pigment.fixed", label: "Fixed pigment", kind: "tile-texture", format: "rgba16float", lifetime: "document", activeTileMode: "occupied" });
    field(graph, plan, { id: "wetness", label: "Wetness", kind: "tile-texture", format: "r16float", lifetime: "settle", pingPong: true, activeTileMode: "wet", haloPx: 3 });
    const coarse = Math.max(0.125, policy.simulation.wetResolution * 0.35);
    field(graph, plan, { id: "velocity", label: "Velocity", kind: "tile-texture", format: "rg16float", lifetime: "settle", scale: coarse, pingPong: true, activeTileMode: "wet", haloPx: 2 });
    field(graph, plan, { id: "pressure", label: "Pressure", kind: "tile-texture", format: "r16float", lifetime: "frame", scale: coarse, pingPong: true, activeTileMode: "wet", haloPx: 1 });
    field(graph, plan, { id: "divergence", label: "Divergence", kind: "tile-texture", format: "r16float", lifetime: "frame", scale: coarse, activeTileMode: "wet", haloPx: 1 });
    field(graph, plan, { id: "curl", label: "Curl", kind: "tile-texture", format: "r16float", lifetime: "frame", scale: coarse, activeTileMode: "wet", haloPx: 1 });
  }
  if (physics.has("bristle")) { field(graph, plan, { id: "bristle.state", label: "Bristles", kind: "buffer", format: "bristle-struct-v1", lifetime: "stroke", elements: policy.simulation.bristleStrands * 16 }); field(graph, plan, { id: "reservoir.state", label: "Reservoir", kind: "buffer", format: "rgba32float", lifetime: "stroke", elements: policy.simulation.bristleStrands * 8 }); }
  else if (physics.has("pickup-reservoir")) field(graph, plan, { id: "reservoir.state", label: "Reservoir", kind: "buffer", format: "rgba32float", lifetime: "stroke", elements: 4096 });
  if (physics.has("particle-ballistics")) field(graph, plan, { id: "particle.state", label: "Particles", kind: "buffer", format: "particle-struct-v1", lifetime: "settle", elements: policy.simulation.particleCount * 8 });
  if (physics.has("reaction-diffusion")) { field(graph, plan, { id: "reaction.a", label: "Reaction A", kind: "tile-texture", format: "r16float", lifetime: "settle", pingPong: true, activeTileMode: "settling", haloPx: 2 }); field(graph, plan, { id: "reaction.b", label: "Reaction B", kind: "tile-texture", format: "r16float", lifetime: "settle", pingPong: true, activeTileMode: "settling", haloPx: 2 }); }
  if (physics.has("height-field") || physics.has("thin-film")) { field(graph, plan, { id: "paint.height", label: "Paint height", kind: "tile-texture", format: "r16float", lifetime: "document", pingPong: physics.has("thin-film"), activeTileMode: "settling", haloPx: 2 }); field(graph, plan, { id: "paint.normal", label: "Paint normal", kind: "tile-texture", format: "rg16float", lifetime: "document", activeTileMode: "occupied", haloPx: 1 }); }
  field(graph, plan, { id: "rgba.preview", label: "Prediction overlay", kind: "tile-texture", format: "rgba8unorm", lifetime: "frame", activeTileMode: "dirty", canonical: false });
  field(graph, plan, { id: "rgba.live", label: "Live composite", kind: "tile-texture", format: "rgba16float", lifetime: "stroke", activeTileMode: "dirty" });
  field(graph, plan, { id: "rgba.commit", label: "Committed pixels", kind: "tile-texture", format: "rgba16float", lifetime: "document", activeTileMode: "occupied" });
  field(graph, plan, { id: "receipt.raster", label: "Raster receipt", kind: "receipt", format: "json-receipt", lifetime: "document" });
}

function build(graph: Graph, policy: BrushQualityPolicy, bindings: readonly BrushRuntimeAuthorityBinding[]): void {
  const physics = new Set(policy.simulation.physics), wet = physics.has("wet-flow") || policy.pigment.provider === "inkwash-density", patterned = policy.pattern.grammar !== "continuous" || policy.pattern.motif !== "none";
  pass(graph, { id: "input.accept", label: "Accept calibrated samples", phase: "live", domain: "input-worker", provider: "browser", authority: "input", canonical: true, writes: ["samples.accepted"], budgetMs: 0.18 });
  pass(graph, { id: "input.predict", label: "Disposable prediction overlay", phase: "preview", domain: "webgpu", provider: "native-webgpu", authority: "input", canonical: false, acceptsPredicted: true, reads: ["samples.predicted"], writes: ["rgba.preview"], budgetMs: 0.22 });
  pass(graph, { id: "motion.model", label: "Resample and stabilize", phase: "live", domain: "input-worker", provider: owner(bindings, "motion"), authority: "motion", canonical: true, reads: ["samples.accepted"], writes: ["path.modeled"], budgetMs: 0.32 });
  pass(graph, { id: "carrier.contact", label: "Build tip contacts", phase: "live", domain: "webgpu", provider: owner(bindings, "carrier"), authority: "carrier", canonical: true, reads: ["path.modeled", "paper.height"], writes: ["contacts.tip"], fusionKey: "material", activeTileMode: "dirty", budgetMs: 0.44 });
  if (patterned) pass(graph, { id: "pattern.evaluate", label: "Evaluate pattern", phase: policy.pattern.grammar === "flow-field" ? "settle" : "live", domain: policy.pattern.grammar === "flow-field" ? "webgl-worker" : "webgpu", provider: owner(bindings, "pattern"), authority: "pattern", canonical: true, reads: ["path.modeled", "pattern.phase"], writes: ["coverage.pattern"], fusionKey: policy.pattern.grammar === "flow-field" ? null : "material", activeTileMode: "dirty", budgetMs: 0.35 + policy.pattern.density * 0.55 });
  if (physics.has("bristle")) pass(graph, { id: "bristle.solve", label: "Solve bristles and reservoir", phase: "live", domain: "wasm-worker", provider: owner(bindings, "carrier"), authority: "carrier", canonical: true, reads: ["path.modeled", "paper.height", "pigment.weights", "bristle.state", "reservoir.state"], writes: ["bristle.state", "reservoir.state", "coverage.live"], repeat: policy.simulation.bristleContactIterations, activeTileMode: "dirty", budgetMs: 0.08 * policy.simulation.bristleContactIterations + policy.simulation.bristleStrands / 180 });
  pass(graph, { id: "deposition.coverage", label: wet ? "Deposit water and mobile pigment" : "Deposit material", phase: "live", domain: "webgpu", provider: owner(bindings, "deposition"), authority: "deposition", canonical: true, reads: present(graph, ["contacts.tip", "coverage.pattern", "paper.absorbency", "reservoir.state"]), writes: wet ? ["pigment.mobile", "wetness", "velocity", "coverage.live"] : ["coverage.live", "pigment.weights"], fusionKey: wet ? null : "material", activeTileMode: wet ? "wet" : "dirty", haloPx: wet ? 3 : 0, budgetMs: wet ? 0.65 : 0.42 });
  if (physics.has("pickup-reservoir") && !physics.has("bristle")) pass(graph, { id: "pickup.reservoir", label: "Pickup underpaint", phase: "live", domain: "wasm-worker", provider: owner(bindings, "pickup"), authority: "pickup", canonical: true, reads: ["rgba.commit", "contacts.tip", "reservoir.state"], writes: ["reservoir.state", "pigment.weights"], activeTileMode: "dirty", budgetMs: 0.85 });
  if (physics.has("particle-ballistics")) pass(graph, { id: "particle.integrate", label: "Integrate particles", phase: "settle", domain: "webgpu", provider: PHYSICS_PROVIDER["particle-ballistics"], authority: "auxiliary", canonical: true, reads: ["contacts.tip", "particle.state"], writes: ["particle.state", "coverage.live"], activeTileMode: "occupied", budgetMs: 0.55 + policy.simulation.particleCount / 512 });
  if (wet) {
    pass(graph, { id: "wet.advect-velocity", label: "Advect velocity", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["velocity", "wetness"], writes: ["velocity"], activeTileMode: "wet", haloPx: 2, budgetMs: 0.35 });
    pass(graph, { id: "wet.curl", label: "Compute curl", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["velocity"], writes: ["curl"], activeTileMode: "wet", haloPx: 1, budgetMs: 0.18 });
    pass(graph, { id: "wet.divergence", label: "Compute divergence", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["velocity"], writes: ["divergence", "pressure"], activeTileMode: "wet", haloPx: 1, budgetMs: 0.18 });
    pass(graph, { id: "wet.pressure-jacobi", label: "Solve pressure", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["pressure", "divergence"], writes: ["pressure"], repeat: policy.simulation.pressureIterations, activeTileMode: "wet", haloPx: 1, budgetMs: 0.025 * policy.simulation.pressureIterations });
    pass(graph, { id: "wet.project", label: "Project velocity", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["velocity", "pressure"], writes: ["velocity"], activeTileMode: "wet", haloPx: 1, budgetMs: 0.22 });
    pass(graph, { id: "wet.transport", label: "Transport pigment and wetness", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["pigment.mobile", "wetness", "velocity", "paper.absorbency", "paper.fiber"], writes: ["pigment.mobile", "wetness"], activeTileMode: "wet", haloPx: 3, budgetMs: 0.62 + policy.simulation.diffusion * 0.35 });
    pass(graph, { id: "wet.granulate", label: "Granulate and edge-darken", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["pigment.mobile", "wetness", "paper.height", "paper.fiber"], writes: ["pigment.mobile", "pigment.fixed"], activeTileMode: "wet", haloPx: 2, budgetMs: 0.38 + policy.material.granulation * 0.4 });
    pass(graph, { id: "wet.settle", label: "Evaporate and settle", phase: "settle", domain: "webgpu", provider: "inkwash", authority: "wet", canonical: true, reads: ["pigment.mobile", "pigment.fixed", "wetness"], writes: ["pigment.mobile", "pigment.fixed", "wetness"], activeTileMode: "wet", haloPx: 1, budgetMs: 0.28 + policy.simulation.evaporation * 0.25 });
  }
  if (physics.has("thin-film")) pass(graph, { id: "thin-film.gravity", label: "Integrate thin-film gravity", phase: "settle", domain: "webgpu", provider: "thin-film", authority: "height", canonical: true, reads: present(graph, ["paint.height", "pigment.weights", "pigment.mobile", "wetness"]), writes: present(graph, ["paint.height", "pigment.weights", "pigment.mobile"]), activeTileMode: "settling", haloPx: 2, budgetMs: 1.15 + policy.simulation.gravity * 0.5 });
  if (physics.has("reaction-diffusion")) pass(graph, { id: "reaction.step", label: "Advance reaction field", phase: "settle", domain: "webgpu", provider: "reaction-diffusion", authority: "auxiliary", canonical: true, reads: ["reaction.a", "reaction.b", "coverage.live"], writes: ["reaction.a", "reaction.b", "coverage.live"], repeat: policy.goal === "cinematic" ? 8 : 4, activeTileMode: "settling", haloPx: 2, budgetMs: policy.goal === "cinematic" ? 1.8 : 0.95 });
  if (graph.fields.has("paint.height")) pass(graph, { id: "height.normal", label: "Generate relief normal", phase: "settle", domain: "webgpu", provider: owner(bindings, "height"), authority: "height", canonical: true, reads: ["paint.height"], writes: ["paint.normal"], activeTileMode: "settling", haloPx: 1, budgetMs: 0.35 });
  pass(graph, { id: "pigment.resolve", label: `Resolve ${policy.pigment.provider} pigment`, phase: wet ? "settle" : "live", domain: "webgpu", provider: owner(bindings, "pigment"), authority: "pigment", canonical: true, reads: present(graph, ["coverage.live", "pigment.weights", "pigment.mobile", "pigment.fixed", "wetness", "reservoir.state"]), writes: ["rgba.live"], fusionKey: wet ? null : "material", activeTileMode: wet ? "wet" : "dirty", budgetMs: policy.pigment.provider === "rgb" ? 0.25 : 0.45 + policy.pigment.spectralSamples / 128 });
  pass(graph, { id: "output.commit", label: "Commit tiles and receipt", phase: "commit", domain: "webgpu", provider: "native-webgpu", authority: "output", canonical: true, reads: present(graph, ["rgba.live", "rgba.commit", "paint.normal"]), writes: ["rgba.commit", "receipt.raster"], activeTileMode: "dirty", budgetMs: 0.45 });
  pass(graph, { id: "output.export", label: "Assemble export", phase: "export", domain: "webgpu", provider: "native-webgpu", authority: "output", canonical: true, reads: present(graph, ["rgba.commit", "receipt.raster", "pigment.weights", "pigment.fixed", "paint.height"]), writes: ["rgba.commit"], activeTileMode: "occupied", budgetMs: 2 + policy.output.exportScale * 1.35 });
}

function fuse(passes: readonly BrushRuntimePass[]): readonly BrushRuntimeFusedPassGroup[] {
  const groups: BrushRuntimeFusedPassGroup[] = [];
  for (let index = 0; index < passes.length;) {
    const first = passes[index]!, members = [first]; let cursor = index + 1;
    while (cursor < passes.length) { const next = passes[cursor]!; if (!first.fusionKey || next.fusionKey !== first.fusionKey || next.phase !== first.phase || next.domain !== first.domain || first.domain !== "webgpu") break; members.push(next); cursor += 1; }
    groups.push(Object.freeze({ id: `fusion:${first.phase}:${groups.length}`, phase: first.phase, domain: first.domain,
      passIds: Object.freeze(members.map((item) => item.id)), budgetMs: Number(members.reduce((sum, item) => sum + item.budgetMs, 0).toFixed(3)),
      reads: unique(members.flatMap((item) => item.reads)), writes: unique(members.flatMap((item) => item.writes)) })); index = cursor;
  }
  return Object.freeze(groups);
}
function gate(id: string, severity: BrushRuntimeGate["severity"], title: string, detail: string, fix: string | null, extra: Partial<BrushRuntimeGate> = {}): BrushRuntimeGate { return Object.freeze({ id, severity, title, detail, fix, ...extra }); }
function supports(capabilities: BrushRuntimeCapabilities, requirement: BrushRuntimeProviderEvidence["browserRequirements"][number]): boolean {
  return requirement === "webgpu" ? capabilities.webgpu && capabilities.webgpuAdapter : requirement === "webgl2" ? capabilities.webgl2 : requirement === "offscreen-canvas" ? capabilities.offscreenCanvas : capabilities.sharedArrayBuffer && capabilities.crossOriginIsolated;
}
function validate(policy: BrushQualityPolicy, graph: Graph, providers: readonly BrushRuntimeProviderEvidence[], capabilities: BrushRuntimeCapabilities, benchmark: BrushRuntimeBenchmarkReceipt | null, strict: boolean, memoryMb: number, liveMs: number, liveBudgetMs: number): readonly BrushRuntimeGate[] {
  const gates: BrushRuntimeGate[] = [], passIds = new Set(graph.passes.map((item) => item.id)), fields = new Set(graph.fields.keys());
  for (const item of graph.passes) {
    for (const id of item.dependsOn) if (!passIds.has(id)) gates.push(gate(`missing-dependency:${item.id}:${id}`, "error", "Pass dependency missing", `${item.id} -> ${id}`, "Repair DAG.", { passId: item.id }));
    for (const id of [...item.reads, ...item.writes]) if (!fields.has(id)) gates.push(gate(`missing-field:${item.id}:${id}`, "error", "Field allocation missing", `${item.id} uses ${id}`, "Repair field planner.", { passId: item.id, fieldId: id }));
    if (item.canonical && (item.acceptsPredicted || item.reads.includes("samples.predicted"))) gates.push(gate(`prediction-leak:${item.id}`, "error", "Prediction leaked into canonical state", item.id, "Keep predictions on rgba.preview only.", { passId: item.id }));
    if (item.provider === "p5-brush" && item.phase === "live") gates.push(gate(`p5-live:${item.id}`, "error", "p5.brush cannot run live", item.id, "Move to settle/export.", { passId: item.id, provider: "p5-brush" }));
  }
  for (const provider of providers) {
    if (strict && !PRODUCT_READY.has(provider.readiness)) gates.push(gate(`provider-unwired:${provider.id}`, "error", `${provider.label} product kernel is not wired`, provider.qualityGate, "Wire a real kernel and browser receipt.", { provider: provider.id }));
    else if (provider.readiness === "wired-conditional") gates.push(gate(`provider-conditional:${provider.id}`, "warning", `${provider.label} is conditional`, provider.qualityGate, "Attach a brush/device quality receipt.", { provider: provider.id }));
    for (const requirement of provider.browserRequirements) if (!supports(capabilities, requirement)) gates.push(gate(`capability:${provider.id}:${requirement}`, "error", `${provider.label} capability missing`, requirement, "Use a certified browser or equivalent provider.", { provider: provider.id }));
  }
  if (policy.input.transport === "raw-coalesced" && !capabilities.pointerRawUpdate) gates.push(gate("raw-transport", "error", "pointerrawupdate unavailable", "Raw transport cannot run.", "Use move-coalesced."));
  if (policy.input.transport !== "move-basic" && !capabilities.coalescedEvents) gates.push(gate("coalesced-events", "error", "Coalesced events unavailable", "Dense hardware samples cannot be recovered.", "Use move-basic."));
  if (policy.input.predictionPreviewOnly && !capabilities.predictedEvents) gates.push(gate("predicted-events", "info", "Prediction unavailable", "Only prediction tail is disabled.", null));
  if (policy.pigment.provider === "mixbox" && !policy.pigment.allowMixboxWhenDistinct) gates.push(gate("mixbox-distinctness", "error", "Mixbox distinctness receipt missing", "Spectral/Open K/S replacement has not been disproved.", "Run Pigment Lab A/B and rights validation.", { provider: "mixbox" }));
  if (policy.pattern.space === "document" && policy.pattern.grammar !== "continuous" && !policy.pattern.deterministic) gates.push(gate("pattern-phase", "error", "Document pattern is nondeterministic", "Stable seed and phase are required.", "Enable deterministic pattern.", { fieldId: "pattern.phase" }));
  const limit = policy.device === "touch-hybrid" ? 256 : policy.device === "tablet-pen" ? 384 : policy.device === "mouse" ? 320 : 512;
  if (memoryMb > limit) gates.push(gate("memory-budget", "error", "GPU memory budget exceeded", `${memoryMb.toFixed(1)}MB / ${limit}MB`, "Reduce tiles, scales or spectral layers."));
  else if (memoryMb > limit * 0.78) gates.push(gate("memory-headroom", "warning", "Low GPU memory headroom", `${memoryMb.toFixed(1)}MB`, "Evict dry tiles and use coarse fields."));
  if (liveMs > liveBudgetMs) gates.push(gate("live-budget", liveMs > liveBudgetMs * 1.35 ? "error" : "warning", "Live frame budget exceeded", `${liveMs.toFixed(2)}ms / ${liveBudgetMs.toFixed(2)}ms`, "Lower live LOD and reevaluate on commit."));
  const fingerprint = brushRuntimeCapabilityFingerprint(capabilities);
  if (!benchmark) gates.push(gate("benchmark-missing", "warning", "Browser benchmark receipt missing", "Static estimates cannot certify hand feel.", "Run benchmark."));
  else { if (benchmark.capabilityFingerprint !== fingerprint) gates.push(gate("benchmark-capability-mismatch", "error", "Benchmark capability mismatch", "Receipt belongs to another browser/device.", "Measure again.")); if (!benchmark.stable) gates.push(gate("benchmark-unstable", "error", "Benchmark unstable", "Variance is too high.", "Disable throttling and measure again.")); if (capabilities.webgpu && benchmark.webgpuDispatchP95Ms === null) gates.push(gate("webgpu-benchmark-missing", "error", "WebGPU measurement missing", "Adapter exists but dispatch receipt does not.", "Run GPU benchmark.")); if (benchmark.eventLoopP95Ms > 12) gates.push(gate("event-loop-latency", "warning", "Event loop latency high", `${benchmark.eventLoopP95Ms.toFixed(2)}ms`, "Reduce main-thread work.")); }
  return Object.freeze(gates);
}
function certification(gates: readonly BrushRuntimeGate[], providers: readonly BrushRuntimeProviderEvidence[], benchmark: BrushRuntimeBenchmarkReceipt | null): BrushRuntimeCertification {
  if (gates.some((item) => item.severity === "error")) return "blocked";
  if (providers.some((item) => !PRODUCT_READY.has(item.readiness))) return "design-only";
  if (!benchmark || providers.some((item) => item.readiness === "wired-conditional") || gates.some((item) => item.severity === "warning")) return "conditional";
  return "certified";
}

export function compileBrushRuntimeProgram(input: BrushQualityPolicy, options: BrushRuntimeCompileOptions = {}): BrushRuntimeProgram {
  const optimized = optimizeBrushQualityPolicy(input), ids = providerIds(optimized), policy = Object.freeze({ ...optimized, providers: ids }) as BrushQualityPolicy;
  const capabilities = options.capabilities ?? createUnknownBrushRuntimeCapabilities(), benchmark = options.benchmark ?? null, seedPlan = tilePlan(policy, options.activeTileCount);
  const graph: Graph = { fields: new Map(), passes: [], writers: new Map() }, bindings = authorityBindings(policy, ids); allocate(graph, policy, seedPlan); build(graph, policy, bindings);
  const fields = Object.freeze([...graph.fields.values()]), memoryMb = Number((fields.reduce((sum, item) => sum + item.estimatedBytes, 0) / 1048576).toFixed(2));
  const plan = Object.freeze({ ...seedPlan, maxHaloPx: fields.reduce((max, item) => Math.max(max, item.haloPx), 0), atlasMemoryMb: memoryMb });
  const providers = Object.freeze(ids.map(brushRuntimeProviderEvidence));
  const liveMs = graph.passes.filter((item) => item.phase === "preview" || item.phase === "live").reduce((sum, item) => sum + item.budgetMs, 0), settleMs = graph.passes.filter((item) => item.phase === "settle").reduce((sum, item) => sum + item.budgetMs, 0);
  const targetFrameMs = policy.goal === "responsive" ? 8.33 : policy.goal === "material" ? 13.3 : policy.goal === "cinematic" ? 16.67 : 10, liveBudgetMs = Math.max(2, targetFrameMs - 1.5);
  const gates = validate(policy, graph, providers, capabilities, benchmark, options.strictProduct ?? true, memoryMb, liveMs, liveBudgetMs), wired = providers.filter((item) => PRODUCT_READY.has(item.readiness)).length;
  return Object.freeze({ schemaVersion: BRUSH_STUDIO_V5_RUNTIME_SCHEMA_VERSION,
    programKey: `brush-runtime-v2-${hash({ policy, capability: brushRuntimeCapabilityFingerprint(capabilities), benchmark: benchmark ? [benchmark.measuredAt, benchmark.checksum] : null, fields: fields.map((item) => [item.id, item.format]), passes: graph.passes.map((item) => [item.id, item.provider, item.repeat]) })}`,
    certification: certification(gates, providers, benchmark), policy, capabilities, benchmark,
    authorities: bindings, providers, fields, passes: Object.freeze([...graph.passes]), fusedGroups: fuse(graph.passes), gates, tilePlan: plan,
    budget: Object.freeze({ targetFrameMs, liveBudgetMs: Number(liveBudgetMs.toFixed(2)), settleBudgetMs: policy.output.settleBudgetMs,
      estimatedLiveMs: Number(liveMs.toFixed(2)), estimatedSettleMs: Number(settleMs.toFixed(2)), estimatedMemoryMb: memoryMb,
      wiredProviderFraction: Number((wired / Math.max(1, providers.length)).toFixed(3)), descriptorOnlyCount: providers.length - wired }) });
}
export function brushRuntimePassesByPhase(program: BrushRuntimeProgram): Readonly<Record<BrushRuntimePhase, readonly BrushRuntimePass[]>> {
  const phases: readonly BrushRuntimePhase[] = ["hover", "preview", "live", "settle", "commit", "export"];
  return Object.freeze(Object.fromEntries(phases.map((phase) => [phase, Object.freeze(program.passes.filter((item) => item.phase === phase))])) as Record<BrushRuntimePhase, readonly BrushRuntimePass[]>);
}
export const brushRuntimeProviderCoverage = (): readonly BrushRuntimeProviderEvidence[] => BRUSH_RUNTIME_PROVIDER_EVIDENCE;
export const physicsProviderForRuntime = (id: BrushPhysicsId): BrushRuntimeProviderEvidence => brushRuntimeProviderEvidence(PHYSICS_PROVIDER[id]);
