import { NATIVE_BRUSH_PROBE_SURFACE, validateNativeBrushSurface, validateNativeBrushDocumentOutput } from "./studio-native-brush-probe-contract";

import type { NativeBrushProbeOperation, NativeBrushProbeReply, NativeBrushSurface } from "./studio-native-brush-probe-contract";

export interface NativeBrushProbeWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: (event: MessageEvent | Event) => void): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: (event: MessageEvent | Event) => void): void;
}
function releaseFrame(reply: NativeBrushProbeReply | undefined) {
  if (reply?.type === "frame" && reply.frame?.kind === "bitmap") reply.frame.bitmap?.close?.();
}
function validFrame(reply: Extract<NativeBrushProbeReply, { type: "frame" }>, surface: NativeBrushSurface): boolean {
  if (!Number.isSafeInteger(reply.samples) || reply.samples < 0 || reply.samples > 8192) return false;
  const frame = reply.frame;
  if (frame === null) return true;
  if (frame?.kind === "bitmap") return Boolean(frame.bitmap && frame.bitmap.width === surface.width && frame.bitmap.height === surface.height && typeof frame.bitmap.close === "function");
  return frame?.kind === "pixels" && [frame.x, frame.y, frame.width, frame.height].every(Number.isSafeInteger)
    && frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0
    && frame.x + frame.width <= surface.width && frame.y + frame.height <= surface.height
    && frame.pixels instanceof Uint8Array && frame.pixels.byteLength === frame.width * frame.height * 4;
}
/** Exactly one in-flight request. Caller owns input batching; no input is silently dropped here. */
export class StudioNativeBrushProbeClient {
  private nextId = 1;
  private disposed = false;
  private engine: string | null = null;
  private surface: NativeBrushSurface = NATIVE_BRUSH_PROBE_SURFACE;
  private pending: {
    id: number; operation: NativeBrushProbeOperation["type"];
    resolve(value: NativeBrushProbeReply): void; reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor(private readonly worker: NativeBrushProbeWorkerPort, private readonly timeoutMs = 30_000) {
    worker.addEventListener("message", this.onMessage);
    worker.addEventListener("error", this.onError);
    worker.addEventListener("messageerror", this.onError);
  }
  private onError = () => { this.dispose(new Error("시험 엔진 Worker를 사용할 수 없습니다. 시험 시작을 다시 눌러주세요.")); };
  private onMessage = (event: MessageEvent | Event) => {
    const reply = (event as MessageEvent<NativeBrushProbeReply>).data;
    const pending = this.pending;
    if (!pending || !reply || reply.version !== 1 || reply.id !== pending.id) { releaseFrame(reply); return; }
    this.pending = null; clearTimeout(pending.timer);
    if (reply.type === "error") { pending.reject(new Error(String(reply.message))); this.dispose(); return; }
    const expected = pending.operation === "init" ? "ready" : pending.operation === "begin" ? "begun" : pending.operation === "render-document" ? "document" : "frame";
    if (reply.engine !== this.engine || reply.type !== expected
      || (reply.type === "frame" && (!validFrame(reply, this.surface) || reply.finished !== (pending.operation === "finish")))
      || (reply.type === "document" && !validateNativeBrushDocumentOutput(reply, this.surface))
    ) {
      releaseFrame(reply); pending.reject(new Error("시험 엔진이 잘못된 응답을 반환했습니다.")); this.dispose(); return;
    }
    pending.resolve(reply);
  };
  request(operation: NativeBrushProbeOperation): Promise<NativeBrushProbeReply> {
    if (this.disposed) return Promise.reject(new Error("Native brush test client is disposed"));
    if (this.pending) return Promise.reject(new Error("Native brush test request already in flight"));
    if (operation.type === "init" || (operation.type === "render-document" && operation.surface)) {
      const surface = operation.surface ?? NATIVE_BRUSH_PROBE_SURFACE;
      try { validateNativeBrushSurface(surface); } catch (error) { return Promise.reject(error); }
      if (operation.type === "init") this.engine = operation.engine;
      this.surface = { ...surface };
    }
    if (!Number.isSafeInteger(this.nextId)) return Promise.reject(new Error("Native brush request sequence exhausted"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(new Error("시험 엔진 응답 시간이 초과되었습니다.")), this.timeoutMs);
      this.pending = { id, operation: operation.type, resolve, reject, timer };
      try { this.worker.postMessage({ ...operation, version: 1, id }); }
      catch (error) { this.dispose(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  dispose(reason = new Error("Native brush test client is disposed")): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.removeEventListener("messageerror", this.onError);
    this.worker.terminate();
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(reason); }
  }
}
export function createStudioNativeBrushProbeClient(): StudioNativeBrushProbeClient {
  if (typeof Worker === "undefined") throw new Error("이 브라우저는 Worker 시험 캔버스를 지원하지 않습니다.");
  return new StudioNativeBrushProbeClient(new Worker(new URL("./studio-native-brush-probe.worker.ts", import.meta.url), { type: "module" }));
}
