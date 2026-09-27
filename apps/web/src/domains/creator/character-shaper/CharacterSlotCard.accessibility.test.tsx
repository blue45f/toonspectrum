// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterSlotCard } from "./CharacterSlotCard";

import type { CharacterSlotEntry } from "./character-shaper-contract";

vi.mock("./character-shaper-preview", () => ({ CharacterSlotPreview: () => <span aria-hidden>preview</span> }));
const thumbnail = vi.hoisted(() => ({ url: null as string | null }));
vi.mock("../character-platform/thumbnail/character-runtime-thumbnail-store", () => ({ useCharacterRuntimeThumbnail: () => thumbnail.url }));
afterEach(() => { cleanup(); thumbnail.url = null; });
const entry: CharacterSlotEntry = {
  id: "eyes:test", slot: "eyes", label: "모델별 지원 범위를 확인하는 눈 프리셋", hint: "테스트",
  tags: [], keywords: [], preview: { kind: "glyph", icon: "eye", caption: "눈" },
  apply: { kind: "none" }, requires: [], exportLayer: "eyes", license: "toonstudio-original", order: 0,
};
function card(status: "available" | "unavailable", onCommit = vi.fn(), onKeyNavigate = vi.fn()) {
  return <CharacterSlotCard entry={entry} selected={false} tabIndex={0}
    availability={{ status, reason: status === "unavailable" ? "이 모델에는 눈 크기 셰이프키가 없습니다." : null, missing: [] }}
    onCommit={onCommit} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={onKeyNavigate} />;
}
describe("CharacterSlotCard touch and keyboard accessibility", () => {
  it("compact 카드 이미지는 짧게 표시하고 지원 제한의 전체 설명과 접근성 연결을 유지한다", () => {
    render(<CharacterSlotCard entry={entry} selected={false} compact tabIndex={0}
      availability={{ status: "partial", reason: "이 모델의 눈 크기만 적용되며 홍채 모양은 유지됩니다.", missing: [] }}
      onCommit={vi.fn()} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.dataset.characterSlotCardCompact).toBe("true");
    expect(button.querySelector(".max-h-28")).not.toBeNull();
    const reason = screen.getByText("이 모델의 눈 크기만 적용되며 홍채 모양은 유지됩니다.");
    expect(reason.className.split(" ")).toContain("text-xs");
    expect(reason.className).not.toMatch(/truncate|line-clamp|hidden/u);
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it.each(["move", "cancel", "leave"] as const)("터치 %s 이후의 click은 적용하지 않고 새 탭만 한 번 적용한다", (ending) => {
    const commit = vi.fn(), preview = vi.fn();
    render(<CharacterSlotCard entry={entry} selected={false} tabIndex={0}
      availability={{ status: "available", reason: null, missing: [] }}
      onCommit={commit} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={vi.fn()} onPreviewStart={preview} />);
    const button = screen.getByRole("button");
    fireEvent.pointerEnter(button, { pointerType: "touch" });
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 20, clientY: 30 });
    fireEvent.focus(button);
    expect(preview).not.toHaveBeenCalled();
    if (ending === "move") fireEvent.pointerMove(button, { pointerType: "touch", clientX: 20, clientY: 70 });
    if (ending === "cancel") fireEvent.pointerCancel(button, { pointerType: "touch" });
    if (ending === "leave") fireEvent.pointerLeave(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button, { detail: 1 });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button, { detail: 1 });
    expect(commit).toHaveBeenCalledExactlyOnceWith(entry);
    expect(preview).not.toHaveBeenCalled();
  });

  it.each(["cancel", "leave", "move-end"] as const)("포커스 없는 터치 %s 이후 들어온 키보드 focus는 미리보기를 시작한다", (ending) => {
    const preview = vi.fn();
    render(<CharacterSlotCard entry={entry} selected={false} tabIndex={0}
      availability={{ status: "available", reason: null, missing: [] }}
      onCommit={vi.fn()} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={vi.fn()} onPreviewStart={preview} />);
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 20, clientY: 30 });
    if (ending === "cancel") fireEvent.pointerCancel(button, { pointerType: "touch" });
    if (ending === "leave") fireEvent.pointerLeave(button, { pointerType: "touch" });
    if (ending === "move-end") {
      fireEvent.pointerMove(button, { pointerType: "touch", clientX: 20, clientY: 70 });
      fireEvent.pointerUp(button, { pointerType: "touch" });
    }
    expect(preview).not.toHaveBeenCalled();
    fireEvent.focus(button);
    expect(preview).toHaveBeenCalledExactlyOnceWith(entry);
  });

  it("터치 뒤에도 키보드 탐색과 보조 기술의 명시적 활성화를 유지한다", () => {
    const commit = vi.fn(), preview = vi.fn(), navigate = vi.fn();
    render(<CharacterSlotCard entry={entry} selected={false} tabIndex={0}
      availability={{ status: "available", reason: null, missing: [] }}
      onCommit={commit} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={navigate} onPreviewStart={preview} />);
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true });
    fireEvent.focus(button);
    fireEvent.pointerCancel(button, { pointerType: "touch" });
    fireEvent.click(button, { detail: 0 });
    expect(commit).toHaveBeenCalledExactlyOnceWith(entry);
    fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(navigate).toHaveBeenCalledWith("right");
    expect(preview).toHaveBeenCalledExactlyOnceWith(entry);
    fireEvent.blur(button);
    fireEvent.focus(button);
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("clearly identifies illustrated shapes as diagrams rather than applied model previews", () => {
    render(card("available"));
    expect(screen.getByText("모양 도해").title).toContain("실제 적용 결과는 3D 화면에서 확인");
    expect(screen.queryByText("현재 조합 · 실제 3D")).toBeNull();
  });
  it("labels a valid selected capture as the whole current combination and preserves its aspect", () => {
    thumbnail.url = "blob:current-combination";
    const view = render(<CharacterSlotCard entry={entry} selected tabIndex={0}
      availability={{ status: "available", reason: null, missing: [] }}
      onCommit={vi.fn()} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={vi.fn()} />);
    expect(screen.getByText("현재 조합 · 실제 3D").title).toContain("전체 캐릭터 조합");
    const image = document.querySelector<HTMLImageElement>("img")!;
    expect(image.src).toBe("blob:current-combination");
    expect(image.className.split(" ")).toContain("object-contain");
    view.rerender(card("available"));
    expect(screen.getByText("모양 도해")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
  it("renders unsupported reason without hover-only or hidden classes", () => {
    render(card("unavailable"));
    const reason = screen.getByText("이 모델에는 눈 크기 셰이프키가 없습니다.");
    expect(reason.className.split(" ")).not.toContain("hidden");
    expect(reason.className).not.toContain("group-hover:");
    expect(screen.getByRole("button").getAttribute("aria-describedby")).toBe(reason.id);
  });
  it("does not commit an unsupported touch/click selection", () => {
    const commit = vi.fn(); render(card("unavailable", commit)); fireEvent.click(screen.getByRole("button")); expect(commit).not.toHaveBeenCalled();
  });
  it("keeps grid arrow navigation from also reaching an ancestor", () => {
    const parent = vi.fn(), navigate = vi.fn();
    render(card("available", vi.fn(), navigate));
    document.addEventListener("keydown", parent);
    try {
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowRight" });
      expect(navigate).toHaveBeenCalledWith("right"); expect(parent).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", parent);
    }
  });
  it("wraps a long label rather than truncating the only visible name", () => {
    render(card("available")); expect(screen.getByText(entry.label).className.split(" ")).not.toContain("truncate");
  });
  it("owns live audition across pointer and keyboard focus and labels the transient state", () => {
    const start = vi.fn(), end = vi.fn();
    render(<CharacterSlotCard entry={entry} selected={false} previewed tabIndex={0}
      availability={{ status: "available", reason: null, missing: [] }}
      onCommit={vi.fn()} onHover={vi.fn()} onFocus={vi.fn()} onKeyNavigate={vi.fn()}
      onPreviewStart={start} onPreviewEnd={end} />);
    const button = screen.getByRole("button");
    expect(button.dataset.characterSlotCardPreviewed).toBe("true");
    expect(screen.getByText("3D 미리보기")).toBeTruthy();

    fireEvent.pointerEnter(button);
    expect(start).toHaveBeenCalledWith(entry);
    fireEvent.pointerLeave(button);
    expect(end).toHaveBeenCalledWith(entry.id);

    fireEvent.focus(button);
    expect(start).toHaveBeenCalledTimes(2);
    fireEvent.blur(button);
    expect(end).toHaveBeenCalledTimes(2);
  });
});
