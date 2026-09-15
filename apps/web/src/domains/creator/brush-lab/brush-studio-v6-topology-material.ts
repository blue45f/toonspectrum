import { isBrushStudioV6ArtistryModel } from "./brush-studio-v6-artistry-catalog";
import { brushStudioV6Topology } from "./brush-studio-v6-topology-catalog";
import type { BrushStudioV6Tuning } from "./brush-studio-v6-engine";
import type { BrushStudioV6MaterialMark, BrushStudioV6MaterialProgram } from "./brush-studio-v6-material-engine";
import type { BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";

export function brushStudioV6TopologyActiveTuning(program: BrushStudioV6MaterialProgram): ReadonlySet<keyof BrushStudioV6Tuning> | null {
  const topology = brushStudioV6Topology(program.slots.carrier);
  if (!topology) return null;
  const keys = new Set<keyof BrushStudioV6Tuning>(["size", "opacity", "flow", "spacing", "primaryColor", "secondaryColor", "surfaceTooth"]);
  for (const control of topology.controls) keys.add(control.key);
  if (topology.model === "orbit" || topology.model === "weave" || isBrushStudioV6ArtistryModel(topology.model)) keys.delete("spacing");
  if (topology.model === "orbit" && program.tuning.patternJitter === 0) keys.delete("patternDensity");
  if (program.slots.deposition === "deposit-dry" || program.slots.tip === "tip-grain-exemplar") keys.add("granulation");
  if (program.slots.deposition === "deposit-wet") for (const key of ["wetness", "diffusion", "absorbency", "granulation"] as const) keys.add(key);
  if (program.slots.deposition === "deposit-oil") { keys.add("relief"); keys.add("plasticity"); }
  if (program.slots.deposition === "deposit-marker") keys.add("edgeDarkening");
  return keys;
}

/** Curves resolve their highest harmonic independently of the legacy dab-spacing control. */
export function brushStudioV6TopologyStep(program: BrushStudioV6MaterialProgram, fallback: number): number {
  const topology = brushStudioV6Topology(program.slots.carrier);
  if (topology && isBrushStudioV6ArtistryModel(topology.model)) {
    if (![program.tuning.size, program.tuning.patternScale].every(Number.isFinite)) return fallback;
    const size = Math.max(1, Math.min(240, program.tuning.size));
    // Motif repeat length never depends on event frequency or pressure.
    if (topology.model === "stipple") return Math.max(0.35, Math.min(6, size * 0.12));
    if (topology.model === "rake") return Math.max(0.35, Math.min(3, size * 0.045));
    return Math.max(0.35, Math.min(3, size * Math.max(0.1, program.tuning.patternScale) / 48));
  }
  if (!topology || !["orbit", "weave"].includes(topology.model)) return fallback;
  if (![program.tuning.size, program.tuning.patternScale, program.tuning.patternDensity].every(Number.isFinite)) return fallback;
  const harmonics = topology.model === "orbit" ? Math.round(2 + program.tuning.patternDensity * 5) : 1;
  return Math.max(0.35, Math.min(6, program.tuning.size * Math.max(0.1, program.tuning.patternScale) / (harmonics * 40)));
}

/** Context-sensitive allow-list; disabled nodes never impersonate running providers. */
export function isBrushStudioV6TopologyNodeCompatible(id: string): boolean {
  return Boolean(brushStudioV6Topology(id)) || [
    "input-pointer-v3", "motion-direct", "tip-round-sdf", "tip-chisel-sdf", "tip-grain-exemplar", "tip-krita-dual",
    "surface-smooth", "surface-kent", "surface-coldpress", "surface-printmaking", "surface-linen", "surface-porous",
    "deposit-ink", "deposit-dry", "deposit-wet", "deposit-oil", "deposit-marker",
    "pickup-none", "pickup-krita-smudge", "pigment-rgb", "pigment-spectral", "pigment-mixbox", "pattern-none", "finish-neon", "output-contact-canvas-svg",
  ].includes(id);
}
type Emit = (kind: BrushStudioV6MaterialMark["kind"], x: number, y: number, rx: number, ry: number,
  angle: number, opacity: number, mix?: number, height?: number, shape?: BrushStudioV6MaterialMark["shape"]) => void;
const unit = (n: number) => Math.max(0, Math.min(1, n));

/** At most three shared primitives per topology segment. This is deposition, not canvas pickup. */
export function paintBrushStudioV6TopologyPrimitive(program: BrushStudioV6MaterialProgram,
  mark: BrushTopologyPrimitive, pressure: number, paper: number, twist: number, emit: Emit,
): void {
  const t = program.tuning, deposition = program.slots.deposition;
  const dry = deposition === "deposit-dry" || program.slots.tip === "tip-grain-exemplar";
  const wet = deposition === "deposit-wet", oil = deposition === "deposit-oil";
  let contact = 1 - paper * unit(t.surfaceTooth) * 0.8;
  let width = mark.radiusY, mix = mark.mix;
  if (dry) {
    contact *= unit((pressure - paper * t.surfaceTooth * 0.8) * 2) * (1 - t.granulation * (1 - paper) * 0.7);
    width *= 0.65 + paper * 0.55;
  }
  if (oil) width *= (1 + t.plasticity * 0.5) * (1 + t.relief);
  if (wet) { contact *= 1 - t.absorbency * 0.4; mix = mix * (1 - t.granulation * 0.4) + paper * t.granulation * 0.4; }
  if (deposition === "deposit-marker") contact *= 0.65 + t.edgeDarkening * 0.3;
  const chisel = program.slots.tip === "tip-chisel-sdf";
  if (chisel) width *= 0.48;
  const rx = Math.max(width, mark.radiusX - mark.radiusY + width);
  const angle = mark.angle + (chisel ? twist * Math.PI / 180 : 0);
  const shape = chisel && mark.shape !== "ring" ? "rect" : mark.shape;
  const opacity = unit(t.opacity) * unit(t.flow) * mark.opacity * contact * Math.sqrt(pressure);
  if (program.slots.finish.includes("finish-neon")) {
    emit("ink", mark.x, mark.y, rx + width * 2, width * 3, angle, opacity * 0.13, 1, 0, shape);
  }
  if (wet) {
    const spread = width * (0.5 + t.diffusion * 3) * t.wetness;
    emit("wet", mark.x, mark.y, rx + spread, width + spread, angle, opacity * t.wetness * 0.25, mix, 0, shape);
  }
  emit(wet ? "wet" : dry ? "grain" : oil ? "relief" : "ink", mark.x, mark.y, rx, width,
    angle, opacity, mix, oil ? t.relief : 0, shape);
}
