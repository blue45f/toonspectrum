// "3D 배경" 도구의 뷰포트 참고용 하늘색 프리셋. BgSceneState/BgPrimitive와 무관하며 undo
// 히스토리·내보내기(캡처) 어디에도 관여하지 않는다 — 내보내기는 항상 흰 배경 선화로 고정된다
// (studio-background-3d-primitives.ts 설계, StudioBackground3D.tsx handleInsert 참고).
// 따라서 이 프리셋은 순수하게 "작업 중 화면"에서 실루엣/분위기를 가늠하기 위한 장식이다.

export interface BgSkyPreset {
  id: string;
  label: string;
  clearColor: string; // three.js gl.setClearColor에 그대로 넘길 hex
}

export const BG_SKY_PRESETS: BgSkyPreset[] = [
  { id: "blank", label: "흰 배경(기본)", clearColor: "#ffffff" },
  { id: "clear_day", label: "맑은 낮", clearColor: "#bfe3f5" },
  { id: "sunset", label: "노을", clearColor: "#f2b183" },
  { id: "night", label: "밤", clearColor: "#1c2436" },
];

export const DEFAULT_SKY_PRESET_ID = "blank";

export function getSkyPreset(id: string): BgSkyPreset {
  return BG_SKY_PRESETS.find((p) => p.id === id) ?? BG_SKY_PRESETS[0];
}
