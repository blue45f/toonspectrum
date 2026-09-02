/**
 * scripts/audit-studio-brush-mark-distance.mts
 * Ranks the picker-listed procedural brushes by how alike they actually paint.
 *
 * `studio-brush-listed-uniqueness.ts` already forbids two listed ids from sharing an execution
 * signature, but that key is exact: two presets whose tips differ by a handful of alpha levels pass
 * it while an artist scrubbing the drawer cannot tell them apart. This audit measures the gap
 * instead of asserting it away, over the channels that decide what a mark looks like:
 *
 *   - the tip's alpha silhouette, compared pixel-wise (weight 0.45) — the dominant term,
 *   - tip roundness (0.15) — the dab's aspect; a round billow and a flattened streak read as
 *     different brushes even when every other channel agrees,
 *   - the stamp angle, folded to 180° (0.15) — a chisel's whole identity,
 *   - spacing, scatter, flow, softness and grain (0.20) — how the dab repeats and deposits,
 *   - whether taper is on (0.05) — a stroke that thins into its ends versus one that does not.
 *
 * Roundness and taper were added after a first sweep flagged pairs an artist reads as clearly
 * distinct: cloud-cirrus-stream vs smoke-wisp-layered agree on tip and scalars but sit at roundness
 * 0.42 vs 0.84, and horizontal-blade vs directional-flat share a byte-identical chisel alpha map
 * while differing in roundness, taper and scatter. A metric blind to those channels nominates cuts
 * that would flatten real expressive axes.
 *
 * The per-index noise seed is excluded on purpose: it moves grain placement without changing the
 * character an artist is choosing between. Only same-category pairs are reported, because the
 * quarantine ledger's removal precondition is an exposed in-group alternative.
 *
 * Run: pnpm run audit:studio-brush-mark-distance [--limit 8] [--threshold 0.12]
 * Output is a report, never a gate — every cut still needs an owner-auditable ledger entry.
 */
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "../src/domains/creator/brush/studio-brush-pack-index";
import { materializeStudioBrushPackDynamics } from "../src/domains/creator/brush/studio-brush-pack-runtime";
import { isStudioBrushQuarantinedPresetId } from "../src/domains/creator/brush/studio-brush-quarantine";

const SCALAR_CHANNELS = [
  "spacingRatio",
  "scatterRatio",
  "flow",
  "softness",
  "grainAmount",
  "grainScale",
  "grainContrast",
] as const;

type ScalarChannel = (typeof SCALAR_CHANNELS)[number];

interface BrushMark {
  readonly id: string;
  readonly name: string;
  readonly runtime: string;
  readonly category: string;
  readonly angle: number;
  readonly roundness: number;
  readonly tapered: boolean;
  readonly alpha: Uint8Array;
  readonly alphaSize: number;
  readonly scalars: Readonly<Record<ScalarChannel, number>>;
}

