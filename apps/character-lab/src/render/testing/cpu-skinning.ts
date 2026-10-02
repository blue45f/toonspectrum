/**
 * 실제 Babylon 장면 상태(스켈레톤 행렬·morph influence)에서 메시의 **스킨·morph된 정점 위치**를 CPU로 계산한다(테스트 보조).
 * NullEngine은 정점 셰이더를 실행하지 못하므로 GPU가 하는 일(morph 가산 → 본 행렬 가중합)을 같은 식으로 재현해 본·역바인드·morph 사이의 정합을
 * 해석적 기대값과 비교한다. 이 계산은 Babylon의 `skeleton.getTransformMatrices`(= 절대 포즈 × 역바인드)를 그대로 쓴다.
 * 행 벡터 규약: p' = [x y z 1] · M, M은 행 우선 16개.
 */
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface SkinnedPositions {
  /** 모델 공간(메시 부모 변환 적용 전) 위치, xyz 연속 */
  readonly positions: Float32Array;
}

/** 현재 morph influence를 반영한 정점 위치(스킨 전) */
export function morphedPositions(mesh: Mesh): Float32Array {
  const base = mesh.getVerticesData("position");
  if (!base) throw new Error(`메시 ${mesh.name}에 position이 없습니다.`);
  const out = new Float32Array(base);
  const manager = mesh.morphTargetManager;
  if (!manager) return out;
  for (let t = 0; t < manager.numTargets; t += 1) {
    const target = manager.getTarget(t);
    const influence = target.influence;
    if (influence === 0) continue;
    const absolute = target.getPositions();
    if (!absolute) continue;
    // Babylon morph 타깃은 절대 위치를 담는다: 셰이더는 position += (target − position) × influence
    for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) + ((absolute[i] as number) - (base[i] as number)) * influence;
  }
  return out;
}

/** morph + 스킨(본 행렬 가중합)을 적용한 정점 위치. 스켈레톤이 없으면 morph만 반영한다. */
export function skinnedPositions(mesh: Mesh): SkinnedPositions {
  const morphed = morphedPositions(mesh);
  const skeleton = mesh.skeleton;
  if (!skeleton) return { positions: morphed };
  // 렌더 루프 밖이므로 프레임 id와 무관하게 행렬을 다시 계산한다.
  skeleton.prepare(true);
  const matrices = skeleton.getTransformMatrices(mesh);
  const indices = mesh.getVerticesData("matricesIndices");
  const weights = mesh.getVerticesData("matricesWeights");
  if (!indices || !weights) return { positions: morphed };
  const out = new Float32Array(morphed.length);
  const vertexCount = morphed.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    const x = morphed[v * 3] as number;
    const y = morphed[v * 3 + 1] as number;
    const z = morphed[v * 3 + 2] as number;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = weights[v * 4 + k] as number;
      if (weight === 0) continue;
      const m = (indices[v * 4 + k] as number) * 16;
      ox += weight * (x * (matrices[m] as number) + y * (matrices[m + 4] as number) + z * (matrices[m + 8] as number) + (matrices[m + 12] as number));
      oy += weight * (x * (matrices[m + 1] as number) + y * (matrices[m + 5] as number) + z * (matrices[m + 9] as number) + (matrices[m + 13] as number));
      oz += weight * (x * (matrices[m + 2] as number) + y * (matrices[m + 6] as number) + z * (matrices[m + 10] as number) + (matrices[m + 14] as number));
    }
    out[v * 3] = ox;
    out[v * 3 + 1] = oy;
    out[v * 3 + 2] = oz;
  }
  return { positions: out };
}

/** 장면에서 이름으로 메시를 찾아 스킨·morph된 정점 위치를 구한다(app 테스트가 Babylon 타입을 import하지 않도록 이름으로 받는다). */
export function skinnedPositionsByName(scene: Scene | undefined, meshName: string): Float32Array {
  const mesh = scene?.getMeshByName(meshName);
  if (!mesh) throw new Error(`메시 ${meshName}가 장면에 없습니다.`);
  return skinnedPositions(mesh as Mesh).positions;
}
