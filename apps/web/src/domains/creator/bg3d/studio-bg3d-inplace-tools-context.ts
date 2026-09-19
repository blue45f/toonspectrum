import type { RefObject } from "react";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type {
  StudioBg3dCanonicalDocumentSnapshot,
  StudioBg3dCanonicalDocumentMutation,
} from "./useStudioBg3dCanonicalDocumentState";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";
import type { StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";

export interface StudioBg3dInplaceToolsContext {
  readonly live: RefObject<StudioBg3dCanonicalDocumentSnapshot>;
  readonly selectionEpoch?: number;
  readonly selectedIds: ReadonlySet<string>;
  readonly session: StudioBg3dModalSession | null;
  readonly ready: boolean;
  readonly renderer: StudioBg3dKtx2Renderer | null;
  readonly quality: StudioBg3dResolvedDeviceQuality;
  readonly cache: Map<string, StudioBg3dModelRootCacheEntry>;
  readonly attachments: Map<string, StudioBg3dModelAttachment>;
  readonly storageIds: Map<string, string>;
  isSessionCurrent(session: StudioBg3dModalSession): boolean;
  isBlocked(): boolean;
  replace(
    mutation: StudioBg3dCanonicalDocumentMutation,
  ): StudioBg3dCanonicalDocumentSnapshot;
  commitHistory(
    primitives: readonly BgPrimitive[],
    models: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before: StudioBg3dHistorySnapshot,
    options: { commandId: string; label: string; source: "inspector" },
  ): void;
  notify(): void;
}
