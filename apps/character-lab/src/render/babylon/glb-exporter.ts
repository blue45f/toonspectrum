/**
 * GLB export: @babylonjs/serializers GLTF2Export.GLBAsync(동적 import로 serializers 청크 분리).
 * 리그 루트 아래 노드(메시·본 TransformNode·Armature)만 내보내고(카메라·조명 제외) `glTF` magic을 검증한다.
 * morph target·스킨은 serializer가 포함한다(본은 TransformNode에 링크되어 있어야 export된다 — mesh-binding 규약).
 */
import { failVisible } from "../../contracts";

import type { CharacterRig } from "./character-rig";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";

const GLB_MAGIC = 0x46546c67;

export function isRigNode(rig: CharacterRig, node: Node): boolean {
  let cursor: Node | null = node;
  while (cursor) {
    if (cursor === rig.root) return true;
    cursor = cursor.parent;
  }
  return false;
}

export async function exportRigGlb(scene: Scene, rig: CharacterRig, fileName = "character", now: number = Date.now()): Promise<Uint8Array> {
  const serializers = await import("@babylonjs/serializers/glTF/2.0/index.js");
  let data: Awaited<ReturnType<typeof serializers.GLTF2Export.GLBAsync>>;
  try {
    data = await serializers.GLTF2Export.GLBAsync(scene, fileName, {
      shouldExportNode: (node) => isRigNode(rig, node),
      exportWithoutWaitingForScene: true,
    });
  } catch (error) {
    throw failVisible("glb-export-failed", "GLB 직렬화에 실패했습니다.", error, now);
  }
  const blob = data.glTFFiles[`${fileName}.glb`];
  if (!(blob instanceof Blob)) throw failVisible("glb-export-missing", `serializer가 ${fileName}.glb를 만들지 않았습니다.`, undefined, now);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength < 12 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== GLB_MAGIC) {
    throw failVisible("glb-export-invalid", "serializer 출력이 GLB 컨테이너가 아닙니다.", undefined, now);
  }
  return bytes;
}
