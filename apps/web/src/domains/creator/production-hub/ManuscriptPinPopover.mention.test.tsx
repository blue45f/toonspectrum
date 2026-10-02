// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { ManuscriptPinAssigneeOption } from "./manuscript-pin-feedback-model";
import { ManuscriptPinDraftPopover } from "./ManuscriptPinPopover";

const OPTIONS: readonly ManuscriptPinAssigneeOption[] = [
  { id: "u1", displayName: "김작가", detail: "스토리" },
  { id: "u2", displayName: "김연출" },
  { id: "u3", displayName: "이편집" },
];

function DraftHarness() {
  const [body, setBody] = useState("");
  return (
    <ManuscriptPinDraftPopover
      anchorX={0.2}
      anchorY={0.2}
      pinNumber={1}
      authorName="나"
      createdAt="2026-10-03T00:00:00.000Z"
      overlapWarning={false}
      body={body}
      urgent={false}
      onBodyChange={setBody}
      onUrgentChange={() => undefined}
      onSubmit={() => undefined}
      onCancel={() => undefined}
      mentionOptions={OPTIONS}
    />
  );
}

function typeMention(textarea: HTMLTextAreaElement, value: string): void {
  fireEvent.change(textarea, { target: { value } });
  textarea.setSelectionRange(value.length, value.length);
  fireEvent.select(textarea);
}

describe("ManuscriptPinDraftPopover @멘션 자동완성", () => {
  it("@를 입력하면 후보가 뜨고 클릭하면 '@이름 '이 삽입된다", () => {
    render(<DraftHarness />);
    const textarea = screen.getByLabelText("새 핀 코멘트") as HTMLTextAreaElement;
    typeMention(textarea, "@김");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: /김작가/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /이편집/ })).toBeNull();

    fireEvent.mouseDown(screen.getByRole("option", { name: /김연출/ }));
    expect(textarea.value).toBe("@김연출 ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("방향키로 이동하고 Enter로 선택하며, Escape는 후보만 닫는다", () => {
    render(<DraftHarness />);
    const textarea = screen.getByLabelText("새 핀 코멘트") as HTMLTextAreaElement;
    typeMention(textarea, "@김");
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea.value).toBe("@김연출 ");

    typeMention(textarea, "@이");
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(textarea.value).toBe("@이");
  });

  it("후보가 없으면 목록이 뜨지 않는다", () => {
    render(<DraftHarness />);
    const textarea = screen.getByLabelText("새 핀 코멘트") as HTMLTextAreaElement;
    typeMention(textarea, "그냥 문장");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
