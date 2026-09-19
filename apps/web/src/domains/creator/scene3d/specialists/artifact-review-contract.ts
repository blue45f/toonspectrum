import type { SpecialistStats } from "./specialist-contract";

export type ArtifactReviewMode = "result" | "source" | "wipe";
export interface ArtifactReviewSource {
  readonly label: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly stats: SpecialistStats;
}
export interface ArtifactReviewFrame {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}
export interface ArtifactReviewMeasurement {
  readonly sourceSize: readonly [number, number, number];
  readonly resultSize: readonly [number, number, number];
  readonly centerShift: number;
  readonly sourceTriangles: number;
  readonly resultTriangles: number;
}
export interface ArtifactReviewControls {
  fit(): void;
  zoom(factor: number): void;
  orient(view: "front" | "right" | "top" | "iso"): void;
  setMode(mode: ArtifactReviewMode): void;
  setDivider(fraction: number): void;
  setWireframe(enabled: boolean): void;
  dispose(): void;
}
export const ARTIFACT_REVIEW_LIMITS = Object.freeze({
  // Estimates for one local inspection pair, NOT a total browser/VRAM guarantee.
  encodedBytes: 128 * 1024 * 1024,
  decodedEstimateBytes: 256 * 1024 * 1024,
  imageEstimateBytes: 64 * 1024 * 1024,
  triangles: 2_000_000,
});
