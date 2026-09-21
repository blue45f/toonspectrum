import { STUDIO_RAIL_TOOL_CATALOG, studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";

const ALIASES: Partial<Record<StudioRailToolId, string>> = {
  eyedropper: "스포이드 색상 추출 pipette color picker",
  hand: "핸드 팬 pan move",
  transform: "변형 크기 회전 resize rotate",
  blend: "블렌드 스머지 smudge",
  "wet-mix": "혼색 물감 wet paint",
  "dodge-burn": "닷지 번 명암 dodge burn",
  liquify: "픽셀 유동화 왜곡 warp",
  fill: "버킷 페인트 채우기 paint bucket",
  "marquee-rect": "마키 선택 영역 rectangle selection",
  reference: "레퍼런스 참고 이미지 reference image",
  bg3d: "3d 배경 장면 background scene",
};

/** Search uses the same names as settings, plus familiar drawing terms and shortcuts. */
export function matchesStudioRailToolQuery(
  id: StudioRailToolId,
  query: string,
  t?: (key: string) => string,
): boolean {
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim();
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  const tool = STUDIO_RAIL_TOOL_CATALOG.find((item) => item.id === id);
  const searchable = normalize([id, tool?.label, studioRailToolLabel(id, t),
    tool?.defaultShortcut, ALIASES[id]].filter(Boolean).join(" "));
  return terms.every((term) => searchable.includes(term));
}
