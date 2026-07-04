// "3D 배경" 도구에 업로드한 커스텀 3D 모델(.glb/.gltf/.obj)의 씬 배치 순수 헬퍼 + 로더.
// studio-background-3d-primitives.ts(도형 프리미티브)의 관례를 그대로 따르되 그 파일은 이번 작업
// 범위(새 파일만 생성)상 절대 수정하지 않는다 — BgCustomModelInstance는 BgPrimitive의 새 kind가
// 아니라 완전히 별도인 인스턴스 목록으로, 씬 상태 상에서 구조적으로 구분된다(§5 통합 문서 참고,
// docs/studio-bg3d-custom-model-upload.md).
import * as THREE from "three";

import type { Bg3dModelFormat } from "./bg3d-model-library";
import type { BgPrimitive } from "./studio-background-3d-primitives";

export interface BgCustomModelInstance {
  id: string;
  /** bg3d-model-library.ts IndexedDB 레코드 id — 모델 바이너리 자체는 절대 씬 상태/직렬화에 포함되지 않는다. */
  modelId: string;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ, 라디안 — BgPrimitive와 동일 계약
  scale: [number, number, number];
}

// PRIMITIVE_DEFS 도형들의 대략적인 크기 감각(반경 0.5~1m대)과 맞춘 오토핏 목표 치수.
const DEFAULT_AUTO_FIT_TARGET_SIZE = 2;
// .obj가 .mtl 없이 올라왔을 때 씌우는 무광 중립색 — 도형 프리셋 팔레트(예: box "#c9a876",
// cylinder "#9fb4c9")와 톤을 맞추되 특정 프리셋과 겹치지 않는 회색조를 고른다.
const BG3D_CUSTOM_MODEL_NEUTRAL_COLOR = "#b8b8c2";

