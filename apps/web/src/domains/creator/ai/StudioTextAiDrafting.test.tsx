// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioDialogueSuggestPanel } from "../StudioDialogueSuggestPanel";
import { StudioPaletteSuggestPanel } from "../StudioPaletteSuggestPanel";

afterEach(() => cleanup());

describe("Studio text AI drafting before connection", () => {
  it("keeps dialogue drafting available while generation stays safely disabled", () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <StudioDialogueSuggestPanel
          configured={false}
          situationText=""
          onSituationTextChange={onChange}
          hasContext={false}
          includeContext={false}
          onIncludeContextChange={vi.fn()}
          busy={false}
          error={null}
          candidates={null}
          onGenerate={vi.fn()}
          canInsertToSelected={false}
          onAddToScript={vi.fn()}
          onInsertToSelected={vi.fn()}
        />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/오랜만에 만난/u);
    expect(input.getAttribute("disabled")).toBeNull();
    fireEvent.change(input, { target: { value: "재회 장면" } });
    expect(onChange).toHaveBeenCalledWith("재회 장면");
    expect(screen.getByRole("button", { name: "대사 제안 받기" }).hasAttribute("disabled"))
      .toBe(true);
    expect(screen.getByRole("link", { name: "AI 설정 열기" })).not.toBeNull();
  });

  it("keeps palette drafting available while generation stays safely disabled", () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <StudioPaletteSuggestPanel
          configured={false}
          moodText=""
          onMoodTextChange={onChange}
          busy={false}
          error={null}
          suggestion={null}
          savedMessage={null}
          onGenerate={vi.fn()}
          onSaveToLibrary={vi.fn()}
        />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/스릴러/u);
    expect(input.getAttribute("disabled")).toBeNull();
    fireEvent.change(input, { target: { value: "차가운 누아르" } });
    expect(onChange).toHaveBeenCalledWith("차가운 누아르");
    expect(screen.getByRole("button", { name: "팔레트 추천받기" }).hasAttribute("disabled"))
      .toBe(true);
  });
});
