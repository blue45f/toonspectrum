/**
 * Renderer-neutral payload contracts produced by Studio's lazy 3D editors.
 *
 * These values cross from the heavyweight Three/React capture surfaces into the document insert
 * controller. Keep this leaf type-only so insertion policy never points back at those components.
 */

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioVrmSceneDocument } from "./studio-vrm-scene-document";

export type StudioBg3dLtRasterLayerRole =
  | "color"
  | "main-line"
  | "texture-line"
  | "tone";

export interface StudioBackground3DLtLayer {
  readonly role: StudioBg3dLtRasterLayerRole;
  readonly pngDataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioBackground3DInsertResult {
  readonly kind: "separated";
  readonly width: number;
  readonly height: number;
  /** Back-to-front paint order: color/tone, texture line, main line. */
  readonly layers: readonly StudioBackground3DLtLayer[];
  /** Flattened fallback for document surfaces that intentionally do not support layer groups. */
  readonly compositePngDataUrl: string;
  /** Finite camera vanishing points normalized to the captured image placement. */
  readonly perspectiveGuides: readonly {
    readonly axis: "world-x" | "world-y" | "world-z";
    readonly x: number;
    readonly y: number;
  }[];
  readonly bg3dScene: StudioBg3dSceneDocument;
}

export type StudioVrmPoserInsertResult = {
  pngDataUrl: string;
  width: number;
  height: number;
  scene: StudioVrmSceneDocument;
};
