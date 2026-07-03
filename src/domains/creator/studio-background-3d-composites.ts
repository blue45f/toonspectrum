// "3D 배경" 블록아웃 도구의 복합 오브젝트 프리셋 — 건물/나무/차량/소품처럼 여러 BgPrimitive가
// 상대 위치로 조합된 형태를 코드로 합성한다. 외부 glTF 에셋 없이 기존 PRIMITIVE_DEFS의 13종
// 지오메트리만 재사용(studio-background-3d-primitives.ts §makeGeometry 확장 없음) — 라이선스/
// 파일크기 리스크를 피하기 위한 설계 결정.
import type { BgPrimitive, BgPrimitiveKind } from "./studio-background-3d-primitives";

// studio-background-3d-primitives.ts의 uid()는 현재 미export(private)다. "재사용, 재발명 금지"
// 원칙상 원래는 그쪽에 `export` 한 줄만 추가해 여기서 import하는 것이 맞지만, 이 작업 범위는
// "새 파일만 생성, 기존 파일은 절대 수정 금지"로 제한되어 있어 그 1줄 변경조차 할 수 없었다.
// 따라서 동일한 포맷 문자열을 임시로 복제해 둔다 — 후속 배선(wiring) 작업에서
// studio-background-3d-primitives.ts의 uid()에 `export`를 추가하고 이 로컬 복제본을 지운 뒤
// 그 export를 import하도록 교체할 것(설계 문서 §0.4 참고).
function uid(): string {
  return `bg3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type BgCompositeCategory = "building" | "nature" | "vehicle" | "prop";

export const COMPOSITE_CATEGORY_LABELS: Record<BgCompositeCategory, string> = {
  building: "건물",
  nature: "자연",
  vehicle: "차량",
  prop: "소품",
};
export const COMPOSITE_CATEGORIES = Object.keys(COMPOSITE_CATEGORY_LABELS) as BgCompositeCategory[];

interface BgCompositePart {
  kind: BgPrimitiveKind;
  offset: [number, number, number]; // 앵커(0,0,0) 기준 상대 위치, 미터
  rotation: [number, number, number]; // Euler XYZ, 라디안 — BgPrimitive와 동일 계약
  scale: [number, number, number];
  color: string;
}

export interface BgCompositePreset {
  id: string;
  category: BgCompositeCategory;
  label: string;
  description: string;
  /**
   * 대략적인 바닥 반경(m). instantiateCompositePreset의 반복-추가 간격 계산에만 쓰이는 근사치이며
   * 실제 바운딩 계산이 아니다(가로등 0.4 vs 버스 2.0처럼 프리셋마다 크게 달라, createPrimitive의
   * 고정 0.8m 간격을 그대로 재사용하면 큰 오브젝트끼리 겹친다 — 그래서 이 필드를 추가함).
   */
  footprint: number;
  /**
   * parts[0]는 관례상 "앵커 파츠"(본체/몸통/줄기)다. 두 곳에서 쓰인다:
   * (1) instantiateCompositePreset 결과의 result[0].id가 곧 새로 선택될 프리미티브가 된다(단일
   *     addPrimitive와 동일하게 "방금 추가한 것 = 선택됨" UX 유지),
   * (2) 피커 그리드의 색상 스와치 미리보기가 parts[0].color를 사용한다.
   */
  parts: BgCompositePart[];
}

export const COMPOSITE_PRESETS: BgCompositePreset[] = [
  // ── building ──────────────────────────────────────────────
  {
    id: "building_low_shop",
    category: "building",
    label: "저층 상가건물",
    description: "1~2층 스트리트 상가",
    footprint: 2.2,
    parts: [
      { kind: "box", offset: [0, 1.1, 0], rotation: [0, 0, 0], scale: [3.4, 2.2, 2.2], color: "#d8cdb8" },
      { kind: "box", offset: [-1.0, 1.3, 1.11], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.05], color: "#8fb8c9" },
      { kind: "box", offset: [0, 1.3, 1.11], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.05], color: "#8fb8c9" },
      { kind: "box", offset: [1.0, 1.3, 1.11], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.05], color: "#8fb8c9" },
      { kind: "box", offset: [0, 2.25, 0], rotation: [0, 0, 0], scale: [3.6, 0.12, 2.4], color: "#5c5347" },
    ],
  },
  {
    id: "building_house",
    category: "building",
    label: "경사지붕 단독주택",
    description: "박공지붕이 있는 단층 주택",
    footprint: 2.0,
    parts: [
      { kind: "box", offset: [0, 1.0, 0], rotation: [0, 0, 0], scale: [2.6, 2.0, 2.2], color: "#e3d9c4" },
      // triangularPrism(radialSegments=3 원기둥)의 세 꼭짓점은 로컬 (X=0,Z=+r) / (X=±0.87r,Z=-0.5r)에
      // 있다 — "뾰족한 꼭짓점"은 로컬 Z축 방향이지 X축이 아니다. Z축 회전은 X·Y만 섞고 Z는 그대로
      // 두므로, z축 90°만 주면(리뷰에서 발견된 버그) 꼭짓점이 계속 Z방향을 가리켜 위로 세워지지 않고
      // 벽면 쪽으로 삐져나온 비대칭 쐐기 모양이 된다(node+three.js로 world-space 정점 직접 계산해
      // 확인함). X축 -90° 회전으로 Z(꼭짓점 방향)→Y(위) 매핑을 만들고, 이어서 Z축 90° 회전으로
      // Y(원래 압출축)→X(용마루 방향, 건물 폭과 정렬)를 만들어야 apex-up 지붕이 나온다. 이 offset/
      // scale 조합에서는 밑변이 정확히 몸체 상단(y=2.0)에 맞닿고 꼭짓점은 y=3.2. scale.x(2.8)=지붕
      // 깊이 방향 처마 폭(±1.21, 벽 z=±1.1보다 넓게 오버행), scale.y(2.9)=용마루 길이(벽 x=±1.3보다
      // 넓게 오버행), scale.z(1.6)=지붕 물매 높이(밑변 대비 +1.2).
      {
        kind: "triangularPrism",
        offset: [0, 2.4, 0],
        rotation: [-Math.PI / 2, 0, Math.PI / 2],
        scale: [2.8, 2.9, 1.6],
        color: "#8a4a3a",
      },
      { kind: "box", offset: [0, 0.5, 1.11], rotation: [0, 0, 0], scale: [0.6, 1.0, 0.05], color: "#6b4a37" },
      { kind: "box", offset: [-0.85, 1.15, 1.11], rotation: [0, 0, 0], scale: [0.55, 0.55, 0.05], color: "#a8cbe0" },
      { kind: "box", offset: [0.85, 1.15, 1.11], rotation: [0, 0, 0], scale: [0.55, 0.55, 0.05], color: "#a8cbe0" },
    ],
  },
  {
    id: "building_highrise",
    category: "building",
    label: "고층 오피스",
    description: "유리 파사드 고층 빌딩",
    footprint: 2.4,
    parts: [
      { kind: "box", offset: [0, 4.0, 0], rotation: [0, 0, 0], scale: [3.0, 8.0, 3.0], color: "#9fb0bf" },
      { kind: "box", offset: [0, 8.35, 0], rotation: [0, 0, 0], scale: [1.2, 0.7, 1.2], color: "#6b7480" },
      { kind: "cylinder", offset: [0, 9.0, 0], rotation: [0, 0, 0], scale: [0.06, 1.2, 0.06], color: "#333333" },
    ],
  },

  // ── nature ────────────────────────────────────────────────
  {
    id: "tree_round",
    category: "nature",
    label: "가로수(활엽수)",
    description: "둥근 캐노피 3덩이",
    footprint: 0.9,
    parts: [
      { kind: "cylinder", offset: [0, 0.75, 0], rotation: [0, 0, 0], scale: [0.5, 1.5, 0.5], color: "#6b4a35" },
      { kind: "sphere", offset: [0, 2.1, 0], rotation: [0, 0, 0], scale: [1.6, 1.4, 1.6], color: "#4f8f52" },
      { kind: "sphere", offset: [0.5, 1.9, 0.3], rotation: [0, 0, 0], scale: [1.0, 0.9, 1.0], color: "#5a9a5d" },
      { kind: "sphere", offset: [-0.45, 1.85, -0.35], rotation: [0, 0, 0], scale: [0.95, 0.85, 0.95], color: "#437f47" },
    ],
  },
  {
    id: "tree_conifer",
    category: "nature",
    label: "소나무(침엽수)",
    description: "층진 원뿔형 상록수",
    footprint: 0.7,
    parts: [
      { kind: "cylinder", offset: [0, 0.4, 0], rotation: [0, 0, 0], scale: [0.35, 0.8, 0.35], color: "#5a4230" },
      { kind: "cone", offset: [0, 1.55, 0], rotation: [0, 0, 0], scale: [1.1, 1.3, 1.1], color: "#2f6b45" },
      { kind: "cone", offset: [0, 1.05, 0], rotation: [0, 0, 0], scale: [1.5, 1.4, 1.5], color: "#356f49" },
      { kind: "cone", offset: [0, 0.65, 0], rotation: [0, 0, 0], scale: [1.9, 1.3, 1.9], color: "#3a7a4e" },
    ],
  },
  {
    id: "bush_round",
    category: "nature",
    label: "화단 관목",
    description: "낮은 둥근 덤불",
    footprint: 0.5,
    parts: [
      { kind: "sphere", offset: [0, 0.35, 0], rotation: [0, 0, 0], scale: [1.1, 0.7, 1.1], color: "#5a9a5d" },
      { kind: "sphere", offset: [0.35, 0.3, 0.2], rotation: [0, 0, 0], scale: [0.7, 0.55, 0.7], color: "#4f8f52" },
      { kind: "sphere", offset: [-0.3, 0.28, -0.25], rotation: [0, 0, 0], scale: [0.65, 0.5, 0.65], color: "#63a666" },
    ],
  },

  // ── vehicle ───────────────────────────────────────────────
  {
    id: "vehicle_sedan",
    category: "vehicle",
    label: "세단",
    description: "승용차 (본체+캐빈+바퀴4)",
    footprint: 1.3,
    parts: [
      { kind: "box", offset: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1.05, 0.55, 2.0], color: "#8a3f3f" },
      { kind: "box", offset: [0, 0.78, -0.1], rotation: [0, 0, 0], scale: [0.85, 0.42, 1.05], color: "#6f3232" },
      // 바퀴: cylinder는 기본적으로 Y축이 회전축이라 z축 90°로 눕혀야 좌우 축(X)에 걸리는 원판이 된다.
      {
        kind: "cylinder",
        offset: [0.6, 0.26, 0.72],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.85, 0.22, 0.85],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [-0.6, 0.26, 0.72],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.85, 0.22, 0.85],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [0.6, 0.26, -0.72],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.85, 0.22, 0.85],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [-0.6, 0.26, -0.72],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.85, 0.22, 0.85],
        color: "#1c1c1c",
      },
    ],
  },
  {
    id: "vehicle_bus",
    category: "vehicle",
    label: "버스",
    description: "박스형 대형차량 (블록아웃 수준 — 바퀴 4개로 단순화)",
    footprint: 2.0,
    parts: [
      { kind: "box", offset: [0, 1.25, 0], rotation: [0, 0, 0], scale: [2.4, 2.4, 6.5], color: "#3f6f8a" },
      { kind: "box", offset: [0, 1.9, 3.26], rotation: [0, 0, 0], scale: [2.3, 0.9, 0.05], color: "#a8cbe0" },
      // 바퀴 offset.y는 회전+스케일 후 바퀴 반지름(cylinder 기본 반지름 0.3 × scale.x 1.1 = 0.33)과
      // 같아야 지면(y=0)에 닿는다 — 세단 바퀴(반지름 0.255, offset.y 0.26)와 동일 원칙. 리뷰에서
      // 이 값이 0.55로 잘못돼 있어 바퀴가 지면 위 0.22m 떠 있는 버그를 발견해 0.33으로 수정함
      // (node+three.js로 world-space bbox 직접 계산해 확인).
      {
        kind: "cylinder",
        offset: [1.15, 0.33, 2.6],
        rotation: [0, 0, Math.PI / 2],
        scale: [1.1, 0.35, 1.1],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [-1.15, 0.33, 2.6],
        rotation: [0, 0, Math.PI / 2],
        scale: [1.1, 0.35, 1.1],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [1.15, 0.33, -2.6],
        rotation: [0, 0, Math.PI / 2],
        scale: [1.1, 0.35, 1.1],
        color: "#1c1c1c",
      },
      {
        kind: "cylinder",
        offset: [-1.15, 0.33, -2.6],
        rotation: [0, 0, Math.PI / 2],
        scale: [1.1, 0.35, 1.1],
        color: "#1c1c1c",
      },
    ],
  },

  // ── prop ──────────────────────────────────────────────────
  {
    id: "prop_streetlamp",
    category: "prop",
    label: "가로등",
    description: "기둥+팔+등",
    footprint: 0.4,
    parts: [
      { kind: "cylinder", offset: [0, 1.6, 0], rotation: [0, 0, 0], scale: [0.12, 3.2, 0.12], color: "#3a3a3a" },
      { kind: "box", offset: [0.35, 3.05, 0], rotation: [0, 0, 0], scale: [0.7, 0.08, 0.08], color: "#3a3a3a" },
      { kind: "sphere", offset: [0.68, 2.95, 0], rotation: [0, 0, 0], scale: [0.32, 0.32, 0.32], color: "#ffe9a8" },
    ],
  },
  {
    id: "prop_bench",
    category: "prop",
    label: "벤치",
    description: "좌석+등받이+다리2",
    footprint: 0.6,
    parts: [
      { kind: "box", offset: [0, 0.42, 0], rotation: [0, 0, 0], scale: [1.6, 0.08, 0.5], color: "#8a6b4a" },
      { kind: "box", offset: [0, 0.72, -0.21], rotation: [-0.17, 0, 0], scale: [1.6, 0.5, 0.08], color: "#8a6b4a" },
      { kind: "box", offset: [-0.65, 0.21, 0], rotation: [0, 0, 0], scale: [0.08, 0.42, 0.46], color: "#3a3a3a" },
      { kind: "box", offset: [0.65, 0.21, 0], rotation: [0, 0, 0], scale: [0.08, 0.42, 0.46], color: "#3a3a3a" },
    ],
  },
  {
    id: "prop_sign",
    category: "prop",
    label: "간판/표지판",
    description: "기둥+판",
    footprint: 0.3,
    parts: [
      { kind: "cylinder", offset: [0, 1.0, 0], rotation: [0, 0, 0], scale: [0.08, 2.0, 0.08], color: "#3a3a3a" },
      { kind: "box", offset: [0, 1.95, 0], rotation: [0, 0, 0], scale: [0.9, 0.6, 0.06], color: "#d64545" },
    ],
  },
  {
    id: "prop_trashcan",
    category: "prop",
    label: "쓰레기통",
    description: "몸통+뚜껑",
    footprint: 0.3,
    parts: [
      { kind: "cylinder", offset: [0, 0.45, 0], rotation: [0, 0, 0], scale: [0.9, 0.9, 0.9], color: "#4a6b4a" },
      { kind: "cylinder", offset: [0, 0.92, 0], rotation: [0, 0, 0], scale: [0.95, 0.08, 0.95], color: "#2f4a2f" },
    ],
  },
];

/**
 * 프리셋 템플릿을 실제 BgPrimitive[]로 전개한다. createPrimitive와 동일한 "찾기 쉬운 자리에
 * 결정적으로 흩뿌리기" 철학을 따르되(정확한 배치는 사용자가 TransformControls로 직접 잡음),
 * footprint가 프리셋마다 크게 달라 고정 0.8m 대신 footprint 비례 간격을 쓴다.
 */
export function instantiateCompositePreset(preset: BgCompositePreset, existingCount: number): BgPrimitive[] {
  const anchorX = (existingCount % 5) * preset.footprint * 1.5;
  return preset.parts.map((part) => ({
    id: uid(),
    kind: part.kind,
    position: [anchorX + part.offset[0], part.offset[1], part.offset[2]],
    rotation: [...part.rotation],
    scale: [...part.scale],
    color: part.color,
  }));
}
