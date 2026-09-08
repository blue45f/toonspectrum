import type { StudioLayerColor, StudioLayerKind, StudioLayerRole } from "./studio-layer-navigator";
import type { StudioLayerSmartView } from "./studio-layer-smart-views";
import type { StudioLayerQueryState } from "./studio-layer-query-types";
import { normalizeStudioLayerSearchText } from "./studio-layer-smart-views";

export type StudioLayerQueryField =
  | "kind"
  | "role"
  | "color"
  | "group"
  | "id"
  | "name"
  | "content"
  | "state"
  | "opacity"
  | "smart";

export const QUERY_FIELD_ALIASES = new Map<string, StudioLayerQueryField>([
  ["kind", "kind"], ["type", "kind"], ["종류", "kind"], ["유형", "kind"],
  ["role", "role"], ["역할", "role"],
  ["color", "color"], ["colour", "color"], ["label", "color"], ["색", "color"], ["라벨", "color"],
  ["group", "group"], ["folder", "group"], ["그룹", "group"], ["폴더", "group"],
  ["id", "id"], ["name", "name"], ["이름", "name"],
  ["text", "content"], ["content", "content"], ["대사", "content"], ["내용", "content"],
  ["is", "state"], ["has", "state"], ["state", "state"], ["flag", "state"], ["상태", "state"], ["속성", "state"], ["기능", "state"],
  ["opacity", "opacity"], ["alpha", "opacity"], ["불투명도", "opacity"],
  ["view", "smart"], ["smart", "smart"], ["보기", "smart"], ["스마트", "smart"],
]);

function buildAliasMap<Value extends string>(
  entries: readonly (readonly [Value, readonly string[]])[]
): Map<string, Value> {
  const aliases = new Map<string, Value>();
  for (const [value, names] of entries) {
    aliases.set(normalizeStudioLayerSearchText(value), value);
    for (const name of names) aliases.set(normalizeStudioLayerSearchText(name), value);
  }
  return aliases;
}

export const QUERY_KIND_ALIASES = buildAliasMap<Exclude<StudioLayerKind, "all">>([
  ["image", ["raster", "이미지", "래스터", "사진"]],
  ["text", ["type", "텍스트", "글자"]],
  ["bubble", ["speech", "balloon", "말풍선", "대사"]],
  ["draw", ["pen", "line", "stroke", "선화", "펜", "그리기", "도형"]],
  ["frame", ["panel", "컷", "패널", "프레임"]],
  ["sticker", ["emoji", "스티커", "장식"]],
  ["effect", ["focus", "speed", "효과", "집중선", "속도선"]],
  ["other", ["unknown", "기타", "알 수 없음"]],
]);

export const QUERY_ROLE_ALIASES = buildAliasMap<StudioLayerRole | "none">([
  ["storyboard", ["콘티", "스토리보드"]],
  ["rough", ["밑그림", "러프"]],
  ["lineart", ["선화", "라인아트"]],
  ["color", ["채색", "컬러"]],
  ["tone", ["톤", "스크린톤"]],
  ["lettering", ["레터링", "식자"]],
  ["effect", ["효과", "이펙트"]],
  ["reference", ["참고", "참조"]],
  ["none", ["없음", "미지정", "unassigned"]],
]);

export const QUERY_COLOR_ALIASES = buildAliasMap<StudioLayerColor | "none">([
  ["red", ["빨강", "빨간색"]],
  ["orange", ["주황", "주황색"]],
  ["yellow", ["노랑", "노란색"]],
  ["green", ["초록", "초록색"]],
  ["blue", ["파랑", "파란색"]],
  ["violet", ["purple", "보라", "보라색"]],
  ["none", ["없음", "미지정", "unassigned"]],
]);

export const QUERY_SMART_ALIASES = buildAliasMap<Exclude<StudioLayerSmartView, "all">>([
  ["editable", ["edit", "편집", "편집 가능", "바로 편집 가능"]],
  ["attention", ["review", "issue", "확인", "확인 필요", "검수"]],
  ["output", ["export", "final", "출력", "출력 후보", "최종"]],
  ["unclassified", ["unassigned", "분류 미완료", "미분류"]],
  ["advanced", ["complex", "합성", "모션", "합성 모션"]],
]);

export const QUERY_STATE_ALIASES = buildAliasMap<StudioLayerQueryState>([
  ["visible", ["shown", "show", "표시", "보임"]],
  ["hidden", ["hide", "숨김", "숨긴"]],
  ["locked", ["lock", "잠금", "잠김"]],
  ["unlocked", ["unlock", "잠금 해제", "안 잠김"]],
  ["masked", ["mask", "마스크"]],
  ["unmasked", ["no-mask", "마스크 없음"]],
  ["mask-enabled", ["enabled-mask", "마스크 켜짐", "활성 마스크"]],
  ["mask-disabled", ["disabled-mask", "마스크 꺼짐", "비활성 마스크"]],
  ["reference", ["ref", "fill-reference", "채우기 참조", "참조"]],
  ["alpha-locked", ["alpha-lock", "알파 락", "투명 픽셀 잠금"]],
  ["ai", ["ai-generated", "ai 작업", "ai 생성"]],
  ["clipped", ["clip", "clipping", "클리핑", "아래 클리핑"]],
  ["animated", ["animation", "애니메이션", "모션"]],
  ["grouped", ["in-group", "그룹", "그룹 소속"]],
  ["ungrouped", ["no-group", "그룹 없음", "그룹 밖"]],
  ["role", ["has-role", "역할 있음"]],
  ["no-role", ["without-role", "역할 없음"]],
  ["color", ["has-color", "색 있음", "라벨 있음"]],
  ["no-color", ["without-color", "색 없음", "라벨 없음"]],
  ["text", ["has-text", "대사 있음", "텍스트 있음"]],
  ["no-text", ["without-text", "대사 없음", "텍스트 없음"]],
  ["default-name", ["generic-name", "기본 이름", "자동 이름"]],
  ["unknown-kind", ["unknown-type", "알 수 없는 종류", "미지원 종류"]],
  ["zero-opacity", ["transparent", "0% 불투명도", "완전 투명"]],
  ["orphan-group", ["missing-group", "손상 그룹", "없는 그룹"]],
  ["editable", ["edit", "편집 가능"]],
  ["attention", ["review", "issue", "확인 필요", "검수"]],
  ["output", ["export", "final", "출력 후보", "최종"]],
  ["unclassified", ["unassigned", "분류 미완료", "미분류"]],
  ["advanced", ["complex", "합성 모션", "고급"]],
]);
