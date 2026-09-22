import type { ColorIR, SceneNodeIR } from "@toonspectrum/studio-project-model";

export const SKIA_DOCUMENT_MAX_BACKING_DIMENSION = 8192;
export const SKIA_DOCUMENT_MAX_BACKING_PIXELS = 16_777_216;

export interface SkiaDocumentInk {
  /** Immutable document-space x, y, radius triples. */
  readonly dabs: Float32Array;
  readonly color: ColorIR;
  readonly opacity: number;
  readonly union: boolean;
  readonly erase?: boolean;
  readonly nib?: { readonly aspect: number; readonly angleRad: number };
}
export interface SkiaDocumentPanel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: ColorIR;
  readonly stroke: ColorIR;
  readonly strokeWidth: number;
  readonly radius: number;
  readonly dashed: boolean;
  readonly points?: readonly number[];
  readonly shadow?: { readonly blur: number; readonly opacity: number; readonly x: number; readonly y: number };
}
export interface SkiaDocumentClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface SkiaDocumentItem {
  readonly id: string;
  readonly revision: object;
  readonly nodes?: readonly SceneNodeIR[];
  readonly ink?: SkiaDocumentInk;
  readonly panel?: SkiaDocumentPanel;
  /** Existing document panel semantics: axis-aligned child clip in document coordinates. */
  readonly clip?: SkiaDocumentClip;
}
export interface SkiaDocumentFrame {
  readonly revision: object;
  readonly items: readonly SkiaDocumentItem[];
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly camera: { readonly scaleX: number; readonly scaleY: number; readonly rotation: number; readonly offsetX: number; readonly offsetY: number };
}
export interface SkiaDocumentStats {
  readonly compiledItems: number;
  readonly compiledBatches: number;
  readonly cachedBatches: number;
  readonly paintedItems: number;
  readonly presentation: "cached" | "append" | "restored" | "full";
  readonly retainedSnapshotBytes: number;
  readonly cachedItems: number;
  readonly pictureBytes: number;
  readonly gpuCacheBytes: number | null;
  readonly frameMs: number;
  readonly interactiveReadbacks: 0;
}
export type SkiaDocumentReceipt =
  | { readonly status: "presented"; readonly revision: object; readonly stats: SkiaDocumentStats }
  | { readonly status: "superseded" | "disposed"; readonly revision: object }
  | { readonly status: "unavailable"; readonly revision: object; readonly reason: string };
export interface SkiaDocumentRenderer {
  present(frame: SkiaDocumentFrame): Promise<SkiaDocumentReceipt>;
  dispose(): void;
}
