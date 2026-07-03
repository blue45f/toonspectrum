// "3D 배경" 블록아웃 도구의 순수 헬퍼 모음(장면 데이터 모델·스폰 규칙·지오메트리·해시 직렬화).
// React/three.js JSX와 분리해 두면 StudioBackground3D.tsx가 렌더링/상호작용에만 집중할 수 있고,
// 장면 모델 로직을 단위 테스트하기도 쉬워진다.
import * as THREE from "three";

export type BgPrimitiveKind =
  | "box"
  | "cylinder"
  | "plane"
  | "sphere"
  | "hemisphere"
  | "cone"
  | "pyramid"
  | "triangularPrism"
  | "hexPrism"
  | "torus"
  | "tube"
  | "ring"
  | "capsule";

export interface BgPrimitive {
  id: string;
  kind: BgPrimitiveKind;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ, 라디안
  scale: [number, number, number];
  color: string; // 셰이딩 미리보기 전용 hex — 선화 내보내기에는 영향 없음
}

export interface BgSceneState {
  primitives: BgPrimitive[];
  selectedId: string | null;
}

interface BgPrimitiveDef {
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

// 종류별 스폰 기본값. plane·ring만 지면에 눕도록 -90° 회전(수직 벽·간판은 회전 기즈모로 한 번 더
// 돌리면 됨). 각도형(pyramid 등)은 makeGeometry가 원점 중심 지오메트리를 주므로 y는 높이의 절반.
export const PRIMITIVE_DEFS: Record<BgPrimitiveKind, BgPrimitiveDef> = {
  box: { label: "상자", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9a876" },
  cylinder: { label: "원기둥", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#9fb4c9" },
  plane: { label: "평면", position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: [6, 6, 1], color: "#93b58c" },
  sphere: { label: "구", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9909f" },
  hemisphere: { label: "반구(돔)", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#b7a8d6" },
  cone: { label: "원뿔", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#d6b26a" },
  pyramid: { label: "각뿔", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#cf9d6a" },
  triangularPrism: {
    label: "삼각기둥(지붕)",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#a87b5c",
  },
  hexPrism: { label: "육각기둥", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#8fa88f" },
  torus: { label: "고리", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c2a6d6" },
  tube: { label: "파이프", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#7fa6b8" },
  ring: { label: "평면 고리", position: [0, 0.01, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 1, 1], color: "#d6c48a" },
  capsule: { label: "캡슐", position: [0, 0.75, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#8ec2c2" },
};

const BG3D_EXPORT_HEIGHT = 640;
const BG3D_FALLBACK_EXPORT_WIDTH = 640;

function uid(): string {
  return `bg3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 반복 추가 시 새 도형이 매번 원점에 완전히 겹쳐 쌓이지 않도록 x축으로 결정적 지터를 준다.
// 물리 기반 배치가 아니라 "찾기 쉬운 위치에 떨어뜨려 준다" 수준의 단순 나열이며,
// 새로 추가된 도형은 곧바로 선택돼 TransformControls가 붙으므로 정확한 위치는 사용자가 드래그로 잡는다.
export function createPrimitive(kind: BgPrimitiveKind, existingCount: number): BgPrimitive {
  const def = PRIMITIVE_DEFS[kind];
  const offsetX = (existingCount % 5) * 0.8;
  return {
    id: uid(),
    kind,
    position: [offsetX, def.position[1], def.position[2]],
    rotation: [...def.rotation],
    scale: [...def.scale],
    color: def.color,
  };
}

export function duplicatePrimitive(prim: BgPrimitive): BgPrimitive {
  return {
    ...prim,
    id: uid(),
    position: [prim.position[0] + 0.4, prim.position[1], prim.position[2] + 0.4],
  };
}

// undo/redo 스냅샷용 깊은 복제. BgPrimitive는 배열/문자열/숫자만 갖는 평평한 구조라
// JSON 왕복보다 필드별 스프레드가 더 저렴하다.
export function clonePrimitives(primitives: BgPrimitive[]): BgPrimitive[] {
  return primitives.map((p) => ({
    ...p,
    position: [...p.position] as [number, number, number],
    rotation: [...p.rotation] as [number, number, number],
    scale: [...p.scale] as [number, number, number],
  }));
}

export function makeGeometry(kind: BgPrimitiveKind): THREE.BufferGeometry {
  switch (kind) {
    case "box":
      return new THREE.BoxGeometry(1, 1, 1);
    case "cylinder":
      return new THREE.CylinderGeometry(0.3, 0.3, 1, 16);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 24, 16);
    case "hemisphere":
      // SphereGeometry의 thetaLength를 절반(π)으로 잘라 위쪽 반구만 남긴다 — 돔 지붕용.
      return new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    case "cone":
      return new THREE.ConeGeometry(0.4, 1, 24);
    case "pyramid":
      // radialSegments=4인 원뿔 = 밑면이 정사각형인 각뿔.
      return new THREE.ConeGeometry(0.5, 1, 4);
    case "triangularPrism":
      // radialSegments=3인 원기둥 = 삼각기둥. 눕혀서 회전시키면 지붕 경사면으로 쓰기 좋다.
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
    case "hexPrism":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    case "torus":
      return new THREE.TorusGeometry(0.4, 0.15, 12, 24);
    case "tube":
      // openEnded 원기둥 — 속이 빈 파이프 실루엣(선화 추출 시 안쪽 테두리도 함께 드러난다).
      return new THREE.CylinderGeometry(0.4, 0.4, 1, 24, 1, true);
    case "ring":
      return new THREE.RingGeometry(0.2, 0.5, 32);
    case "capsule":
      return new THREE.CapsuleGeometry(0.3, 0.7, 8, 16);
  }
}

export function roundExportSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: BG3D_FALLBACK_EXPORT_WIDTH, height: BG3D_EXPORT_HEIGHT };
  }
  const aspect = canvas.width / canvas.height;
  return { width: Math.round(BG3D_EXPORT_HEIGHT * aspect), height: BG3D_EXPORT_HEIGHT };
}

interface Bg3dSceneMetadata {
  tool: "bg3d";
  primitives: BgPrimitive[];
}

// VRM 포저의 pose 해시와 동일한 트릭: 캡처된 PNG data URL 뒤에 장면 그래프를 URL 프래그먼트로
// 붙여 재편집(round-trip)이 가능하게 한다. `tool` 판별 필드는 이 도구와 VRM 포저의 캡처를
// 구분하기 위한 것으로, 두 도구 모두 `#`으로 끝나는 data URL을 만들게 되기 때문에 필요하다.
export function encodeBg3dSceneHash(primitives: BgPrimitive[]): string {
  const metadata: Bg3dSceneMetadata = { tool: "bg3d", primitives };
  return encodeURIComponent(JSON.stringify(metadata));
}

export function parseBg3dSceneFromDataUrl(dataUrl: string | undefined): BgPrimitive[] | null {
  if (!dataUrl) return null;
  const hashIndex = dataUrl.indexOf("#");
  if (hashIndex < 0) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(dataUrl.slice(hashIndex + 1))) as Partial<Bg3dSceneMetadata>;
    if (raw.tool !== "bg3d" || !Array.isArray(raw.primitives)) return null;
    return raw.primitives;
  } catch {
    return null;
  }
}

// StudioPage.tsx 통합 시 필요한 판별 헬퍼(설계 §5) — 이 도구가 나오기 전까지는 VRM 포저 캡처만
// `#` 해시를 달았으므로, tool 필드가 없는 레거시 해시는 vrm-poser로 간주해 하위 호환을 지킨다.
// (VRM 포저 쪽 poseMetadata에도 `tool: "vrm-poser"` 필드를 추가하는 후속 작업이 별도로 필요하다.)
export function parseStudio3dTool(src: string | undefined): "vrm-poser" | "bg3d" | null {
  if (!src) return null;
  const hashIndex = src.indexOf("#");
  if (hashIndex < 0) return null;
  try {
    const meta = JSON.parse(decodeURIComponent(src.slice(hashIndex + 1))) as { tool?: string };
    return meta.tool === "bg3d" ? "bg3d" : "vrm-poser";
  } catch {
    return null;
  }
}
