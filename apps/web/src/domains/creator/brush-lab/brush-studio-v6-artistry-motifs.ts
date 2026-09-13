import type { BrushStudioV6ArtistryModel } from "./brush-studio-v6-artistry-catalog";
import type { BrushStudioV6Tuning } from "./brush-studio-v6-engine";
import type { BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";

export interface BrushStudioV6ArtistryMotifContext {
  readonly model: BrushStudioV6ArtistryModel;
  readonly t: BrushStudioV6Tuning;
  readonly size: number; readonly seed: number; readonly density: number; readonly variation: number;
  readonly repeat: number; readonly r: number; readonly width: number;
  readonly index: number; readonly motif: number; readonly freshMotif: boolean;
  readonly localLine: (a: number, b: number, d: number, e: number, width: number, mix?: number, opacity?: number) => void;
  readonly oval: (a: number, b: number, rx: number, ry: number, turn?: number, mix?: number, shape?: BrushTopologyPrimitive["shape"], opacity?: number) => void;
}
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
function noise(a: number, b: number, seed: number): number {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** All motifs use analytic, reflection-symmetric primitives shared by Canvas, SVG and symmetry. */
export function depositBrushStudioV6ArtistryMotif(context: BrushStudioV6ArtistryMotifContext): void {
  const { model, t, size, seed, density, variation, repeat, r, width, index, motif, freshMotif, localLine, oval } = context;
  if (model === "stipple") {
    const count = Math.round(Math.max(2, Math.min(32, t.particleCount / 128)));
    for (let i = 0; i < count; i++) {
      const turn = (i + index * 0.61803398875) * GOLDEN_ANGLE + noise(index, i, seed) * variation;
      const radial = Math.sqrt((i + 0.5) / count) * r;
      const dot = Math.max(0.18, size * (0.004 + unit(t.granulation) * 0.026 * noise(index, i, seed ^ 31)));
      oval(Math.cos(turn) * radial, Math.sin(turn) * radial, dot, dot, 0, noise(i, 37, seed), "ellipse", 0.68);
    }
    return;
  }
  if (!freshMotif) return;
  const jitter = (noise(motif, 41, seed) - 0.5) * variation;
  if (model === "chain") {
    const side = motif % 2 === 0;
    oval(0, 0, repeat * 0.62, r * (side ? 0.5 : 0.16), jitter * 0.6, side ? 0 : 0.8, "ring");
    oval(repeat * 0.2, -r * 0.05, repeat * 0.12, width * 0.65, jitter, 1);
  } else if (model === "pearls") {
    const bead = r * (0.58 + jitter * 0.2);
    oval(0, jitter * r * 0.12, bead, bead, 0, 0.15);
    oval(-bead * 0.18, -bead * 0.18, bead * 0.72, bead * 0.72, 0, 0.55);
    oval(-bead * 0.38, -bead * 0.4, bead * 0.22, bead * 0.18, 0, 1);
  } else if (model === "zipper") {
    const length = r * (0.68 + jitter * 0.25);
    localLine(0, -r * 0.76, 0, r * 0.12, Math.max(width, repeat * 0.15), 0);
    localLine(repeat * 0.5, r * 0.76, repeat * 0.5, -length * 0.2, Math.max(width, repeat * 0.15), 0.75);
  } else if (model === "fern") {
    for (const side of [-1, 1]) {
      const reach = r * (0.7 + noise(motif, side, seed ^ 43) * variation * 0.5);
      const a = reach * (0.45 + jitter * 0.3), b = reach * side;
      oval(a * 0.5, b * 0.5, reach * 0.58, reach * 0.15, Math.atan2(b, a), side < 0 ? 0.15 : 0.7);
      localLine(0, 0, a, b, width * 0.6, 1);
      localLine(a * 0.5, b * 0.5, a * 0.25, b * 0.85, width * 0.3, 0.95);
    }
  } else if (model === "blossom") {
    const petals = Math.round(4 + density * 4), rotation = noise(motif, 47, seed) * TAU * variation;
    for (let i = 0; i < petals; i++) {
      const turn = rotation + i * TAU / petals;
      const a = Math.cos(turn) * r * 0.56, b = Math.sin(turn) * r * 0.56;
      oval(a, b, r * 0.55, r * 0.26, turn, i / petals);
      localLine(0, 0, a, b, width * 0.35, 1, 0.75);
    }
    oval(0, 0, r * 0.16, r * 0.16, 0, 0.75);
  } else if (model === "fur") {
    const hairs = Math.round(3 + density * 5);
    for (let hair = 0; hair < hairs; hair++) {
      const root = (hair / (hairs - 1) * 2 - 1) * r * 0.75;
      const lean = (noise(motif, hair, seed ^ 53) - 0.5) * variation * r;
      const length = r * (0.9 + noise(motif, hair, seed ^ 59) * variation);
      let a = -r * 0.4, b = root;
      for (let segment = 1; segment <= 4; segment++) {
        const p = segment / 4, nextA = -r * 0.4 + p * length;
        const nextB = root * (1 - p * 0.45) + lean * p * p;
        localLine(a, b, nextA, nextB, width * (1.5 - p * 1.35), hair / hairs, 0.9);
        a = nextA; b = nextB;
      }
    }
  } else if (model === "scales") {
    const rows = Math.round(2 + density * 3), radius = r / Math.max(1, rows * 0.45);
    for (let row = 0; row < rows; row++) {
      const a = (row % 2) * repeat * 0.5 + jitter * radius * 0.3;
      const b = (row / (rows - 1) * 2 - 1) * r * 0.75;
      let previousA = a, previousB = b - radius;
      for (let segment = 1; segment <= 8; segment++) {
        const angle = -Math.PI / 2 + segment * Math.PI / 8;
        const nextA = a + Math.cos(angle) * radius, nextB = b + Math.sin(angle) * radius;
        localLine(previousA, previousB, nextA, nextB, width * 0.8, row / rows);
        previousA = nextA; previousB = nextB;
      }
    }
  } else if (model === "embroidery") {
    const half = repeat * 0.42, reach = r * (0.6 + jitter * 0.2);
    localLine(-half, -reach, half, reach, width * 2, 0.15);
    localLine(-half, reach, half, -reach, width * 2, 0.85);
    for (const a of [-half, half]) for (const b of [-reach, reach]) oval(a, b, width * 1.3, width * 1.3, 0, 0, "ring");
  }
}
