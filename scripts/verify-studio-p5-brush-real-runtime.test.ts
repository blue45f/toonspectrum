import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("Studio p5.brush permanent real-runtime gate", () => {
  it("uses the exact production provider and standalone adapter inside a module Worker", () => {
    const browser = source(
      "scripts/studio-p5-brush-real-runtime-browser.ts",
    );
    const worker = source(
      "scripts/studio-p5-brush-real-runtime-worker.ts",
    );

    expect(browser).toContain(
      'new URL("./studio-p5-brush-real-runtime-worker.ts", import.meta.url)',
    );
    expect(browser).toContain('type: "module"');
    expect(browser).toContain("async function runSequentialWorkerReplay()");
    expect(browser).toContain(
      'const workerResult = await runWorker(\n    "studio-p5-brush-real-runtime-primary",',
    );
    expect(browser).toContain(
      'const freshWorkerReplay = await runWorker(\n    "studio-p5-brush-real-runtime-fresh-replay",',
    );
    expect(browser).not.toContain("Promise.all([");
    expect(worker).toContain(
      'from "../src/domains/creator/studio-p5-brush-standalone-runtime-adapter"',
    );
    expect(worker).toContain(
      'from "../src/domains/creator/studio-procedural-artistic-brush-provider"',
    );
    expect(worker).toContain(
      "createStudioP5BrushStandaloneAdapterLoader()",
    );
    expect(worker).toContain(
      "createStudioProceduralArtisticBrushProvider({",
    );
    expect(worker).toContain('new OffscreenCanvas(width, height)');
    expect(worker).toContain('canvas.getContext("webgl2"');
    expect(worker).toContain('gl.getExtension("WEBGL_lose_context")');
    expect(worker).toContain("gl.isContextLost()");
    expect(worker).toContain("const code = gl.getError()");
    expect(worker).toContain("canvas.width = 1");
    expect(worker).toContain("canvas.height = 1");
    expect(worker).toContain("surfaceDisposeCount !== surfaceCount");
    expect(worker).toContain("assertNoWebGlLifecycleFailures(");
  });

  it("gates all supported techniques, non-empty pixels and exact seeded replay", () => {
    const protocol = source(
      "scripts/studio-p5-brush-real-runtime-protocol.ts",
    );
    const verifier = source(
      "scripts/verify-studio-p5-brush-real-runtime.mjs",
    );
    const packageJson = JSON.parse(
      source("package.json"),
    ) as Readonly<{
      scripts?: Readonly<Record<string, string>>;
    }>;

    expect(protocol).toContain('"flow-field"');
    expect(protocol).toContain('"hatch"');
    expect(protocol).toContain('"mass"');
    expect(protocol).toContain('"watercolor-fill"');
    expect(protocol).toContain('"flat-wash"');
    expect(verifier).toContain(
      'const EXPECTED_ADAPTER_VERSION = "2.2.1-adapter.3"',
    );
    expect(verifier).toContain("const EXPECTED_SURFACE_COUNT = 10");
    expect(verifier).toContain("MIN_PAINTED_PIXELS");
    expect(verifier).toContain("exactPixelReplay");
    expect(verifier).toContain("first?.pixelHash !== evidence.replay?.pixelHash");
    expect(verifier).toContain("validateFreshWorkerReplay");
    expect(verifier).toContain(
      "two fresh Workers did not produce identical bytes",
    );
    expect(packageJson.scripts?.["verify:studio-p5-brush-real-runtime"]).toBe(
      "node scripts/verify-studio-p5-brush-real-runtime.mjs",
    );
  });

  it("permits an environment skip only after a failed real WebGL2 context probe", () => {
    const worker = source(
      "scripts/studio-p5-brush-real-runtime-worker.ts",
    );
    const verifier = source(
      "scripts/verify-studio-p5-brush-real-runtime.mjs",
    );

    expect(worker).toContain('reason: "webgl2-unavailable"');
    expect(worker).toContain(
      "probeCanvas.getContext(\"webgl2\", CONTEXT_ATTRIBUTES)",
    );
    expect(verifier).toContain(
      'result.reason === "webgl2-unavailable"',
    );
    expect(verifier).toContain(
      "result.probe?.webgl2ContextAttempted === true",
    );
    expect(verifier).toContain("process.exitCode = 2");
  });

  it("keeps standalone runtime and resolved-peer license roles explicit", () => {
    const notice = source("THIRD_PARTY_NOTICES.md");
    const generator = source("scripts/generate-third-party-notices.mjs");

    expect(notice).toContain("| `lazy-brush` | 2.0.2 | MIT |");
    expect(notice).toContain("| `p5.brush` standalone entry | 2.2.1 | MIT |");
    expect(notice).toContain(
      "| `p5` peer resolution for `p5.brush` | 2.3.1 | LGPL-2.1 |",
    );
    expect(notice).toContain(
      "| `libtess` dependency of the resolved `p5` peer | 1.2.2 | SGI-B-2.0 |",
    );
    expect(notice).toContain(
      "does not statically import the resolved `p5` peer",
    );
    expect(generator).toContain(
      '"https://github.com/dulnan/lazy-brush"',
    );
    expect(generator).toContain('"p5.brush": "2.2.1"');
  });

  it("is a mandatory isolated GitHub CI job with a bounded runtime", () => {
    const workflow = parseYaml(
      source(".github/workflows/ci.yml"),
    ) as Readonly<{
      jobs?: Readonly<Record<string, Readonly<{
        "runs-on"?: string;
        "timeout-minutes"?: number;
        services?: unknown;
        steps?: readonly Readonly<{
          uses?: string;
          run?: string;
        }>[];
      }>>>;
    }>;
    const job = workflow.jobs?.["studio-p5-brush-real-runtime"];
    const steps = job?.steps ?? [];

    expect(job).toBeDefined();
    expect(job?.["runs-on"]).toBe("ubuntu-latest");
    expect(job?.["timeout-minutes"]).toBe(12);
    expect(job?.services).toBeUndefined();
    expect(steps.map((step) => step.uses).filter(Boolean)).toEqual([
      "actions/checkout@v6",
      "pnpm/action-setup@v6",
      "actions/setup-node@v6",
    ]);
    expect(steps.map((step) => step.run).filter(Boolean)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm exec playwright install --with-deps chromium",
      "pnpm run verify:studio-p5-brush-real-runtime",
    ]);
  });
});
