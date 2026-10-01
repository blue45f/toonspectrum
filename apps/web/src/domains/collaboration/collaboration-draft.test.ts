import { describe, expect, it } from "vitest";

import {
  collaborationTemplate,
  emptyCollaborationDraft,
  parseCollaborationTemplate,
  readCollaborationDraft,
  saveCollaborationDraft,
  startCollaborationEditor,
} from "./collaboration-draft";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("작성 예시 주소 값", () => {
  it("아는 예시 종류만 읽고 나머지는 무시한다", () => {
    expect(parseCollaborationTemplate("ink")).toBe("ink");
    expect(parseCollaborationTemplate("background")).toBe("background");
    expect(parseCollaborationTemplate("team")).toBe("team");
    expect(parseCollaborationTemplate("INK")).toBeNull();
    expect(parseCollaborationTemplate("<script>")).toBeNull();
    expect(parseCollaborationTemplate("")).toBeNull();
    expect(parseCollaborationTemplate(null)).toBeNull();
  });

  it("예시마다 공고 종류와 작업 분야를 맞춰 채운다", () => {
    expect(collaborationTemplate("team")).toMatchObject({ type: "team", role: "story" });
    expect(collaborationTemplate("background")).toMatchObject({ type: "commission", role: "background" });
    expect(collaborationTemplate("ink")).toMatchObject({ type: "commission", role: "ink" });
    expect(collaborationTemplate("ink").title).not.toBe("");
  });
});

describe("새 공고 작성 시작 내용", () => {
  it("쓰던 초안이 있으면 예시 요청보다 초안을 먼저 열고, 건너뛴 사실을 알린다", () => {
    const draft = { ...emptyCollaborationDraft(), title: "쓰던 공고" };
    const start = startCollaborationEditor(draft, "background", emptyCollaborationDraft());
    expect(start.source).toBe("draft");
    expect(start.input.title).toBe("쓰던 공고");
    expect(start.templateSkipped).toBe(true);
  });

  it("초안이 없으면 요청한 예시로 채운다", () => {
    const start = startCollaborationEditor(null, "background", emptyCollaborationDraft());
    expect(start.source).toBe("template");
    expect(start.input).toEqual(collaborationTemplate("background"));
    expect(start.templateSkipped).toBe(false);
  });

  it("초안도 예시 요청도 없으면 빈 양식으로 시작한다", () => {
    const blank = emptyCollaborationDraft();
    const start = startCollaborationEditor(null, null, blank);
    expect(start).toEqual({ input: blank, source: "blank", templateSkipped: false });
  });

  it("예시 요청이 없으면 초안을 열어도 건너뛴 것으로 보지 않는다", () => {
    const draft = { ...emptyCollaborationDraft(), title: "쓰던 공고" };
    expect(startCollaborationEditor(draft, null, emptyCollaborationDraft()).templateSkipped).toBe(false);
  });
});

describe("기기 초안 저장", () => {
  it("저장한 예시 초안을 그대로 다시 읽는다", () => {
    const storage = memoryStorage();
    const input = collaborationTemplate("team");
    expect(saveCollaborationDraft(storage, "user-1", input)).toBe(true);
    expect(readCollaborationDraft(storage, "user-1")).toEqual(input);
    expect(readCollaborationDraft(storage, "user-2")).toBeNull();
  });
});
