import { studioCc0AssetUrl } from "./studio-cc0-asset-delivery";
import { findStudioMarketplaceCc0Asset } from "./studio-marketplace-cc0-assets";

import type { StudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";

export interface StudioMarketplaceModelImportScope {
  readonly isCurrent: () => boolean;
  readonly signal?: AbortSignal;
}

function assertCurrent(scope: StudioMarketplaceModelImportScope): void {
  scope.signal?.throwIfAborted();
  if (!scope.isCurrent()) throw new DOMException("마켓 모델 가져오기가 취소되었습니다.", "AbortError");
}

/** Fetch only the immutable, same-origin catalog file, with a streaming byte cap. */
async function readModelBytes(path: string, expectedBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(studioCc0AssetUrl(path), { signal, credentials: "same-origin", redirect: "error" });
  const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!response.ok || !response.body
    || (mime !== "model/gltf-binary" && mime !== "application/octet-stream")
    || Number(response.headers.get("content-length") ?? 0) > expectedBytes) {
    await response.body?.cancel();
    throw new Error("마켓 모델 파일을 불러오지 못했습니다.");
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > expectedBytes - offset) throw new Error("모델 파일 크기가 일치하지 않습니다.");
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== expectedBytes) throw new Error("모델 파일 크기가 일치하지 않습니다.");
  return bytes;
}

/** Prepare an independent scene, never overwrite the currently edited 3D document. */
export async function prepareStudioMarketplaceCc0ModelScene(
  runtimeRef: string,
  scope: StudioMarketplaceModelImportScope,
): Promise<StudioBg3dSceneDocument> {
  assertCurrent(scope);
  const asset = findStudioMarketplaceCc0Asset(runtimeRef);
  if (!asset || asset.kind !== "model") throw new Error("검증된 마켓 3D 모델 참조가 아닙니다.");
  const [library, documents, bytes] = await Promise.all([
    import("./bg3d/bg3d-model-library"),
    import("./bg3d/studio-bg3d-scene-document"),
    readModelBytes(asset.path, asset.bytes, scope.signal),
  ]);
  assertCurrent(scope);
  const disposition = await library.importVerifiedBg3dModelsAtomicallyWithDispositionV12([{
    file: new File([bytes], `${asset.name}.glb`, { type: "model/gltf-binary" }),
    expectedSha256: asset.sha256,
    rights: { status: "public-domain", commercialUse: true, attributionRequired: false, licenseName: "CC0 1.0", attribution: asset.provider },
  }], { profile: "mobile", executionBackend: "worker", signal: scope.signal });
  try {
    assertCurrent(scope);
    const model = disposition.records[0];
    if (!model || model.contentHash !== `sha256:${asset.sha256}` || model.byteSize !== asset.bytes) {
      throw new Error("저장된 마켓 모델의 무결성이 일치하지 않습니다.");
    }
    const attachment = library.createStudioBg3dModelAttachment(model);
    const scene = documents.normalizeStudioBg3dSceneDocument({
      ...documents.createDefaultStudioBg3dSceneDocument(),
      attachments: [attachment],
      nodes: [{
        id: "market-cc0-model", name: asset.name, kind: "model", attachmentId: attachment.id,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true, locked: false, castsShadow: true, receivesShadow: true,
      }],
    });
    if (scene.nodes.length !== 1 || scene.attachments.length !== 1) throw new Error("모델 장면 구성이 올바르지 않습니다.");
    assertCurrent(scope);
    return scene;
  } catch (error) {
    // Compensates this operation's exact newly created records only. Existing/shared rows survive.
    await library.compensateImportedBg3dModelsIfCreationMatchesV12(disposition);
    throw error;
  }
}
