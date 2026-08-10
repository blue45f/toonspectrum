/**
 * Long-session soak harness (V11.1 §9.3 / Phase 7).
 *
 * Each cycle exercises the storage + render spine end to end: command
 * dispatches with snapshots, full crash recovery, and a cross-renderer frame
 * (vello_cpu + CanvasKit). Short mode (default ~15s) runs in CI-adjacent
 * checks; SOAK_MINUTES=480 style runs cover the 8h gate. RSS is sampled per
 * wave so leak slopes are visible in the recorded raw data.
 * Run: pnpm run soak:studio-engine
 */
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { renderSceneToPixels as renderWithSkia } from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import {
  CommandBus,
  MemoryJournalStore,
  createEmptyScene,
  polylineToPath,
  sceneDigest,
  solidPaint,
} from "@toonspectrum/studio-project-model";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");

const soakMinutes = Number(process.env.SOAK_MINUTES ?? "0.25");
const durationMs = soakMinutes * 60_000;

function strokeNode(id: string, phase: number) {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 24; index += 1) {
    const t = index / 23;
    points.push([8 + t * 112, 64 + Math.sin(phase + t * Math.PI * 2) * 40]);
  }
  return {
    id,
    kind: "stroke-path" as const,
    path: polylineToPath(points),
    paint: solidPaint(0.1, 0.1, 0.15),
    strokeWidth: 3,
    cap: "round" as const,
    join: "round" as const,
    miterLimit: 4,
    opacity: 1,
    blend: "src-over" as const,
  };
}

async function main(): Promise<void> {
  const [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);
  const started = performance.now();
  let cycles = 0;
  let commands = 0;
  let renders = 0;
  const errors: string[] = [];
  const rssSamplesMb: number[] = [];

  while (performance.now() - started < durationMs) {
    try {
      const store = new MemoryJournalStore();
      const { bus } = await CommandBus.open(store, { snapshotEvery: 16 });
      await bus.dispatch({ type: "scene/init", scene: createEmptyScene(128, 128) });
      for (let index = 0; index < 40; index += 1) {
        await bus.dispatch({
          type: "scene/add-node",
          node: strokeNode(`s${cycles}-${index}`, cycles + index * 0.37),
        });
        commands += 1;
      }
      const liveDigest = sceneDigest(bus.getScene());
      const { bus: reopened, recovery } = await CommandBus.open(store);
      if (recovery.issues.length > 0) {
        errors.push(`cycle ${cycles}: recovery issues ${recovery.issues.join(",")}`);
      }
      if (sceneDigest(reopened.getScene()) !== liveDigest) {
        errors.push(`cycle ${cycles}: digest divergence after recovery`);
      }
      const scene = reopened.getScene();
      if (scene) {
        const vello = renderWithVello(scene);
        const skia = renderWithSkia(ck, scene);
        renders += 2;
        if (vello.length !== skia.length) {
          errors.push(`cycle ${cycles}: renderer buffer size mismatch`);
        }
      }
      cycles += 1;
      if (cycles % 5 === 0) {
        rssSamplesMb.push(Number((process.memoryUsage().rss / 1048576).toFixed(1)));
      }
    } catch (error) {
      errors.push(`cycle ${cycles}: ${(error as Error).message}`);
      if (errors.length > 10) break;
    }
  }

  const report = {
    harness: "tests/benchmarks/harness/soak.ts",
    generatedAt: new Date().toISOString(),
    host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    config: { soakMinutes, snapshotEvery: 16, strokesPerCycle: 40 },
    totals: { cycles, commands, renders, errors: errors.length },
    rssSamplesMb,
    rssFirstMb: rssSamplesMb[0] ?? null,
    rssLastMb: rssSamplesMb[rssSamplesMb.length - 1] ?? null,
    errors,
  };
  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, "soak.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `soak: ${cycles} cycles, ${commands} commands, ${renders} renders, ${errors.length} errors`,
  );
  console.log(`rss first ${report.rssFirstMb}MB → last ${report.rssLastMb}MB`);
  console.log(`written: ${target}`);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

await main();
