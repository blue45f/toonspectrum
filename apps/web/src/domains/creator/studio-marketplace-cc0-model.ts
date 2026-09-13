import { createStudioCc0ModelFile } from "./studio-cc0-asset-delivery";
import { findStudioMarketplaceCc0Asset } from "./studio-marketplace-cc0-catalog";
import {
  createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./bg3d/studio-bg3d-scene-document";

/** Downloads and validates before preparing a new scene. Never replaces the current document. */
export async function prepareStudioMarketplaceCc0ModelScene(
  reference: string,
  isCurrent: () => boolean,
): Promise<{ scene: StudioBg3dSceneDocument; name: string; cancel: () => Promise<boolean> }> {
  const asset = findStudioMarketplaceCc0Asset(reference);
  if (!asset || asset.kind !== "model") throw new Error("검수된 3D 에셋을 찾지 못했습니다.");
  const assertCurrent = () => { if (!isCurrent()) throw new Error("3D 에셋 열기를 취소했습니다."); };
  assertCurrent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const [file, library] = await Promise.all([
      createStudioCc0ModelFile(asset, controller.signal), import("./bg3d/bg3d-model-library"),
    ]);
    assertCurrent();
    const imported = await library.importVerifiedBg3dModelsAtomicallyWithDispositionV12([
      { file, expectedSha256: asset.sha256, rights: { status: "public-domain", commercialUse: true,
        attributionRequired: false, attribution: asset.provider, licenseName: "CC0 1.0" } },
    ], { profile: "mobile", signal: controller.signal });
    const cancel = () => library.compensateImportedBg3dModelsIfCreationMatchesV12(imported);
    try {
      controller.signal.throwIfAborted();
      assertCurrent();
      const [record] = imported.records;
      if (!record) throw new Error("3D 모델 저장 결과가 없습니다.");
      const attachment = library.createStudioBg3dModelAttachment(record);
      const scene = normalizeStudioBg3dSceneDocument({
        ...createDefaultStudioBg3dSceneDocument(), attachments: [attachment],
        nodes: [{ id: crypto.randomUUID(), kind: "model", attachmentId: attachment.id,
          name: asset.name, visible: true, locked: false, castsShadow: true, receivesShadow: true,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
      });
      return { scene, name: asset.name, cancel };
    } catch (error) {
      await cancel();
      throw error;
    }
  } finally { clearTimeout(timeout); }
}
