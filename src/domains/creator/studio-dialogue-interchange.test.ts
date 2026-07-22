import { describe, expect, it } from "vitest";

import {
  applyStudioDialogueInterchangeToPages,
  decodeStudioDialogueInterchangeText,
  parseStudioDialogueInterchange,
  serializeStudioDialogueInterchange,
  StudioDialogueInterchangeError,
  studioDialogueItemsToInterchange,
} from "./studio-dialogue-interchange";

const document = {
  title: "첫 화",
  language: "ko-KR",
  cues: [
    { id: "a", page: 1, panel: 1, speaker: "하나", text: "안녕,\n세계", note: "작게", startMs: 100, endMs: 2200 },
    { id: "b", page: 2, panel: 3, speaker: "둘", text: "=위험한 수식", startMs: 2500, endMs: 5000 },
  ],
} as const;

describe("studio dialogue interchange", () => {
  it("JSON은 메타데이터와 대사를 손실 없이 왕복한다", () => {
    const file = serializeStudioDialogueInterchange("json", document);
    expect(file.extension).toBe(".json");
    expect(file.lossy).toBe(false);
    expect(parseStudioDialogueInterchange("json", file.text).document).toEqual(document);
  });

  it.each(["csv", "tsv"] as const)("%s는 인용부호·개행·수식 시작 문자를 안전하게 직렬화한다", (format) => {
    const file = serializeStudioDialogueInterchange(format, document);
    expect(file.text).toContain("안녕");
    expect(file.text).toContain("'=위험한 수식");
    const parsed = parseStudioDialogueInterchange(format, file.text);
    expect(parsed.document.cues).toHaveLength(2);
    expect(parsed.document.cues[0]?.text).toBe("안녕,\n세계");
    // Spreadsheet formula hardening is intentionally visible and reversible by a user.
    expect(parsed.document.cues[1]?.text).toBe("'=위험한 수식");
  });

  it("한국어 CSV 헤더도 가져온다", () => {
    const parsed = parseStudioDialogueInterchange("csv", "페이지,컷,화자,대사\r\n1,2,주인공,도착했어\r\n");
    expect(parsed.document.cues).toEqual([{ page: 1, panel: 2, speaker: "주인공", text: "도착했어" }]);
  });

  it("TXT와 Markdown의 페이지·컷·화자 문법을 가져온다", () => {
    const source = "@페이지 2\n@컷 4\n하나: 첫 줄\n둘: 둘째 줄\n";
    expect(parseStudioDialogueInterchange("txt", source).document.cues).toEqual([
      { page: 2, panel: 4, speaker: "하나", text: "첫 줄" },
      { page: 2, panel: 4, speaker: "둘", text: "둘째 줄" },
    ]);
    const md = serializeStudioDialogueInterchange("markdown", document);
    expect(md.extension).toBe(".md");
    expect(parseStudioDialogueInterchange("markdown", md.text).document.cues).toHaveLength(2);
  });

  it("Fountain 페이지·패널 주석과 강제 character cue를 왕복한다", () => {
    const file = serializeStudioDialogueInterchange("fountain", document);
    expect(file.text).toContain("# PAGE 1");
    expect(file.text).toContain("[[PANEL 3]]");
    const parsed = parseStudioDialogueInterchange("fountain", file.text);
    expect(parsed.lossy).toBe(true);
    expect(parsed.document.cues.map(({ page, panel, speaker, text }) => ({ page, panel, speaker, text }))).toEqual([
      { page: 1, panel: 1, speaker: "하나", text: "안녕,\n세계" },
      { page: 2, panel: 3, speaker: "둘", text: "=위험한 수식" },
    ]);
  });

  it.each(["srt", "vtt"] as const)("%s는 타임코드와 화자를 왕복한다", (format) => {
    const file = serializeStudioDialogueInterchange(format, document);
    const parsed = parseStudioDialogueInterchange(format, file.text);
    expect(parsed.document.cues[0]).toMatchObject({
      page: 1,
      speaker: "하나",
      text: "안녕,\n세계",
      startMs: 100,
      endMs: 2200,
    });
    expect(parsed.lossy).toBe(true);
  });

  it("시간이 없으면 자막에 결정적인 3초 구간을 배정하고 경고한다", () => {
    const file = serializeStudioDialogueInterchange("vtt", { cues: [{ page: 1, text: "안녕" }] });
    expect(file.text).toContain("00:00:00.000 --> 00:00:03.000");
    expect(file.warnings.join(" ")).toContain("자동 배정");
  });

  it("UTF-8 BOM을 제거하고 잘못된 UTF-8은 거부한다", () => {
    expect(decodeStudioDialogueInterchangeText(new TextEncoder().encode("\uFEFF안녕"))).toBe("안녕");
    expect(() => decodeStudioDialogueInterchangeText(new Uint8Array([0xc3, 0x28]))).toThrowError(
      StudioDialogueInterchangeError
    );
  });

  it("CSV 미닫힌 quote, JSON 알 수 없는 cue 필드와 뒤집힌 시간은 fail-closed한다", () => {
    expect(() => parseStudioDialogueInterchange("csv", 'page,text\n1,"열림')).toThrow(/따옴표/u);
    expect(() => parseStudioDialogueInterchange("json", JSON.stringify({
      schema: "toonspectrum.dialogue-script",
      version: 1,
      cues: [{ page: 1, text: "x", javascript: "alert(1)" }],
    }))).toThrow(/알 수 없는 필드/u);
    expect(() => serializeStudioDialogueInterchange("json", {
      cues: [{ page: 1, text: "x", startMs: 20, endMs: 10 }],
    })).toThrow(/시간 범위/u);
  });

  it("기존 dialogue batch items를 1-based 페이지/컷 cue로 바꾼다", () => {
    expect(studioDialogueItemsToInterchange([
      { id: "a", pageId: "p1", pageIndex: 0, elType: "bubble", text: "A", hidden: false, locked: false },
      { id: "b", pageId: "p1", pageIndex: 0, elType: "text", text: "B", hidden: true, locked: false },
      { id: "c", pageId: "p2", pageIndex: 1, elType: "bubble", text: "C", hidden: false, locked: true },
    ], { title: "작품" })).toEqual({
      title: "작품",
      cues: [
        { id: "a", page: 1, panel: 1, text: "A" },
        { id: "b", page: 1, panel: 2, text: "B", note: "hidden" },
        { id: "c", page: 2, panel: 1, text: "C", note: "locked" },
      ],
    });
  });

  it("가져온 번역은 id → 페이지 순서 → 문서 순서로 기존 대사에만 비파괴 적용한다", () => {
    const pages = [
      {
        id: "p1",
        elements: [
          { id: "a", type: "bubble", text: "A", x: 0, y: 0 },
          { id: "b", type: "text", text: "B", x: 0, y: 100, locked: true },
        ],
      },
      { id: "p2", elements: [{ id: "c", type: "bubble", text: "C", x: 0, y: 0 }] },
    ];
    const result = applyStudioDialogueInterchangeToPages(pages, {
      cues: [
        { id: "c", page: 99, text: "C-id", speaker: "화자" },
        { page: 1, panel: 2, text: "B-locked" },
        { page: 9, text: "missing" },
      ],
    });
    expect(result).toMatchObject({ matched: 2, changed: 1, locked: 1, missing: 1, droppedMetadata: 1 });
    expect(result.pages[1]?.elements[0]?.text).toBe("C-id");
    expect(result.pages[0]?.elements[1]?.text).toBe("B");
    expect(pages[1]?.elements[0]?.text).toBe("C");
  });

  it("id-only 모드는 id 없는 cue를 추측 적용하지 않고 무변경 참조를 보존한다", () => {
    const pages = [{ id: "p", elements: [{ id: "a", type: "bubble", text: "A" }] }];
    const result = applyStudioDialogueInterchangeToPages(pages, {
      cues: [{ page: 1, panel: 1, text: "B" }],
    }, "id");
    expect(result.pages).toBe(pages);
    expect(result).toMatchObject({ matched: 0, changed: 0, missing: 1 });
  });
});
