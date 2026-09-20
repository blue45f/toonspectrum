import { captureStudioBg3dRaster } from "./studio-bg3d-capture-adapter";
import {
  createStudioBg3dTilePlan,
  STUDIO_BG3D_TILE_PROFILE,
} from "./studio-bg3d-tile-plan";
import { validateStudioBg3dTiledOptions } from "./studio-bg3d-tiled-artifact-contract";
import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import type {
  StudioBg3dTiledArtifactOptions,
  StudioBg3dTiledArtifactResult,
  StudioBg3dTiledRequest,
} from "./studio-bg3d-tiled-artifact-contract";

let nextId = 1;
export interface StudioBg3dTiledWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(value: StudioBg3dTiledRequest, transfer?: Transferable[]): void;
  terminate(): void;
}
function aborted(): Error {
  return Object.assign(new Error("Tiled output cancelled."), {
    name: "AbortError",
  });
}
function timeout(): Error {
  return Object.assign(new Error("Tiled output phase timed out."), {
    name: "TimeoutError",
  });
}
function assertResult(
  value: unknown,
  options: StudioBg3dTiledArtifactOptions,
): asserts value is StudioBg3dTiledArtifactResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid tiled result.");
  if (Object.keys(value).sort().join(",") !== "images,skipped")
    throw new Error("Invalid tiled result fields.");
  const result = value as Partial<StudioBg3dTiledArtifactResult>;
  if (
    !Array.isArray(result.images) ||
    !Array.isArray(result.skipped) ||
    result.images.length + result.skipped.length !== options.passes.length
  )
    throw new Error("Incomplete tiled pass results.");
  const seen = new Set<string>();
  let bytes = 0;
  for (const image of result.images) {
    if (
      !image ||
      !options.passes.includes(image.pass) ||
      seen.has(image.pass) ||
      !(image.png instanceof Blob) ||
      image.png.type !== "image/png" ||
      image.png.size < 57 ||
      image.png.size > 24 * 1024 * 1024
    )
      throw new Error("Invalid tiled PNG response.");
    bytes += image.png.size;
    seen.add(image.pass);
  }
  for (const skipped of result.skipped) {
    if (
      !skipped ||
      !options.passes.includes(skipped.pass) ||
      seen.has(skipped.pass) ||
      !["disabled", "unavailable"].includes(skipped.reason)
    )
      throw new Error("Invalid skipped tiled pass.");
    seen.add(skipped.pass);
  }
  if (bytes > 7 * 24 * 1024 * 1024)
    throw new Error("Tiled output aggregate budget exceeded.");
}
/** Backpressure: one GPU tile followed by one acknowledged worker tile; never enqueue all readbacks. */
export async function buildStudioBg3dTiledImages(input: {
  readonly adapter: StudioBg3dCaptureAdapter;
  readonly options: StudioBg3dTiledArtifactOptions;
  readonly background: { readonly color: string; readonly alpha: number };
  readonly includeDepth: boolean;
  readonly includeNormals: boolean;
  readonly signal?: AbortSignal;
  readonly assertCurrent?: () => void | Promise<void>;
  readonly onProgress?: (completed: number, total: number) => void;
  readonly workerFactory?: () => StudioBg3dTiledWorkerLike;
  readonly timeoutMs?: number;
}): Promise<StudioBg3dTiledArtifactResult> {
  if (input.signal?.aborted) throw aborted();
  const { options } = validateStudioBg3dTiledOptions({
    ...input.options,
    includeDepth: input.includeDepth,
    includeNormals: input.includeNormals,
  });
  // Snapshot canonical setting records; queued UI edits must not change an output's meaning.
  const ownedOptions = structuredClone(options);
  const background = { ...input.background };
  const plan = createStudioBg3dTilePlan(ownedOptions);
  if (!input.adapter.createTiledCapture)
    throw new Error("This renderer does not support exact tiled capture.");
  const session = input.adapter.createTiledCapture();
  if (session.profile !== STUDIO_BG3D_TILE_PROFILE) {
    session.dispose();
    throw new Error("Unsupported tiled projection profile.");
  }
  let worker: StudioBg3dTiledWorkerLike | undefined;
  let closeWait: ((error: Error) => void) | undefined;
  let stopped = false;
  const id = nextId;
  nextId = nextId >= Number.MAX_SAFE_INTEGER ? 1 : nextId + 1;
  const deadline = input.timeoutMs ?? 30_000;
  if (!Number.isFinite(deadline) || deadline < 100 || deadline > 120_000) {
    session.dispose();
    throw new RangeError("Invalid tiled output timeout.");
  }
  const abort = () => {
    stopped = true;
    worker?.terminate();
    closeWait?.(aborted());
    session.dispose();
  };
  input.signal?.addEventListener("abort", abort, { once: true });
  const checkpoint = async () => {
    if (stopped || input.signal?.aborted) throw aborted();
    await input.assertCurrent?.();
    if (stopped || input.signal?.aborted) throw aborted();
  };
  try {
    worker = input.workerFactory
      ? input.workerFactory()
      : new Worker(
          new URL("./studio-bg3d-tiled-artifact.worker.ts", import.meta.url),
          { type: "module", name: "toonspectrum-tiled-shot" },
        );
    const exchange = (
      message: StudioBg3dTiledRequest,
      expected: "ready" | "ack" | "result",
      transfers: Transferable[] = [],
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        if (stopped) {
          reject(aborted());
          return;
        }
        const timer = setTimeout(() => end(timeout()), deadline);
        let done = false;
        const end = (error: Error | null, value?: unknown) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          closeWait = undefined;
          if (error) reject(error);
          else resolve(value);
        };
        closeWait = (error) => end(error);
        worker!.onerror = () =>
          end(new Error("Tiled processing Worker failed."));
        worker!.onmessageerror = () =>
          end(new Error("Unreadable tiled Worker response."));
        worker!.onmessage = (event) => {
          const value = event.data as {
            version?: unknown;
            id?: unknown;
            kind?: unknown;
            index?: unknown;
            result?: unknown;
            message?: unknown;
            code?: unknown;
          } | null;
          if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            value.version !== 1 ||
            value.id !== id
          ) {
            end(new Error("Mismatched tiled Worker response."));
            return;
          }
          if (value.kind === "error") {
            const message =
              typeof value.message === "string"
                ? value.message.slice(0, 1024)
                : "Tiled output failed.";
            end(
              value.code === "budget"
                ? new RangeError(message)
                : new Error(message),
            );
            return;
          }
          if (
            value.kind !== expected ||
            (message.kind === "tile" && value.index !== message.index)
          ) {
            end(new Error("Out-of-order tiled Worker response."));
            return;
          }
          const allowed =
            expected === "ack"
              ? "id,index,kind,version"
              : expected === "result"
                ? "id,kind,result,version"
                : "id,kind,version";
          if (Object.keys(value).sort().join(",") !== allowed) {
            end(new Error("Unexpected tiled Worker response fields."));
            return;
          }
          end(null, value.result);
        };
        try {
          worker!.postMessage(message, transfers);
        } catch (error) {
          end(
            error instanceof Error
              ? error
              : new Error("Unable to send output tile."),
          );
        }
      });
    await checkpoint();
    await exchange(
      { version: 1, id, kind: "init", options: ownedOptions },
      "ready",
    );
    for (const tile of plan.tiles) {
      await checkpoint();
      const adapter: StudioBg3dCaptureAdapter = {
        ...input.adapter,
        capture: (request) => session.capture(request, tile.capture),
      };
      const raster = await captureStudioBg3dRaster(
        adapter,
        {
          width: tile.capture.width,
          height: tile.capture.height,
          background,
          includeDepth: input.includeDepth,
          ...(input.includeNormals ? { includeNormals: true } : {}),
        },
        { signal: input.signal, timeoutMs: deadline },
      );
      await checkpoint();
      const transfers = [
        raster.rgba.buffer,
        ...(raster.depth ? [raster.depth.buffer] : []),
        ...(raster.normalRgba ? [raster.normalRgba.buffer] : []),
      ] as ArrayBuffer[];
      await exchange(
        { version: 1, id, kind: "tile", index: tile.index, raster },
        "ack",
        [...new Set(transfers)],
      );
      try {
        input.onProgress?.(tile.index + 1, plan.tiles.length);
      } catch {
        /* UI has no cleanup authority. */
      }
    }
    await checkpoint();
    const result = await exchange({ version: 1, id, kind: "finish" }, "result");
    assertResult(result, ownedOptions);
    for (const image of result.images) {
      const header = new Uint8Array(await image.png.slice(0, 33).arrayBuffer());
      const view = new DataView(header.buffer);
      if (
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => header[index] === value,
        ) ||
        view.getUint32(8) !== 13 ||
        view.getUint32(12) !== 0x49484452 ||
        view.getUint32(16) !== plan.width ||
        view.getUint32(20) !== plan.height ||
        header[24] !== 8 ||
        header[25] !== 6
      )
        throw new Error("PNG header does not match the frozen output plan.");
    }
    await checkpoint();
    return result;
  } finally {
    stopped = true;
    input.signal?.removeEventListener("abort", abort);
    worker?.terminate();
    session.dispose();
    closeWait?.(aborted());
    closeWait = undefined;
  }
}
