import type {
  StudioBackground3DInsertResult,
  StudioVrmPoserInsertResult,
} from "./studio-3d-insert-contract";
import type { StudioEditorMutationTicket } from "./studio-editor-scope";

export type Studio3dInsertMutationAdmission = (
  ticket: StudioEditorMutationTicket
) => boolean;

export interface StudioVrmInsertTarget {
  readonly type: string;
  readonly width?: number;
}

export interface StudioVrmTargetPatch {
  readonly src: string;
  readonly height: number;
  readonly vrmScene: StudioVrmPoserInsertResult["scene"];
}

export interface StudioVrmNewImageInsert {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly elementPatch: {
    readonly vrmScene: StudioVrmPoserInsertResult["scene"];
    readonly name: string;
  };
}

export type StudioVrmInsertHandler = (
  result: StudioVrmPoserInsertResult
) => boolean;

export type StudioBg3dInsertHandler = (
  result: StudioBackground3DInsertResult
) => boolean;

export interface ApplyStudioVrmInsertResultInput {
  readonly result: StudioVrmPoserInsertResult;
  readonly mutationTicket: StudioEditorMutationTicket | null;
  readonly admitMutation: Studio3dInsertMutationAdmission;
  readonly targetElementId?: string;
  readonly resolveTarget: (
    elementId: string
  ) => StudioVrmInsertTarget | null | undefined;
  readonly patchTarget: (
    elementId: string,
    patch: StudioVrmTargetPatch
  ) => boolean;
  readonly appendImage: (insert: StudioVrmNewImageInsert) => boolean;
}

export interface ApplyStudioBg3dInsertResultInput {
  readonly result: StudioBackground3DInsertResult;
  readonly mutationTicket: StudioEditorMutationTicket | null;
  readonly admitMutation: Studio3dInsertMutationAdmission;
  readonly targetElementId?: string;
  readonly applyRenderedImage: (
    result: StudioBackground3DInsertResult,
    targetElementId?: string
  ) => boolean;
}

function isPositiveFiniteDimension(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function applyStudioVrmInsertResult({
  result,
  mutationTicket,
  admitMutation,
  targetElementId,
  resolveTarget,
  patchTarget,
  appendImage,
}: ApplyStudioVrmInsertResultInput): boolean {
  if (!mutationTicket || !admitMutation(mutationTicket)) return false;
  if (
    !isPositiveFiniteDimension(result.width)
    || !isPositiveFiniteDimension(result.height)
  ) {
    return false;
  }

  if (targetElementId) {
    const target = resolveTarget(targetElementId);
    if (
      !target
      || target.type !== "image"
      || !isPositiveFiniteDimension(target.width)
    ) {
      return false;
    }
    return patchTarget(targetElementId, {
      src: result.pngDataUrl,
      height: Math.max(1, Math.round(target.width * (result.height / result.width))),
      vrmScene: result.scene,
    });
  }

  return appendImage({
    src: result.pngDataUrl,
    width: result.width,
    height: result.height,
    elementPatch: {
      vrmScene: result.scene,
      name: "3D 데생 인형",
    },
  });
}

export function applyStudioBg3dInsertResult({
  result,
  mutationTicket,
  admitMutation,
  targetElementId,
  applyRenderedImage,
}: ApplyStudioBg3dInsertResultInput): boolean {
  if (!mutationTicket || !admitMutation(mutationTicket)) return false;
  return applyRenderedImage(result, targetElementId);
}
