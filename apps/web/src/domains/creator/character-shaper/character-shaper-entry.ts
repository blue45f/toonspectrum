/**
 * 캐릭터 셰이퍼 진입 계약.
 *
 * `/studio/character`는 Studio 편집기의 캐릭터 표면이다(새 초안에서 셰이퍼를 열 때 쓰는 주소).
 * 캐릭터 소재 랜딩(`/studio/assets/characters/new`)은 `?editor=open` 한 개의 검색 매개변수로
 * 단독 편집기를 제자리에서 연다. URL이 열린 상태의 유일한 기준이라 공유 링크·뒤로 가기·
 * 새로고침이 같은 결과를 낸다.
 */

export const CHARACTER_SHAPER_LANDING_PATH = "/studio/assets/characters/new";
/** 학습 센터 데이터에 남아 있는 예전 작업실 경로(편집기 캐릭터 표면). */
export const CHARACTER_SHAPER_LEGACY_STUDIO_PATH = "/studio/character";
export const CHARACTER_SHAPER_EDITOR_PARAM = "editor";
export const CHARACTER_SHAPER_EDITOR_OPEN = "open";
export const CHARACTER_SHAPER_EDITOR_HREF =
  `${CHARACTER_SHAPER_LANDING_PATH}?${CHARACTER_SHAPER_EDITOR_PARAM}=${CHARACTER_SHAPER_EDITOR_OPEN}`;

/** 편집기를 연 기록인지 뒤로 가기에서 구분하려고 history state에 남기는 표식. */
export const CHARACTER_SHAPER_EDITOR_HISTORY_MARK = "characterShaperEditor";

export function isCharacterShaperEditorRequested(search: URLSearchParams): boolean {
  return search.get(CHARACTER_SHAPER_EDITOR_PARAM) === CHARACTER_SHAPER_EDITOR_OPEN;
}

/** 다른 매개변수는 보존하고 편집기 매개변수만 켜거나 끈 검색 문자열을 만든다. */
export function characterShaperEditorSearch(search: URLSearchParams, open: boolean): string {
  const next = new URLSearchParams(search);
  if (open) next.set(CHARACTER_SHAPER_EDITOR_PARAM, CHARACTER_SHAPER_EDITOR_OPEN);
  else next.delete(CHARACTER_SHAPER_EDITOR_PARAM);
  const serialized = next.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

/**
 * 학습 센터처럼 예전 작업실 경로를 데이터로 가진 링크를, 랜딩으로 되돌아오지 않고
 * 편집기를 바로 여는 주소로 바꾼다. 다른 경로는 그대로 둔다.
 */
export function resolveCharacterShaperEntryHref(href: string): string {
  return href === CHARACTER_SHAPER_LEGACY_STUDIO_PATH ? CHARACTER_SHAPER_EDITOR_HREF : href;
}

export function hasCharacterShaperEditorHistoryMark(state: unknown): boolean {
  return typeof state === "object"
    && state !== null
    && (state as Record<string, unknown>)[CHARACTER_SHAPER_EDITOR_HISTORY_MARK] === true;
}

export type CharacterShaperWebGlSupport = "supported" | "unsupported";

/**
 * 3D 편집기를 열기 전에 WebGL 컨텍스트를 만들 수 있는지 한 번 확인한다. 확인용 컨텍스트는
 * 바로 반납해 브라우저의 동시 컨텍스트 한도를 쓰지 않는다. 렌더링 품질이나 성능을 보증하지 않는다.
 */
export function probeCharacterShaperWebGl(doc: Document | undefined = globalThis.document): CharacterShaperWebGlSupport {
  if (!doc) return "unsupported";
  try {
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return "unsupported";
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return "supported";
  } catch {
    return "unsupported";
  }
}