function uid(): string {
  return `bg3dmodel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 반복 추가 시 매번 원점에 완전히 겹쳐 쌓이지 않도록 x축 결정적 지터를 준다 — createPrimitive와
// 동일한 패턴(studio-background-3d-primitives.ts). 정확한 위치는 사용자가 TransformControls로 잡는다.
export function createBgCustomModelInstance(
  modelId: string,
  existingCount: number,
  scale: [number, number, number] = [1, 1, 1]
): BgCustomModelInstance {
  const offsetX = (existingCount % 5) * 0.8;
  return {
    id: uid(),
    modelId,
    position: [offsetX, 0, 0],
    rotation: [0, 0, 0],
    scale: [...scale],
  };
}

export function duplicateBgCustomModelInstance(instance: BgCustomModelInstance): BgCustomModelInstance {
  return {
    ...instance,
    id: uid(),
    position: [instance.position[0] + 0.4, instance.position[1], instance.position[2] + 0.4],
  };
}

// undo/redo 스냅샷용 깊은 복제 — clonePrimitives와 동일한 이유로 필드별 스프레드를 쓴다
// (배열/문자열/숫자만 갖는 평평한 구조라 JSON 왕복보다 저렴).
export function cloneBgCustomModelInstances(instances: BgCustomModelInstance[]): BgCustomModelInstance[] {
  return instances.map((inst) => ({
    ...inst,
    position: [...inst.position] as [number, number, number],
    rotation: [...inst.rotation] as [number, number, number],
    scale: [...inst.scale] as [number, number, number],
  }));
}

/**
 * 로드 직후 측정한 바운딩 박스 크기(measureBg3dObjectSize 참고)로부터, 모델의 최대 변이
 * targetSize(기본 2m — 도형 프리셋 감각과 맞춤)에 맞도록 균일 스케일 배율을 역산한다.
 * SketchUp(대개 인치 단위 원본을 그대로 내보냄)·Blender(미터)·기타 툴마다 내보내기 단위 관례가
 * 제각각이라, 업로드된 모델의 크기가 사방 몇 mm~몇 km까지 널뛸 수 있다 — 이 함수가 그 격차를
 * 보정하는 유일한 지점이다. 치수가 유한하지 않거나 0 이하(빈/퇴화 지오메트리 방어)면 1(무변경)을
 * 반환한다.
 */
export function computeAutoFitScale(boundingSize: [number, number, number], targetSize: number = DEFAULT_AUTO_FIT_TARGET_SIZE): number {
  const maxDimension = Math.max(...boundingSize.map((v) => Math.abs(v)));
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || !Number.isFinite(targetSize) || targetSize <= 0) {
    return 1;
  }
  return targetSize / maxDimension;
}

/** 로드된 모델 루트의 월드축 정렬 바운딩 박스 변 길이(x/y/z)를 측정한다 — computeAutoFitScale의 입력. */
export function measureBg3dObjectSize(object: THREE.Object3D): [number, number, number] {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return [0, 0, 0];
  const size = box.getSize(new THREE.Vector3());
  return [size.x, size.y, size.z];
}

/**
 * .obj는 .mtl(머티리얼 정의) 없이 업로드되면 OBJLoader가 재질 없이(또는 검은색으로) 메시를 만들어
 * 배경 도형들과 톤이 완전히 어긋난다(.mtl 지원은 이번 작업 범위 밖 — docs/studio-bg3d-custom-model-upload.md
 * §8 참고). 대신 모든 메시에 도형 프리셋과 같은 계열의 무광 중립색 MeshStandardMaterial 하나를
 * 공유시켜 "실루엣은 정확하되 색은 신경 안 써도 되는" 블록아웃 톤을 보장한다. 교체되는 원본
 * 머티리얼(들)은 즉시 dispose해 GPU 리소스가 새지 않게 한다.
 */
export function applyBg3dFallbackMaterial(root: THREE.Object3D, color: string = BG3D_CUSTOM_MODEL_NEUTRAL_COLOR): void {
  const material = new THREE.MeshStandardMaterial({ color });
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prevMaterial = mesh.material;
    mesh.material = material;
    for (const mat of Array.isArray(prevMaterial) ? prevMaterial : [prevMaterial]) {
      mat.dispose();
    }
  });
}

/**
 * IndexedDB에서 꺼낸 blob을 GLTFLoader(.glb/.gltf)/OBJLoader(.obj)로 파싱해 씬에 넣을 수 있는
 * Object3D 루트를 만든다. StudioVrmPoser.tsx의 loadVrmAsset과 동일하게 로더를 동적 import
 * (three/examples/jsm)해 초기 번들을 무겁게 만들지 않는다.
 *
 * blob: URL은 이미 로컬 메모리에 있는 데이터(방금 IndexedDB에서 꺼낸 값)라, loadVrmAsset과 달리
 * resolveAssetUrl/HEAD 프리플라이트(HTML 폴백 감지)가 필요 없다 — 그 대상은 배포 오리진이 다를 수
 * 있는 root-relative 정적 경로(/vrm/..)뿐이고, blob: 스킴은 애초에 그 대상이 아니다
 * (loadVrmAsset의 shouldPreflightVrmUrl도 blob:을 프리플라이트 대상에서 제외한다).
 */
export async function loadBg3dCustomModelFromBlob(blob: Blob, format: Bg3dModelFormat): Promise<THREE.Object3D> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    if (format === "obj") {
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      const root = await new OBJLoader().loadAsync(objectUrl);
      applyBg3dFallbackMaterial(root);
      return root;
    }

    // GLTFLoader는 .glb(바이너리)/.gltf(JSON) 콘텐츠를 자동 판별하므로 둘을 따로 분기할 필요가 없다.
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(objectUrl);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/* ── 씬 해시 직렬화(customModels 확장) ───────────────────────────────────────────────
   studio-background-3d-primitives.ts의 encodeBg3dSceneHash/parseBg3dSceneFromDataUrl(프리미티브
   전용, 무변경)과 별개로, 여기서는 customModels(인스턴스 배치 + modelId 참조만 — 모델 바이너리
   자체는 절대 포함하지 않음)까지 함께 실어 나르는 새 버전을 추가한다. 캡처된 PNG data URL 뒤에
   `#`으로 장면 그래프를 붙이는 트릭은 동일(VRM 포저/도형 프리미티브와 공유하는 round-trip 계약).
   customModels 필드가 없는 기존(프리미티브 전용) 해시도 계속 파싱되도록(빈 배열로 취급) 하위
   호환을 지킨다. */

interface Bg3dSceneWithModelsMetadata {
  tool: "bg3d";
  primitives: BgPrimitive[];
  customModels: BgCustomModelInstance[];
}

export interface Bg3dSceneWithModels {
  primitives: BgPrimitive[];
  customModels: BgCustomModelInstance[];
}

export function encodeBg3dSceneWithModelsHash(primitives: BgPrimitive[], customModels: BgCustomModelInstance[]): string {
  const metadata: Bg3dSceneWithModelsMetadata = { tool: "bg3d", primitives, customModels };
  return encodeURIComponent(JSON.stringify(metadata));
}

export function parseBg3dSceneWithModelsFromDataUrl(dataUrl: string | undefined): Bg3dSceneWithModels | null {
  if (!dataUrl) return null;
  const hashIndex = dataUrl.indexOf("#");
  if (hashIndex < 0) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(dataUrl.slice(hashIndex + 1))) as Partial<Bg3dSceneWithModelsMetadata>;
    if (raw.tool !== "bg3d" || !Array.isArray(raw.primitives)) return null;
    return {
      primitives: raw.primitives,
      customModels: Array.isArray(raw.customModels) ? raw.customModels : [],
    };
  } catch {
    return null;
  }
}
