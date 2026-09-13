// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneInteractiveDeck } from "./FortuneInteractiveDeck";
import { FortuneReadingTools, FortuneCreativeMission } from "./FortuneReadingTools";
import { FortuneStoryReader } from "./FortuneStoryReader";

vi.mock("./TarotCardFace", () => ({ TarotCardFace: () => <div>tarot face</div> }));
const reading: FortuneReading = { id: "cookie", title: "포춘쿠키", eyebrow: "오늘의 문장", summary: "한 칸의 여백", generatedFor: "2026-09-13", sections: [{ title: "두 번째 장면", body: "나만의 속도로", items: ["그림 한 컷"] }], notes: [] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function DeckHarness() { const [value, setValue] = useState<number | null>(null); return <FortuneInteractiveDeck value={value} onChange={setValue} three />; }
describe("fortune cinematic interactions", () => {
  it("requires explicit selection and resets it after a shuffle", () => {
    render(<DeckHarness />); expect(screen.getAllByRole("radio")).toHaveLength(22);
    expect(screen.queryByRole("radio", { checked: true })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "5번 카드" }));
    expect(screen.getByRole("radio", { checked: true }).getAttribute("value")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "카드 섞기" }));
    expect(screen.queryByRole("radio", { checked: true })).toBeNull();
    expect(new Set(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).size).toBe(22);
  });
  it("navigates every scene with buttons and keyboard without wrapping past endpoints", () => {
    render(<FortuneStoryReader reading={reading} />);
    expect(screen.getByRole("button", { name: "이전 컷" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "다음 컷" }), { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "두 번째 장면" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "다음 컷" }), { key: "End" });
    expect(screen.getByRole("heading", { name: "다음 장면은 내가 그려요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 컷" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "이전 컷" }), { key: "Home" });
    expect(screen.getByRole("heading", { name: "이야기의 첫 장" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "컷 전환 효과 끄기" }));
    expect(screen.getByRole("button", { name: "컷 전환 효과 켜기" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("shows manual copy text when clipboard permission is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<FortuneReadingTools reading={reading} />); expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "해석 복사" }));
    expect(await screen.findByRole("textbox", { name: "직접 복사할 해석" })).toBeTruthy();
  });
  it("does not copy anything when native sharing is canceled", async () => {
    const writeText = vi.fn(); const share = vi.fn().mockRejectedValue(new DOMException("Canceled", "AbortError"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<FortuneReadingTools reading={reading} />); fireEvent.click(screen.getByRole("button", { name: "해석 공유" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("공유를 취소"));
    expect(writeText).not.toHaveBeenCalled(); expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("keeps creative checklist state in the view and provides a real studio link", () => {
    render(<MemoryRouter><FortuneCreativeMission reading={reading} /></MemoryRouter>);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    expect(screen.getByText("3 / 3 완료")).toBeTruthy();
    expect(screen.getByRole("link", { name: "스튜디오에서 그리기" }).getAttribute("href")).toBe("/studio");
  });
});
