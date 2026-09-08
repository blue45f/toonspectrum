import type { LayerGroup } from "../studio-layers";
import type {
  StudioLayerColor,
  StudioLayerKind,
  StudioLayerNavigatorItem,
  StudioLayerRole,
} from "./studio-layer-navigator";
import { normalizeStudioLayerSearchText } from "./studio-layer-smart-views";

const KIND_KEYWORDS: Record<Exclude<StudioLayerKind, "all">, readonly string[]> = {
  image: ["image", "raster", "이미지", "래스터", "사진"],
  text: ["text", "type", "텍스트", "글자", "대사"],
  bubble: ["bubble", "speech", "balloon", "말풍선", "대사"],
  draw: ["draw", "pen", "line", "stroke", "선화", "펜", "그리기", "도형"],
  frame: ["frame", "panel", "컷", "패널", "프레임"],
  sticker: ["sticker", "emoji", "스티커", "장식"],
  effect: ["effect", "focus", "speed", "효과", "집중선", "속도선"],
  other: ["other", "unknown", "기타", "알 수 없음"],
};

const ROLE_SEARCH_LABELS: Record<StudioLayerRole, string> = {
  storyboard: "콘티",
  rough: "밑그림",
  lineart: "선화",
  color: "채색",
  tone: "톤",
  lettering: "레터링",
  effect: "효과",
  reference: "참고",
};

const COLOR_SEARCH_LABELS: Record<StudioLayerColor, string> = {
  red: "빨강",
  orange: "주황",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  violet: "보라",
};

type StudioLayerSearchCacheEntry = {
  label: string;
  textContent: string | undefined;
  id: string;
  groupName: string | undefined;
  kind: Exclude<StudioLayerKind, "all">;
  role: StudioLayerRole | undefined;
  color: StudioLayerColor | undefined;
  haystack: string;
};

// 검색 문자열은 변경되지 않은 불변 레이어 객체별로 재사용한다.
const SEARCH_CACHE = new WeakMap<StudioLayerNavigatorItem, StudioLayerSearchCacheEntry>();

function bounded(value: string | null | undefined, maximum = 4_096): string {
  return value ? value.slice(0, maximum) : "";
}

export function searchStudioLayerHaystack(
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null
): string {
  const cached = SEARCH_CACHE.get(item);
  if (
    cached?.label === item.label &&
    cached.textContent === item.textContent &&
    cached.id === item.id &&
    cached.groupName === group?.name &&
    cached.kind === kind &&
    cached.role === item.role &&
    cached.color === item.color
  ) {
    return cached.haystack;
  }

  const haystack = normalizeStudioLayerSearchText(
    [
      bounded(item.label, 512),
      bounded(item.textContent),
      bounded(item.id, 256),
      bounded(group?.name, 256),
      ...KIND_KEYWORDS[kind],
      item.role ? `${item.role} ${ROLE_SEARCH_LABELS[item.role]}` : "",
      item.color ? `${item.color} ${COLOR_SEARCH_LABELS[item.color]}` : "",
    ].join(" ")
  );

  SEARCH_CACHE.set(item, {
    label: item.label,
    textContent: item.textContent,
    id: item.id,
    groupName: group?.name,
    kind,
    role: item.role,
    color: item.color,
    haystack,
  });
  return haystack;
}
