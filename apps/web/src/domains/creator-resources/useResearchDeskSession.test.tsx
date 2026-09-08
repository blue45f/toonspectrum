// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RESEARCH_DESK_SESSION_KEY,
  updateResearchDeskFocus,
} from "./research-desk-session";
import { useResearchDeskSession } from "./useResearchDeskSession";

function SessionHarness() {
  const { session, update, error } = useResearchDeskSession();
  return (
    <div>
      <label htmlFor="draft-title">리서치 이름</label>
      <input
        id="draft-title"
        value={session.title}
        onChange={(event) => update((current) => updateResearchDeskFocus(current, {
          title: event.target.value,
        }))}
      />
      <label htmlFor="draft-question">핵심 질문</label>
      <textarea
        id="draft-question"
        value={session.question}
        onChange={(event) => update((current) => updateResearchDeskFocus(current, {
          question: event.target.value,
        }))}
      />
      <output>{error}</output>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useResearchDeskSession", () => {
  it("keeps the current draft intact when browser storage rejects a later write", async () => {
    localStorage.setItem(RESEARCH_DESK_SESSION_KEY, JSON.stringify({
      version: 1,
      title: "기존 제목",
      question: "",
      context: "",
      intent: "scene",
      lastMode: "assets",
      history: [],
    }));
    render(<SessionHarness />);
    const title = screen.getByLabelText("리서치 이름") as HTMLInputElement;
    const question = screen.getByLabelText("핵심 질문") as HTMLTextAreaElement;
    await waitFor(() => expect(title.value).toBe("기존 제목"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    fireEvent.change(title, { target: { value: "새 제목 " } });
    fireEvent.change(question, { target: { value: "야간  역무실 질문" } });

    expect(title.value).toBe("새 제목 ");
    expect(question.value).toBe("야간  역무실 질문");
    expect(screen.getByText("quota exceeded")).toBeTruthy();
  });
});
