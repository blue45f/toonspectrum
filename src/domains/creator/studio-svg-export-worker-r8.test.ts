// @vitest-environment node

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
} from "./studio-brush-dynamics";
import {
  hydrateStudioBrushR8GrainAsset,
  resetStudioBrushR8GrainRegistry,
  resolveStudioBrushR8GrainSampler,
  studioBrushR8GrainRegistryStats,
} from "./studio-brush-r8-grain-runtime";
import { sha256HexPortable } from "./studio-sha256";
import {
  prepareStudioSvgExportWorkerR8Transfer,
  runStudioSvgExportWorker,
  type StudioSvgExportWorkerLike,
} from "./studio-svg-export-worker-client";
import {
  collectStudioSvgExportReferencedR8GrainSources,
  STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
  type StudioSvgExportWorkerResponseMessage,
  type StudioSvgExportWorkerRunMessage,
} from "./studio-svg-export-worker-protocol";

import type { StudioBrushR8TextureGrainSource } from "./studio-brush-r8-grain-asset-contract";
import type { SvgExportPageInput, SvgExportResult } from "./studio-svg-export";

const decodedBytes = new Uint8Array([
  0, 64,
  192, 255,
]);

function r8Source(assetId = "paper.worker-r8.v1"): StudioBrushR8TextureGrainSource {
  return {
    kind: "r8-texture-v1",
    asset: {
      assetId,
      encodedSha256: `sha256:${"e".repeat(64)}`,
      decodedSha256: `sha256:${sha256HexPortable(decodedBytes)}`,
      byteLength: 128,
      mediaType: "image/png",
      width: 2,
      height: 2,
      channel: "luminance",
      encoding: "r8-unorm",
    },
  };
}

function r8ExportInput(
  source = r8Source(),
  duplicate = false,
): SvgExportPageInput {
  const draw = (id: string) => ({
    id,
    type: "draw" as const,
    kind: "freehand" as const,
    mode: "pen" as const,
    brush: "dry-media",
    points: [8, 16, 26, 18, 48, 12],
    pressures: [0.4, 0.8, 0.6],
    stroke: "#263a54",
    strokeWidth: 12,
    opacity: 1,
    brushDynamics: normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      seed: 77,
      grain: {
        amount: 0.8,
        scale: 12,
        contrast: 0.45,
        source,
      },
      spacingRatio: 0.2,
      spacing: { base: 2.4 },
    }),
  });
  return {
    width: 64,
    height: 40,
    transparentBg: true,
    elements: duplicate ? [draw("r8-a"), draw("r8-b")] : [draw("r8-a")],
  };
}

const successResult: SvgExportResult = {
  svg: "<svg/>",
  skipped: [],
  fontFamilies: [],
  caveats: [],
  elementCount: 1,
};

function workerRunEvent(
  data: StudioSvgExportWorkerRunMessage,
): MessageEvent<StudioSvgExportWorkerRunMessage> {
  return { data } as unknown as MessageEvent<StudioSvgExportWorkerRunMessage>;
}

class ReadySvgWorker implements StudioSvgExportWorkerLike {
  onmessage: StudioSvgExportWorkerLike["onmessage"] = null;
  onerror: StudioSvgExportWorkerLike["onerror"] = null;
  posted: StudioSvgExportWorkerRunMessage | null = null;
  transferred: ArrayBuffer[] = [];
  bytesSeenDuringPost: number[] = [];
  terminated = false;

