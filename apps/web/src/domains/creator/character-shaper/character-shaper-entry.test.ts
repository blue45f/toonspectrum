// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  CHARACTER_SHAPER_EDITOR_HREF,
  characterShaperEditorSearch,
  hasCharacterShaperEditorHistoryMark,
  isCharacterShaperEditorRequested,
  probeCharacterShaperWebGl,
  resolveCharacterShaperEntryHref,
} from "./character-shaper-entry";

describe("캐릭터 셰이퍼 진입 계약", () => {
  it("랜딩의 ?editor=open 한 가지만 편집기 요청으로 본다", () => {
    expect(isCharacterShaperEditorRequested(new URLSearchParams("editor=open"))).toBe(true);
    expect(isCharacterShaperEditorRequested(new URLSearchParams("editor=1"))).toBe(false);
    expect(isCharacterShaperEditorRequested(new URLSearchParams(""))).toBe(false);
    expect(CHARACTER_SHAPER_EDITOR_HREF).toBe("/studio/assets/characters/new?editor=open");
  });

  it("다른 매개변수는 보존하고 편집기 매개변수만 켜고 끈다", () => {
    expect(characterShaperEditorSearch(new URLSearchParams("ref=seminar"), true)).toBe("?ref=seminar&editor=open");
    expect(characterShaperEditorSearch(new URLSearchParams("ref=seminar&editor=open"), false)).toBe("?ref=seminar");
    expect(characterShaperEditorSearch(new URLSearchParams("editor=open"), false)).toBe("");
  });

  it("랜딩으로 되돌아오는 예전 작업실 경로만 편집기 주소로 바꾼다", () => {
    expect(resolveCharacterShaperEntryHref("/studio/character")).toBe(CHARACTER_SHAPER_EDITOR_HREF);
    expect(resolveCharacterShaperEntryHref("/studio/poser")).toBe("/studio/poser");
    expect(resolveCharacterShaperEntryHref("/studio/character-convert")).toBe("/studio/character-convert");
  });

  it("이 페이지에서 연 기록만 뒤로 가기로 닫는다", () => {
    expect(hasCharacterShaperEditorHistoryMark({ characterShaperEditor: true })).toBe(true);
    expect(hasCharacterShaperEditorHistoryMark({ characterShaperEditor: "yes" })).toBe(false);
    expect(hasCharacterShaperEditorHistoryMark(null)).toBe(false);
  });

  it("WebGL 컨텍스트가 없으면 unsupported, 있으면 확인용 컨텍스트를 반납한다", () => {
    const loseContext = vi.fn();
    const supported = {
      createElement: () => ({
        getContext: (kind: string) => (kind === "webgl2"
          ? { getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null) }
          : null),
      }),
    } as unknown as Document;
    expect(probeCharacterShaperWebGl(supported)).toBe("supported");
    expect(loseContext).toHaveBeenCalledTimes(1);

    const missing = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(probeCharacterShaperWebGl(missing)).toBe("unsupported");

    const throwing = { createElement: () => ({ getContext: () => { throw new Error("blocked"); } }) } as unknown as Document;
    expect(probeCharacterShaperWebGl(throwing)).toBe("unsupported");
  });
});
