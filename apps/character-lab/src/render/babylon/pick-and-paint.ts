/**
 * pick·페인트 텍스처 업로드.
 * - pick: NDC → 렌더 픽셀 → scene.createPickingRay → `skinned-pick.ts`(스키닝·morph가 반영된 위치에 대한 자체 레이캐스트,
 *   partId>0·outline 제외·가시). Babylon `pickWithRay`는 bind 포즈 삼각형을 쓰므로 쓰지 않는다.
 * - 페인트: PaintLayer(straight·top-down, UV v=0 = 첫 행)를 부위별 RawTexture(RGBA8, invertY=false 명시)로 올린다.
 *   PBR에는 Babylon decalMap 플러그인(mesh.decalMap + material.decalMap.isEnabled, 같은 UV)으로, 툰·flat 패스에는 paintSampler로 합성한다.
 *   MeshUVSpaceRenderer 투영 페인트는 베타(미사용, 문서 표기).
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { MeshUVSpaceRenderer } from "@babylonjs/core/Meshes/meshUVSpaceRenderer.js";

import { isPartRole } from "../../contracts";

import { rigVisibleMeshes } from "./character-rig";
import { readRigMeshMetadata } from "./mesh-binding";
import { pickMeshes } from "./skinned-pick";


import type { CharacterRig } from "./character-rig";
import type { MeshPickHit } from "./skinned-pick";
import type { PaintLayer, PartRole, PickHit } from "../../contracts";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Ray } from "@babylonjs/core/Culling/ray.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

export function pickableMesh(mesh: AbstractMesh): boolean {
  const metadata = readRigMeshMetadata(mesh.metadata);
  return metadata !== null && metadata.partId > 0 && !metadata.outline && mesh.isVisible && mesh.isEnabled();
}

/** NDC [-1,1](y 위쪽 양수) → 카메라에서 나가는 픽킹 광선. 렌더 크기가 0이거나 NDC가 유한하지 않으면 null. */
export function ndcRay(scene: Scene, camera: Camera, ndcX: number, ndcY: number): Ray | null {
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  const engine = scene.getEngine();
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  if (width <= 0 || height <= 0) return null;
  const px = (ndcX * 0.5 + 0.5) * width;
  const py = (1 - (ndcY * 0.5 + 0.5)) * height;
  return scene.createPickingRay(px, py, Matrix.Identity(), camera);
}

/** 후보 메시들에 대한 스키닝 반영 pick(투영 페인트가 활성 부위 메시만 후보로 줄 때 쓴다). */
export function pickCandidates(scene: Scene, camera: Camera, rig: CharacterRig, candidates: readonly Mesh[], ndcX: number, ndcY: number): MeshPickHit | null {
  const ray = ndcRay(scene, camera, ndcX, ndcY);
  if (!ray) return null;
  // 렌더 루프 밖에서도 최신 본 변환으로 스키닝하도록 스킨 행렬을 강제 갱신한다.
  rig.skeleton?.prepare(true);
  return pickMeshes(ray, candidates.filter(pickableMesh));
}

/** NDC [-1,1](y 위쪽 양수) → PickHit. 맞지 않으면 null. */
export function pickRig(scene: Scene, camera: Camera, rig: CharacterRig, ndcX: number, ndcY: number): PickHit | null {
  const candidates: Mesh[] = rigVisibleMeshes(rig, { includeOutlines: false });
  const hit = pickCandidates(scene, camera, rig, candidates, ndcX, ndcY);
  if (!hit) return null;
  const metadata = readRigMeshMetadata(hit.mesh.metadata);
  if (!metadata || !isPartRole(metadata.role)) return null;
  return { partId: metadata.partId, role: metadata.role, uv: hit.uv, worldPosition: hit.worldPosition, worldNormal: hit.worldNormal, distance: hit.distance };
}

export interface PaintTextureSet {
  get(part: PartRole): RawTexture | null;
  /** 레이어를 올리고 텍스처를 돌려준다(크기가 같으면 update, 다르면 재생성). */
  upload(layer: PaintLayer): RawTexture;
  /** 레이어 revision(업로드 추적) */
  revision(part: PartRole): number;
  /** 부위별 텍스처 크기·revision·invertY(점검용) */
  describe(): ReadonlyArray<{ readonly part: PartRole; readonly width: number; readonly height: number; readonly revision: number; readonly invertY: boolean }>;
  dispose(): void;
}

export function createPaintTextures(scene: Scene, onCreated?: (texture: RawTexture) => void): PaintTextureSet {
  const textures = new Map<PartRole, RawTexture>();
  const revisions = new Map<PartRole, number>();
  return {
    get: (part) => textures.get(part) ?? null,
    upload(layer) {
      const data = new Uint8Array(layer.rgba.buffer, layer.rgba.byteOffset, layer.rgba.byteLength);
      const existing = textures.get(layer.part);
      if (existing) {
        const size = existing.getSize();
        if (size.width === layer.width && size.height === layer.height) {
          existing.update(data);
          revisions.set(layer.part, layer.revision);
          return existing;
        }
        existing.dispose();
      }
      const texture = RawTexture.CreateRGBATexture(data, layer.width, layer.height, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
      texture.name = `paint:${layer.part}`;
      texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      textures.set(layer.part, texture);
      revisions.set(layer.part, layer.revision);
      onCreated?.(texture);
      return texture;
    },
    revision: (part) => revisions.get(part) ?? -1,
    describe: () =>
      [...textures].map(([part, texture]) => {
        const size = texture.getSize();
        return { part, width: size.width, height: size.height, revision: revisions.get(part) ?? -1, invertY: texture.invertY };
      }),
    dispose() {
      for (const texture of textures.values()) texture.dispose();
      textures.clear();
      revisions.clear();
    },
  };
}

/** PBR 재질에 데칼(페인트) 텍스처를 같은 UV로 합성한다(Babylon decalMap 플러그인). */
export function attachDecalToMesh(scene: Scene, mesh: Mesh, texture: RawTexture): void {
  if (!mesh.decalMap) mesh.decalMap = new MeshUVSpaceRenderer(mesh, scene, { width: texture.getSize().width, height: texture.getSize().height });
  mesh.decalMap.texture = texture;
}