function numberArg(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectMarks(): BrushMark[] {
  const marks: BrushMark[] = [];
  for (const descriptor of STUDIO_BRUSH_PACK_DESCRIPTORS) {
    if (isStudioBrushQuarantinedPresetId(descriptor.catalogId)) continue;
    const dynamics = materializeStudioBrushPackDynamics(descriptor.catalogId);
    if (!dynamics) continue;
    const alphaMapBase64 = dynamics.tip.alphaMapBase64;
    if (typeof alphaMapBase64 !== "string" || alphaMapBase64.length === 0) continue;
    marks.push({
      id: descriptor.catalogId,
      name: descriptor.catalogName,
      runtime: descriptor.runtimeBrushId,
      category: descriptor.category,
      angle: Number(dynamics.angle.base ?? 0),
      roundness: Number(dynamics.roundness.base ?? 1),
      tapered: dynamics.taper.enabled === true,
      alpha: new Uint8Array(Buffer.from(alphaMapBase64, "base64")),
      alphaSize: Number(dynamics.tip.alphaMapSize ?? 0),
      scalars: {
        spacingRatio: Number(dynamics.spacingRatio ?? 0),
        scatterRatio: Number(dynamics.scatterRatio ?? 0),
        flow: Number(dynamics.flow.base ?? 0),
        softness: Number(dynamics.tip.softness ?? 0),
        grainAmount: Number(dynamics.grain.amount ?? 0),
        grainScale: Number(dynamics.grain.scale ?? 0),
        grainContrast: Number(dynamics.grain.contrast ?? 0),
      },
    });
  }
  return marks;
}

/** Mean absolute alpha difference; 0 means the two tips stamp the same silhouette. */
function tipDistance(left: BrushMark, right: BrushMark): number {
  if (left.alphaSize !== right.alphaSize || left.alpha.length !== right.alpha.length) return 1;
  let total = 0;
  for (let index = 0; index < left.alpha.length; index += 1) {
    total += Math.abs(left.alpha[index]! - right.alpha[index]!);
  }
  return total / (left.alpha.length * 255);
}

function main(): void {
  const limit = numberArg("--limit", 8);
  const threshold = numberArg("--threshold", 0.12);
  const marks = collectMarks();
  if (marks.length === 0) {
    console.error("no listed procedural brush exposed a tip alpha map");
    process.exitCode = 1;
    return;
  }

  const ranges = new Map<ScalarChannel, number>(
    SCALAR_CHANNELS.map((channel) => {
      const values = marks.map((mark) => mark.scalars[channel]);
      return [channel, Math.max(...values) - Math.min(...values) || 1];
    }),
  );

  function markDistance(left: BrushMark, right: BrushMark): {
    total: number;
    tip: number;
    scalar: number;
    angle: number;
    roundness: number;
  } {
    const tip = tipDistance(left, right);
    let squared = 0;
    for (const channel of SCALAR_CHANNELS) {
      const delta = (left.scalars[channel] - right.scalars[channel]) / ranges.get(channel)!;
      squared += delta * delta;
    }
    const scalar = Math.sqrt(squared / SCALAR_CHANNELS.length);
    const wrapped = (((left.angle - right.angle) % 180) + 180) % 180;
    const angle = Math.min(wrapped, 180 - wrapped) / 90;
    const roundness = Math.min(1, Math.abs(left.roundness - right.roundness));
    const taper = left.tapered === right.tapered ? 0 : 1;
    return {
      total: tip * 0.45 + roundness * 0.15 + angle * 0.15 + scalar * 0.2 + taper * 0.05,
      tip,
      scalar,
      angle,
      roundness,
    };
  }

  const byCategory = new Map<string, BrushMark[]>();
  for (const mark of marks) {
    const list = byCategory.get(mark.category) ?? [];
    list.push(mark);
    byCategory.set(mark.category, list);
  }

  console.log(`listed procedural brushes with tips: ${marks.length}`);
  console.log(`reporting same-category pairs under ${threshold} (max ${limit} per category)`);
  let reported = 0;
  for (const [category, list] of [...byCategory].sort((a, b) => b[1].length - a[1].length)) {
    if (list.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        pairs.push({ ...markDistance(list[i]!, list[j]!), left: list[i]!, right: list[j]! });
      }
    }
    const close = pairs.filter((pair) => pair.total < threshold).sort((a, b) => a.total - b.total);
    if (close.length === 0) continue;
    reported += close.length;
    console.log(`\n### ${category} — ${list.length} listed, ${close.length} pair(s) under ${threshold}`);
    for (const pair of close.slice(0, limit)) {
      console.log(
        `  ${pair.total.toFixed(4)}  tip=${pair.tip.toFixed(4)} round=${pair.roundness.toFixed(3)}`
        + ` angle=${pair.angle.toFixed(3)} scalar=${pair.scalar.toFixed(3)}`
        + `  ${pair.left.name}(${pair.left.id})  <->  ${pair.right.name}(${pair.right.id})`,
      );
    }
  }
  if (reported === 0) console.log("\nno same-category pair is closer than the threshold");
}

main();
