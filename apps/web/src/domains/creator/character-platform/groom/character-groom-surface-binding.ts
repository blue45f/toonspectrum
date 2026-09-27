import { Mesh, Quaternion, SkinnedMesh, Vector3 } from "three";

import { evaluateCharacterSurfaceInkAnchor } from "../surface-ink/character-surface-ink";
import {
  characterSurfaceTopologyRevision, characterSurfaceTriangle,
} from "../surface-ink/character-surface-ink-three-mesh";

import type { CharacterGroomGuideCurve, CharacterGroomVector3 } from "./character-groom-document";
import type { CharacterSurfaceInkAnchor } from "../surface-ink/character-surface-ink";

export interface CharacterGroomSurfaceBinding {
  readonly source: Mesh;
  readonly guide: CharacterGroomGuideCurve;
  readonly root: CharacterSurfaceInkAnchor & { readonly position: CharacterGroomVector3 };
  readonly evaluate: () => (CharacterSurfaceInkAnchor & { readonly position: CharacterGroomVector3 }) | null;
}

export type CharacterGroomSurfaceResolution =
  | { readonly status: "ready"; readonly binding: CharacterGroomSurfaceBinding }
  | { readonly status: "unsupported"; readonly reason: string };

/** 저장된 루트 삼각형과 스키닝을 재사용한다. 다른 표면을 추정해서 원본을 옮기지 않는다. */
export function resolveCharacterGroomSurfaceBinding(
  guide: CharacterGroomGuideCurve,
  sources: ReadonlyMap<string, Mesh>,
  modelKey: string,
): CharacterGroomSurfaceResolution {
  const rootPoint = guide.points[0];
  const anchor = rootPoint?.surfaceAnchor;
  if (!rootPoint || !anchor || guide.points.slice(1).some((point) => point.surfaceAnchor)) {
    return { status: "unsupported", reason: "두피의 첫 제어점에만 표면 앵커가 있는 가이드를 지원합니다. 여러 표면에 고정한 가이드는 원본을 보존합니다." };
  }
  if (anchor.barycentric.some((weight) => weight < 0 || weight > 1)
    || Math.abs(anchor.barycentric.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-4
    || new Vector3(...anchor.localNormal).lengthSq() < 1e-12) {
    return { status: "unsupported", reason: "두피 앵커의 무게 또는 방향이 올바르지 않습니다. 원본은 보존됩니다." };
  }
  const source = sources.get(anchor.meshAssetId);
  if (!source) return { status: "unsupported", reason: "두피 메시를 찾을 수 없거나 이름이 중복됩니다. 원래 모델을 복원하면 다시 확인할 수 있습니다." };
  if (anchor.primitiveIndex !== 0) {
    return { status: "unsupported", reason: "별도 primitive 번호를 사용하는 외부 표면은 확인할 수 없어 원본을 보존합니다." };
  }
  if (characterSurfaceTopologyRevision(modelKey, source) !== anchor.topologyRevision) {
    return { status: "unsupported", reason: "두피 토폴로지가 원본과 다릅니다. 자동 재투영하지 않으며 원래 모델을 복원하면 다시 부착합니다." };
  }
  if (source instanceof SkinnedMesh && (!source.skeleton || !source.geometry.getAttribute("skinIndex") || !source.geometry.getAttribute("skinWeight"))) {
    return { status: "unsupported", reason: "두피의 스킨 정보가 없어 표면 부착을 확인할 수 없습니다. 원본은 보존됩니다." };
  }
  const evaluate = () => {
    const triangle = characterSurfaceTriangle(source, anchor.triangleIndex, true);
    if (!triangle) return null;
    const value = evaluateCharacterSurfaceInkAnchor({
      ...anchor, localTangent: [0, 1, 0], skinIndices: [0, 0, 0, 0],
      skinWeights: [1, 0, 0, 0], pressure: 1, width: rootPoint.width,
    }, triangle);
    if (source instanceof SkinnedMesh && value.skinIndices.some((index, channel) =>
      value.skinWeights[channel] > 0 && index >= source.skeleton.bones.length)) return null;
    return value;
  };
  const root = evaluate();
  if (!root) return { status: "unsupported", reason: "두피 삼각형 또는 스킨 정보가 손상되어 부착을 보류했습니다. 원본은 보존됩니다." };
  const sourceNormal = new Vector3(...anchor.localNormal).normalize();
  const targetNormal = new Vector3(...root.localNormal).normalize();
  const rotation = new Quaternion().setFromUnitVectors(sourceNormal, targetNormal);
  return {
    status: "ready",
    binding: {
      source, root, evaluate,
      guide: {
        ...guide, status: "valid",
        points: guide.points.map((point, index) => {
          const position = new Vector3(...point.position).sub(new Vector3(...rootPoint.position))
            .applyQuaternion(rotation).add(new Vector3(...root.position));
          return {
            ...point, position: [position.x, position.y, position.z],
            ...(index === 0 ? { surfaceAnchor: { ...anchor, localNormal: root.localNormal } } : {}),
          };
        }),
      },
    },
  };
}