  constructor(private readonly throwOnPost = false) {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "studio-svg-export/ready",
          version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
        },
      } as MessageEvent<StudioSvgExportWorkerResponseMessage>);
    });
  }

  postMessage(message: StudioSvgExportWorkerRunMessage, transfer: ArrayBuffer[]): void {
    this.posted = message;
    this.transferred = transfer;
    this.bytesSeenDuringPost = message.r8GrainAssets.flatMap((entry) => [...entry.decodedBytes]);
    if (this.throwOnPost) throw new Error("postMessage blocked");
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "studio-svg-export/success",
          version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
          result: successResult,
        },
      } as MessageEvent<StudioSvgExportWorkerResponseMessage>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("SVG export Worker R8 transfer protocol", () => {
  afterEach(() => {
    resetStudioBrushR8GrainRegistry();
  });

  it("collects only canonical draw references and deduplicates identical sources", () => {
    const source = r8Source();
    const input = r8ExportInput(source, true);
    let accessorRead = false;
    const poisonedDynamics = Object.defineProperty({}, "grain", {
      enumerable: true,
      get: () => {
        accessorRead = true;
        return { source };
      },
    });
    const sources = collectStudioSvgExportReferencedR8GrainSources({
      ...input,
      elements: [
        ...input.elements,
        {
          id: "not-a-draw",
          type: "image",
          src: "",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          brushDynamics: { grain: { source } },
        } as never,
        {
          id: "poisoned",
          type: "draw",
          points: [0, 0, 1, 1],
          stroke: "#000000",
          strokeWidth: 1,
          brushDynamics: poisonedDynamics,
        } as never,
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.source.asset.assetId).toBe(source.asset.assetId);
    expect(accessorRead).toBe(false);
  });

  it("copies only referenced verified bytes and posts their exact private buffers", async () => {
    const source = r8Source();
    const unrelated = r8Source("paper.unrelated.v1");
    expect(hydrateStudioBrushR8GrainAsset(source, decodedBytes).status).toBe("ready");
    expect(hydrateStudioBrushR8GrainAsset(unrelated, decodedBytes).status).toBe("ready");
    const input = r8ExportInput(source, true);
    const prepared = prepareStudioSvgExportWorkerR8Transfer(input);

    expect(prepared.entries).toHaveLength(1);
    expect(prepared.entries[0]?.decodedBytes).not.toBe(decodedBytes);
    expect([...prepared.entries[0]!.decodedBytes]).toEqual([...decodedBytes]);
    expect(prepared.buffers).toEqual([prepared.entries[0]!.decodedBytes.buffer]);

    const worker = new ReadySvgWorker();
    const result = await runStudioSvgExportWorker(input, { workerFactory: () => worker });

    expect(result).toEqual({ execution: "worker", result: successResult });
    expect(worker.posted?.r8GrainAssets).toHaveLength(1);
    expect(worker.transferred).toEqual([worker.posted!.r8GrainAssets[0]!.decodedBytes.buffer]);
    expect(worker.bytesSeenDuringPost).toEqual([...decodedBytes]);
    expect(worker.terminated).toBe(true);
    // The fake does not detach like a real Worker, so cleanup must explicitly zero this private copy.
    expect([...worker.posted!.r8GrainAssets[0]!.decodedBytes]).toEqual([0, 0, 0, 0]);
    // Transfer cleanup must never clear or release the authoritative main-realm registry entry.
    expect(resolveStudioBrushR8GrainSampler(source)).not.toBeNull();
    expect(resolveStudioBrushR8GrainSampler(unrelated)).not.toBeNull();
  });

  it("keeps the main registry available when postMessage falls back to direct export", async () => {
    const source = r8Source();
    expect(hydrateStudioBrushR8GrainAsset(source, decodedBytes).status).toBe("ready");
    const worker = new ReadySvgWorker(true);

    const result = await runStudioSvgExportWorker(r8ExportInput(source), {
      workerFactory: () => worker,
    });

    expect(result.execution).toBe("direct");
    expect(result.result.skipped).toEqual([]);
    expect(resolveStudioBrushR8GrainSampler(source)).not.toBeNull();
    expect(worker.terminated).toBe(true);
    expect([...worker.posted!.r8GrainAssets[0]!.decodedBytes]).toEqual([0, 0, 0, 0]);
  });
});

describe("short-lived SVG export Worker R8 hydration", () => {
  const originalPostMessage = Object.getOwnPropertyDescriptor(globalThis, "postMessage");
  const originalOnMessage = Object.getOwnPropertyDescriptor(globalThis, "onmessage");
  const responses: StudioSvgExportWorkerResponseMessage[] = [];
  let workerHandler:
    | ((event: MessageEvent<StudioSvgExportWorkerRunMessage>) => Promise<void>)
    | null = null;

  beforeAll(async () => {
    Object.defineProperty(globalThis, "postMessage", {
      configurable: true,
      writable: true,
      value: (message: StudioSvgExportWorkerResponseMessage) => {
        responses.push(message);
      },
    });
    await import("./studio-svg-export.worker");
    workerHandler = globalThis.onmessage as typeof workerHandler;
    responses.length = 0; // discard module ready
  });

  afterAll(() => {
    if (originalPostMessage) {
      Object.defineProperty(globalThis, "postMessage", originalPostMessage);
    } else {
      Reflect.deleteProperty(globalThis, "postMessage");
    }
    if (originalOnMessage) {
      Object.defineProperty(globalThis, "onmessage", originalOnMessage);
    } else {
      Reflect.deleteProperty(globalThis, "onmessage");
    }
  });

  afterEach(() => {
    responses.length = 0;
    resetStudioBrushR8GrainRegistry();
  });

  it("hydrates a referenced verified snapshot, exports, then resets and zeroizes", async () => {
    const source = r8Source();
    expect(hydrateStudioBrushR8GrainAsset(source, decodedBytes).status).toBe("ready");
    const input = r8ExportInput(source);
    const transfer = prepareStudioSvgExportWorkerR8Transfer(input);
    expect(transfer.entries).toHaveLength(1);

    await workerHandler?.(workerRunEvent({
        type: "studio-svg-export/run",
        version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
        input,
        r8GrainAssets: transfer.entries,
    }));

    expect(responses).toHaveLength(1);
    expect(responses[0]?.type).toBe("studio-svg-export/success");
    if (responses[0]?.type === "studio-svg-export/success") {
      expect(responses[0].result.skipped).toEqual([]);
    }
    expect([...transfer.entries[0]!.decodedBytes]).toEqual([0, 0, 0, 0]);
    expect(studioBrushR8GrainRegistryStats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  it("preserves the existing fail-closed caveat for a missing R8 snapshot", async () => {
    const input = r8ExportInput();
    await workerHandler?.(workerRunEvent({
        type: "studio-svg-export/run",
        version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
        input,
        r8GrainAssets: [],
    }));

    expect(responses).toHaveLength(1);
    expect(responses[0]?.type).toBe("studio-svg-export/success");
    if (responses[0]?.type === "studio-svg-export/success") {
      expect(responses[0].result.skipped).toHaveLength(1);
      expect(responses[0].result.svg).not.toContain("r8-a");
    }
    expect(studioBrushR8GrainRegistryStats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  it("rejects modified decoded bytes without retaining or substituting them", async () => {
    const source = r8Source();
    const input = r8ExportInput(source);
    const modified = new Uint8Array(decodedBytes).fill(7);
    const sourceKey = collectStudioSvgExportReferencedR8GrainSources(input)[0]!.sourceKey;
    await workerHandler?.(workerRunEvent({
        type: "studio-svg-export/run",
        version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
        input,
        r8GrainAssets: [{ sourceKey, source, decodedBytes: modified }],
    }));

    expect(responses).toHaveLength(1);
    expect(responses[0]?.type).toBe("studio-svg-export/success");
    if (responses[0]?.type === "studio-svg-export/success") {
      expect(responses[0].result.skipped).toHaveLength(1);
    }
    expect([...modified]).toEqual([0, 0, 0, 0]);
    expect(studioBrushR8GrainRegistryStats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  it("fails the whole hydration envelope closed above the entry ceiling", async () => {
    const source = r8Source();
    const input = r8ExportInput(source);
    const sourceKey = collectStudioSvgExportReferencedR8GrainSources(input)[0]!.sourceKey;
    const overBudgetEntries = Array.from({ length: 33 }, () => ({
      sourceKey,
      source,
      decodedBytes: new Uint8Array(decodedBytes),
    }));

    await workerHandler?.(workerRunEvent({
      type: "studio-svg-export/run",
      version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
      input,
      r8GrainAssets: overBudgetEntries,
    }));

    expect(responses).toHaveLength(1);
    expect(responses[0]?.type).toBe("studio-svg-export/success");
    if (responses[0]?.type === "studio-svg-export/success") {
      expect(responses[0].result.skipped).toHaveLength(1);
    }
    expect(overBudgetEntries.every(
      (entry) => entry.decodedBytes.every((value) => value === 0),
    )).toBe(true);
    expect(studioBrushR8GrainRegistryStats()).toMatchObject({ entries: 0, bytes: 0 });
  });
});
