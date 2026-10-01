import { SumiError } from "../engine/core/errors";

import type { LabImage } from "../engine/core/types";

/**
 * 갤러리 렌더 Worker 클라이언트. 요청마다 id를 붙여 응답을 매칭하고,
 * Worker 오류·종료는 대기 중인 요청 전부를 reject한다(무음 대체 없음).
 * Worker 생성 자체는 `app/workers/create-gallery-worker.ts`가 맡는다(Vite URL 규약).
 */

export interface GalleryFamilyVerdict {
  key: string;
  value: number | null;
  op: ">=" | "<=";
  threshold: number;
  verdict: "PASS" | "FAIL" | "UNAVAILABLE";
}

export interface GalleryRenderResult {
  presetId: string;
  fixtureId: string;
  image: LabImage;
  /** fnv1a64(픽셀) — 결정성 해시. */
  pixelHash: string;
  renderMs: number;
  dabCount: number;
  family: GalleryFamilyVerdict[];
}

export interface GalleryRenderRequestMessage {
  type: "render";
  id: number;
  presetId: string;
  fixtureId: string;
  size: number;
}

export type GalleryRenderResponseMessage =
  | {
      type: "result";
      id: number;
      presetId: string;
      fixtureId: string;
      width: number;
      height: number;
      data: Uint8ClampedArray;
      pixelHash: string;
      renderMs: number;
      dabCount: number;
      family: GalleryFamilyVerdict[];
    }
  | { type: "error"; id: number; code: string; message: string };

/** `Worker`의 부분 집합. 테스트는 모의 객체를 넘긴다. */
export interface WorkerLike {
  postMessage(message: GalleryRenderRequestMessage, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
  addEventListener(type: "error", listener: (ev: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
  removeEventListener(type: "error", listener: (ev: ErrorEvent) => void): void;
  terminate(): void;
}

/** 갤러리가 의존하는 렌더러 계약. Worker 클라이언트와 테스트 모의가 모두 구현한다. */
export interface GalleryRenderer {
  render(presetId: string, fixtureId: string, size: number): Promise<GalleryRenderResult>;
  dispose(): void;
}

interface Pending {
  resolve: (r: GalleryRenderResult) => void;
  reject: (e: Error) => void;
}

function isResponse(value: unknown): value is GalleryRenderResponseMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; id?: unknown };
  return (v.type === "result" || v.type === "error") && typeof v.id === "number";
}

export class GalleryWorkerClient implements GalleryRenderer {
  private readonly worker: WorkerLike;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private disposed = false;

  private readonly onMessage = (ev: MessageEvent): void => {
    const msg: unknown = ev.data;
    if (!isResponse(msg)) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.type === "error") {
      entry.reject(new SumiError(msg.code, msg.message));
      return;
    }
    entry.resolve({
      presetId: msg.presetId,
      fixtureId: msg.fixtureId,
      image: { width: msg.width, height: msg.height, data: msg.data },
      pixelHash: msg.pixelHash,
      renderMs: msg.renderMs,
      dabCount: msg.dabCount,
      family: msg.family,
    });
  };

  private readonly onError = (ev: ErrorEvent): void => {
    const message = typeof ev.message === "string" && ev.message ? ev.message : "Worker 오류";
    this.rejectAll(new SumiError("worker-error", message));
  };

  constructor(worker: WorkerLike) {
    this.worker = worker;
    worker.addEventListener("message", this.onMessage);
    worker.addEventListener("error", this.onError);
  }

  render(presetId: string, fixtureId: string, size: number): Promise<GalleryRenderResult> {
    if (this.disposed) {
      return Promise.reject(new SumiError("worker-disposed", "갤러리 Worker가 이미 종료됐다"));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<GalleryRenderResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "render", id, presetId, fixtureId, size });
    });
  }

  /** 대기 중 요청 수(테스트·진단용). */
  pendingCount(): number {
    return this.pending.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAll(new SumiError("worker-disposed", "갤러리 Worker가 종료됐다"));
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.terminate();
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}
