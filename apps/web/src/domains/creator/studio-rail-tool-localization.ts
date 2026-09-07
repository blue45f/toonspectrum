/**
 * 좌측 도구막대 라벨의 로케일 전환.
 *
 * 도구막대와 설정 화면은 같은 `STUDIO_RAIL_TOOL_CATALOG` 이름을 사용한다. JSX에 남아 있는
 * 과거 저작 문구는 번역이 아직 준비되지 않았을 때만 fallback으로 사용한다. 이렇게 해야
 * `채우기/색 채우기`, `스포이드/색 가져오기`, `핸드/화면 이동`처럼 같은 기능이 화면마다
 * 다르게 불리는 일을 막을 수 있다.
 */

import "./studio-rail-groups.css";

import { studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";

/** 번역기가 키를 못 찾으면 키 문자열을 그대로 돌려준다. 그 경우엔 원문을 지켜야 한다. */
function isMissingTranslation(value: string, id: string): boolean {
  return value === id || value.startsWith("studio.");
}

export function isKoreanUiLocale(lang: string | undefined): boolean {
  return (lang ?? "").toLowerCase().startsWith("ko");
}

/**
 * 원문 라벨 끝의 괄호에서 실제 조작 단서만 옮긴다.
 * `(팬)` 같은 동의어는 버리고 `(V)`, `(I / Alt+클릭)`, `(Home)` 같은 키 안내는 유지한다.
 */
const SHORTCUT_SUFFIX = /\s*\(([^()]*)\)\s*$/u;
const NON_SHORTCUT_SUFFIXES = new Set(["팬"]);

export function studioRailShortcutSuffix(authoredLabel: string): string | null {
  const match = SHORTCUT_SUFFIX.exec(authoredLabel);
  if (!match) return null;
  const inner = match[1].trim();
  if (inner.length === 0 || NON_SHORTCUT_SUFFIXES.has(inner)) return null;
  return /[A-Za-z0-9]/u.test(inner) ? inner : null;
}

/**
 * 도구막대 버튼 한 개의 표시 라벨. 로케일 팩에 같은 카탈로그 키가 있으면 한국어를 포함해
 * 반드시 그 이름을 사용하고, 저자가 붙인 단축키 표기만 뒤에 보존한다.
 */
export function localizeStudioRailToolLabel(input: {
  readonly toolId: string | undefined;
  readonly authoredLabel: string;
  readonly lang: string | undefined;
  readonly t: ((key: string) => string) | undefined;
}): string {
  const { toolId, authoredLabel, t } = input;
  if (!toolId || !t) return authoredLabel;
  const translated = studioRailToolLabel(toolId as StudioRailToolId, t);
  if (isMissingTranslation(translated, toolId)) return authoredLabel;
  const shortcut = studioRailShortcutSuffix(authoredLabel);
  return shortcut ? `${translated} (${shortcut})` : translated;
}

/** 카탈로그 도구가 아닌 도구막대 셸 문구 — 컨테이너 이름과 그룹 구분선. */
const STUDIO_RAIL_SHELL_EN: Readonly<Record<string, string>> = {
  "그리기 도구": "Drawing tools",
  "스튜디오 도구": "Studio tools",
  "선택·이동": "Select & move",
  그리기: "Draw",
  "채색·보정": "Paint & retouch",
  "선택 범위": "Selection",
  변형: "Transform",
  오브젝트: "Objects",
  "3D·참고": "3D & reference",
  보기: "View",
  "더보기 · 툴바 설정": "More · toolbar settings",
  "애플리케이션 설정": "Application settings",
};

/**
 * 스튜디오 로케일 팩이 실제로 붙었는지 확인하는 탐침.
 * 팩이 아직 오지 않았으면 셸과 버튼 모두 저작 문구를 유지해 언어가 섞이지 않게 한다.
 */
const STUDIO_LOCALE_PROBE_KEY = "studio.settings.tool.select";

function hasStudioLocalePack(t: ((key: string) => string) | undefined): boolean {
  if (!t) return false;
  return !isMissingTranslation(t(STUDIO_LOCALE_PROBE_KEY), STUDIO_LOCALE_PROBE_KEY);
}

/**
 * 도구막대 셸 문구의 로케일 전환. 팩에 대응 키가 없는 소수 문구는 모듈 내 표를 쓰고,
 * 영어 외 로케일의 미번역 상태에는 영어 pending-translation 관례를 따른다.
 */
export function localizeStudioRailShellText(
  authored: string,
  lang: string | undefined,
  t?: (key: string) => string
): string {
  if (isKoreanUiLocale(lang) || !hasStudioLocalePack(t)) return authored;
  return STUDIO_RAIL_SHELL_EN[authored] ?? authored;
}
