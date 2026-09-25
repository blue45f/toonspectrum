import "../../src/app/styles/globals.css";
import { createRoot } from "react-dom/client";

import { runScene3dSpecialistInWorker } from "../../src/domains/creator/scene3d/specialists/specialist-client";
import { createSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-fixtures";
import {
  SpecialistJobQueue,
  scene3dSpecialistJobQueue,
} from "../../src/domains/creator/scene3d/specialists/specialist-job-queue";
import {
  clearProductSpecialistRecipeReuseCache,
  getProductSpecialistRecipeReuseCache,
  SpecialistRecipeReuseCache,
} from "../../src/domains/creator/scene3d/specialists/specialist-recipe-reuse";
import { createTexturedSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-texture-fixtures";
import { StudioScene3dAssetToolsPanel } from "../../src/domains/creator/scene3d/specialists/StudioScene3dAssetToolsPanel";

import type {
  SpecialistOptions,
  SpecialistResult,
} from "../../src/domains/creator/scene3d/specialists/specialist-contract";
import type { SpecialistJobProgress } from "../../src/domains/creator/scene3d/specialists/specialist-job-progress";

declare global {
  interface Window {
    __scene3dRecipeProof?: unknown;
    __scene3dRecipeFixture?: number[];
    __scene3dRecipeMetrics?: () => unknown;
    __scene3dRecipeClear?: () => void;
  }
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return (
    "sha256:" +
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  );
}
async function artifactDigests(result: SpecialistResult): Promise<string[]> {
  return Promise.all(
    result.artifacts.map(async (artifact) => {
      const computed = await digest(artifact.bytes);
      assert(computed === artifact.sha256, "Output hash verification failed.");
      return computed;
    }),
  );
}
async function verify() {
  const workerPath = new URL(location.href).searchParams.get("worker");
  assert(
    workerPath &&
      /^\/assets\/specialist\.worker-[a-zA-Z0-9_-]+\.js$/.test(workerPath),
    "The built production Worker is required.",
  );
  const OriginalWorker = window.Worker;
  let started = 0;
  let active = 0;
  let peak = 0;
  window.Worker = class extends OriginalWorker {
    private counted = false;
    constructor(url: string | URL, options?: WorkerOptions) {
      const processing = String(url).includes("/specialist.worker.ts");
      super(processing ? workerPath! : url, options);
      if (processing) {
        this.counted = true;
        started++;
        active++;
        peak = Math.max(peak, active);
      }
    }
    override terminate(): void {
      if (this.counted) {
        this.counted = false;
        active--;
      }
      super.terminate();
    }
  };
  const cache = new SpecialistRecipeReuseCache();
  const queue = new SpecialistJobQueue();
  const source = await createSpecialistFixture("sphere");
  const originalSourceHash = await digest(source);
  const options = { kind: "lod", error: 0.03 } as const;
  let id = 0;
  async function run(
    bytes: Uint8Array<ArrayBuffer>,
    recipe: SpecialistOptions,
  ) {
    const phases: SpecialistJobProgress[] = [];
    const previous = started;
    const start = performance.now();
    const result = await runScene3dSpecialistInWorker(
      { version: 1, id: ++id, source: bytes.buffer, options: recipe },
      undefined,
      {
        queue,
        reuseCache: cache,
        reuse: "memory",
        onProgress: (value) => phases.push(value),
      },
    );
    return {
      result,
      elapsedMilliseconds: performance.now() - start,
      phases,
      workersCreated: started - previous,
    };
  }
  const first = await run(source, options);
  const expected = await artifactDigests(first.result);
  assert(
    first.workersCreated === 1,
    "Initial recipe did not execute a real processing Worker.",
  );
  first.result.artifacts[0]!.bytes.fill(0);
  const repeated = await run(source.slice(), { error: 0.03, kind: "lod" });
  assert(
    repeated.workersCreated === 0,
    "Identical content and recipe started another Worker.",
  );
  assert(
    repeated.phases.at(-1)?.phase === "reused",
    "A cached result was presented as newly processed.",
  );
  assert(
    JSON.stringify(await artifactDigests(repeated.result)) ===
      JSON.stringify(expected),
    "Caller mutation corrupted cached output.",
  );
  assert(
    repeated.result.artifacts[0]!.bytes[0] !== 0,
    "Returned artifacts alias the caller's changed buffer.",
  );
  const changedOptions = await run(source, { kind: "lod", error: 0.01 });
  assert(
    changedOptions.workersCreated === 1,
    "Changed recipe reused incompatible artifacts.",
  );
  const changedSource = await run(
    await createSpecialistFixture("cube"),
    options,
  );
  assert(
    changedSource.workersCreated === 1,
    "Changed source reused another model's artifacts.",
  );
  cache.clear();
  const afterClear = await run(source, options);
  assert(afterClear.workersCreated === 1, "Cleared results were reused.");
  cache.clear();
  const textured = await createTexturedSpecialistFixture(true);
  const queuedPhases: SpecialistJobProgress[] = [];
  const firstQueue = runScene3dSpecialistInWorker(
    {
      version: 1,
      id: ++id,
      source: textured.buffer,
      options: {
        kind: "release",
        error: 0.03,
        textureMode: "uastc",
        maxTextureSize: 512,
      },
    },
    undefined,
    { queue, reuse: "memory", reuseCache: cache },
  );
  const baseline = started;
  const secondQueue = runScene3dSpecialistInWorker(
    {
      version: 1,
      id: ++id,
      source: textured.slice().buffer,
      options: {
        kind: "release",
        error: 0.03,
        textureMode: "uastc",
        maxTextureSize: 512,
      },
    },
    undefined,
    {
      queue,
      reuse: "memory",
      reuseCache: cache,
      onProgress: (phase) => queuedPhases.push(phase),
    },
  );
  const abort = new AbortController();
  const cancelled = runScene3dSpecialistInWorker(
    {
      version: 1,
      id: ++id,
      source: textured.buffer,
      options: {
        kind: "release",
        error: 0.03,
        textureMode: "uastc",
        maxTextureSize: 512,
      },
    },
    abort.signal,
    { queue, reuse: "memory", reuseCache: cache },
  ).then(
    () => {
      throw new Error("Queued cancellation returned a result.");
    },
    (error: unknown) => {
      assert(
        (error as { code?: string })?.code === "cancelled",
        "Cancellation code mismatch.",
      );
    },
  );
  abort.abort();
  await cancelled;
  const [a, b] = await Promise.all([firstQueue, secondQueue]);
  assert(
    started - baseline === 1,
    "Duplicate queued recipes did not collapse to one actual Worker.",
  );
  assert(
    queuedPhases[0]?.phase === "queued" &&
      queuedPhases.at(-1)?.phase === "reused",
    "Queued recipe reuse was not observable.",
  );
  assert(
    JSON.stringify(await artifactDigests(a)) ===
      JSON.stringify(await artifactDigests(b)),
    "Queued outputs differ.",
  );
  assert(
    a.artifacts[0]!.bytes.buffer !== b.artifacts[0]!.bytes.buffer,
    "Independent callers share an output buffer.",
  );
  assert(
    (await digest(source)) === originalSourceHash,
    "Canonical source bytes were detached or mutated.",
  );
  const snapshotBeforeClear = cache.snapshot();
  cache.clear();
  assert(
    cache.snapshot().bytes === 0 &&
      queue.snapshot().snapshotBytes === 0 &&
      active === 0 &&
      peak === 1,
    "A cache or Worker lease leaked.",
  );
  clearProductSpecialistRecipeReuseCache();
  window.__scene3dRecipeFixture = [...source];
  window.__scene3dRecipeClear = clearProductSpecialistRecipeReuseCache;
  window.__scene3dRecipeMetrics = () => ({
    started,
    active,
    peak,
    cache: getProductSpecialistRecipeReuseCache().snapshot(),
    queue: scene3dSpecialistJobQueue.snapshot(),
  });
  const host = document.createElement("main");
  host.style.cssText = "max-width:720px;margin:20px auto;font-family:system-ui";
  document.body.append(host);
  createRoot(host).render(<StudioScene3dAssetToolsPanel />);
  return {
    status: "ok",
    runtime: "actual built processing Worker under deployment CSP",
    model: "synthetic sphere; no universal speed claim",
    first: {
      milliseconds: first.elapsedMilliseconds,
      workers: first.workersCreated,
      phases: first.phases,
    },
    repeated: {
      milliseconds: repeated.elapsedMilliseconds,
      workers: repeated.workersCreated,
      phases: repeated.phases,
    },
    changedOptions: { workers: changedOptions.workersCreated },
    changedSource: { workers: changedSource.workersCreated },
    afterClear: { workers: afterClear.workersCreated },
    artifactSha256: expected,
    sourceUnchanged: true,
    queuedDuplicate: {
      workers: 1,
      phases: queuedPhases,
      cancelledThirdCreatedNoWorker: true,
    },
    privateCacheBeforeClear: snapshotBeforeClear,
    privateCacheAfterClear: cache.snapshot(),
    queueAfter: queue.snapshot(),
    startedBeforeUi: started,
    peakProcessingWorkers: peak,
  };
}
void verify()
  .then((result) => {
    window.__scene3dRecipeProof = result;
  })
  .catch((error: unknown) => {
    window.__scene3dRecipeProof = {
      status: "failed",
      message: String(error),
      stack: error instanceof Error ? error.stack : null,
    };
  });
