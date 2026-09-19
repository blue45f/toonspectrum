import type {
  SpecialistArtifact,
  SpecialistResult,
} from "../specialists/specialist-contract";

/** Deliberately narrower than standalone derivative support: no rig/topology remapping claims. */
export const SCENE3D_INPLACE_OPERATIONS = [
  "compress",
  "lod",
  "tangents",
  "textures",
  "release",
] as const;
export type Scene3dInplaceOperation =
  (typeof SCENE3D_INPLACE_OPERATIONS)[number];
export interface Scene3dSelectedAssetInput {
  readonly bindingId: string;
  readonly entityId: string;
  readonly label: string;
  readonly sourceSha256: string;
  readonly source: ArrayBuffer;
}
export interface Scene3dInplaceReceipt {
  readonly status: "applied";
  readonly entityId: string;
  readonly sourceSha256: string;
  readonly derivativeSha256: string;
  readonly commandId: string;
}
export interface Scene3dInplaceToolsBridge {
  describeSelection(): {
    readonly available: boolean;
    readonly label: string;
    readonly reason: string | null;
  };
  captureSelection(signal?: AbortSignal): Promise<Scene3dSelectedAssetInput>;
  apply(
    input: Scene3dSelectedAssetInput,
    result: SpecialistResult,
    artifact: SpecialistArtifact,
    signal?: AbortSignal,
  ): Promise<Scene3dInplaceReceipt>;
}
export class Scene3dInplaceError extends Error {
  constructor(
    readonly code:
      | "unavailable"
      | "stale"
      | "unsupported"
      | "invalid-result"
      | "busy"
      | "cancelled"
      | "persistence",
    message: string,
  ) {
    super(message);
    this.name = "Scene3dInplaceError";
  }
}
