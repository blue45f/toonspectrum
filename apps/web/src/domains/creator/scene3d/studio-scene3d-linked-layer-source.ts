import {
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { isStudioLinked3dPassRevisionForScene } from "../studio-linked-3d-pass-transaction";
import {
  parseStudioLinked3dRenderDocument,
  validateStudioLinked3dRenderDocumentAgainstPage,
  type StudioLinked3dRenderElementLike,
} from "../studio-linked-3d-render-document";
import type { StudioShared3dStagePersistedState } from "../studio-shared-3d-stage-collection";
import type { StudioShared3dStageElementSource } from "../studio-shared-3d-stage-document";

type LinkedLayerElement = StudioLinked3dRenderElementLike & StudioShared3dStageElementSource;

function canonicalSceneForBundle(
  elements: readonly StudioLinked3dRenderElementLike[],
  bundleId: string,
): StudioBg3dSceneDocument | null {
  const scenes = elements
    .filter((element) =>
      element.type === "image"
      && element.bg3dLtBundleId === bundleId
      && element.bg3dScene !== undefined)
    .map((element) => element.bg3dScene!);
  if (scenes.length === 0) return null;
  const serialized = scenes.map(serializeStudioBg3dSceneDocument);
  const first = serialized[0];
  if (!first || serialized.some((candidate) => candidate !== first)) return null;
  return scenes[0] ?? null;
}

/**
 * Resolves only the canonical BG3D edit source needed by the 2D editor.
 * Scene3D authority construction stays behind the specialist lazy boundary.
 */
export function resolveStudioScene3dLinkedLayerEditSource(input: {
  readonly bundleId: string;
  readonly linked3dRender: unknown;
  readonly shared3dStage: StudioShared3dStagePersistedState;
  readonly elements: readonly LinkedLayerElement[];
}): StudioBg3dSceneDocument | null {
  const pageDocument = parseStudioLinked3dRenderDocument(input.linked3dRender);
  if (!pageDocument) return null;
  const link = pageDocument.links.find(({ bundleId }) => bundleId === input.bundleId);
  if (!link) return null;
  const scene = canonicalSceneForBundle(input.elements, input.bundleId);
  if (!scene || scene.activeShotId !== link.shotId) return null;
  if (!isStudioLinked3dPassRevisionForScene(link.passRevision, scene)) return null;
  const crossReference = validateStudioLinked3dRenderDocumentAgainstPage({
    value: pageDocument,
    elements: input.elements,
    shared3dStage: input.shared3dStage,
  });
  return crossReference.ok ? scene : null;
}
