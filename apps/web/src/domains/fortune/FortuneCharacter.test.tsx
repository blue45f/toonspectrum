// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FORTUNE_EXPERIENCES } from "@toonspectrum/core/fortune";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { COMIC_CAST } from "@/shared/components/comic/comic-cast";
import { FortuneStoryReader } from "./FortuneStoryReader";
import { FortuneReadingView } from "./FortuneReadingView";
import { fortuneCharacterDirection } from "./fortune-character-direction";

vi.mock("./TarotCardFace", () => ({ TarotCardFace: () => <div>tarot</div> }));
const reading: FortuneReading = { id: "cookie", title: "포춘쿠키", eyebrow: "한 컷", summary: "원래 계산 결과를 그대로 유지", generatedFor: "2026-09-14", sections: [{ title: "다음 이야기", body: "누락하면 안 되는 상세 해석", items: ["단서"] }], notes: [] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("character interpretation", () => {
  it.each(FORTUNE_EXPERIENCES)("provides direction without mutating the $id reading", ({ id }) => {
    const source = { ...reading, id }; const before = JSON.stringify(source);
    for (const actor of COMIC_CAST) { const result = fortuneCharacterDirection(source, actor.id, 1, false); expect(result.lead.length).toBeGreaterThan(15); expect(result.companion).not.toBe(actor.id); }
    expect(JSON.stringify(source)).toBe(before);
  });
  it("does not frame money commentary as actual financial advice", () => {
    expect(fortuneCharacterDirection({ ...reading, id: "money" }, "ara", 1, false).lead).toContain("정보와 예산");
  });
  it("changes the presenter without losing the source, disables reactions, and enlarges text", () => {
    const { container } = render(<FortuneStoryReader reading={reading} />);
    fireEvent.click(screen.getByRole("button", { name: /단우 유쾌한 참견/ }));
    expect(screen.getByText(reading.summary)).toBeTruthy(); expect(screen.getByText(COMIC_CAST[1].intro)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 리액션 끄기" }));
    expect(container.querySelector('.comic-dialogue[data-aside="true"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "말풍선 글자 크게" }));
    expect(container.querySelector('[data-large-text="true"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 컷" }));
    expect(screen.getByText("누락하면 안 되는 상세 해석")).toBeTruthy();
  });
  it("keeps the same comic default and an explicit full report mode", () => {
    render(<MemoryRouter><FortuneReadingView reading={reading} cast="gaon" /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "웹툰으로 읽기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: /이 분위기로 모션 컷 만들기/ }).getAttribute("href")).toBe("/play?game=motion-panel&cast=gaon&mood=rest");
    fireEvent.click(screen.getByRole("button", { name: "상세 리포트" }));
    expect(screen.getByText("누락하면 안 되는 상세 해석")).toBeTruthy();
  });
});
