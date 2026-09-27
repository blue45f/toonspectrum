// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { CHARACTER_FAVORITES_KEY } from "./character-shaper-favorites";
import { pushCharacterShaperKeyLayer } from "./character-shaper-ui-model";
import { CharacterShaperShelf } from "./CharacterShaperShelf";

import type { CharacterRecipe, CharacterSlotEntry } from "./character-shaper-contract";
import type { CharacterShaperBinding, CharacterShaperShelfProps } from "./character-shaper-ui-contract";

const translations = vi.hoisted(() => new Map<string, string>());
vi.mock("@/shared/lib/i18n", () => ({ useT: () => (key: string, fallback: string) => translations.get(key) ?? fallback }));
vi.mock("./character-shaper-preview", () => ({ CharacterSlotPreview: () => <svg aria-hidden /> }));
vi.mock("./character-shaper-catalog", () => ({ CHARACTER_GENRE_TAG_LABELS: { school: "학원", daily: "일상" } }));

const entry = (id: string, label: string, slot: "accessory" | "hand-pose", featured = false): CharacterSlotEntry => ({
  id, label, slot, featured, hint: "프리셋", tags: ["school"], keywords: [],
  preview: { kind: "glyph", icon: "Eye", caption: "" }, apply: { kind: "none" },
  requires: [], exportLayer: "none", license: "toonstudio-original", order: 0,
});
const entries = [entry("accessory:glasses", "안경", "accessory", true), entry("accessory:hat", "모자", "accessory"),
  entry("accessory:pin", "머리핀", "accessory"), entry("hand-pose:peace", "브이", "hand-pose")];
const recipe: CharacterRecipe = {
  version: 1,
  slots: {
    "face-shape": null, eyes: null, irises: null, nose: null, mouth: null, ears: null,
    hair: null, body: null, top: null, bottom: null, shoes: null,
    accessory: ["accessory:glasses", "accessory:hat"], expression: null, pose: null, "hand-pose": null,
  },
  colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null }, handSide: "both",
};
function binding(overrides: Partial<CharacterShaperBinding> = {}): CharacterShaperBinding {
  return {
    catalog: { version: 1, slots: [
      { id: "accessory", label: "액세서리", labelEn: "Accessory", hint: "소품", group: "figure", icon: "Gem", multi: true },
      { id: "hand-pose", label: "손 포즈", labelEn: "Hand", hint: "손", group: "performance", icon: "Hand", multi: false },
    ], entries },
    profile: {} as CharacterShaperBinding["profile"], snapshot: {} as CharacterShaperBinding["snapshot"],
    recipe, baselineRecipe: recipe, history: { canUndo: false, canRedo: false, recentLabels: [], length: 0 },
    busyReason: null, compareActive: false, handSide: "both",
    evaluate: () => ({ status: "available", reason: null, missing: [] }),
    plan: vi.fn(), commit: vi.fn(), commitPreset: vi.fn(), clear: vi.fn(), remove: vi.fn(), setHandSide: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), setCompareActive: vi.fn(), resetToBaseline: vi.fn(),
    commitFaceParams: vi.fn(), commitSemanticMorphs: vi.fn(), commitHairParams: vi.fn(), commitColor: vi.fn(),
    ...overrides,
  };
}
function props(overrides: Partial<CharacterShaperShelfProps> = {}): CharacterShaperShelfProps {
  return { binding: binding(), slot: "accessory", query: "", tag: null, onQueryChange: vi.fn(),
    onTagChange: vi.fn(), onHoverEntry: vi.fn(), onCommitEntry: vi.fn(), ...overrides };
}
const advance = (ms = 130) => act(() => { vi.advanceTimersByTime(ms); });
const cards = () => Array.from(document.querySelectorAll<HTMLElement>("[data-character-slot-card]"));
const cardIds = () => cards().map((card) => card.dataset.characterSlotCard);

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); translations.clear(); });

describe("CharacterShaperShelf discovery integration", () => {
  it("모바일에서는 필터를 접고 카드를 먼저 보여주며 데스크톱 기본 계약을 보존한다", () => {
    const p = props(); const view = render(<CharacterShaperShelf {...p} compact />);
    const toggle = screen.getByRole("button", { name: "필터" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.hidden).toBe(true);
    expect(screen.queryByRole("group", { name: "장르 필터" })).toBeNull();
    expect(screen.queryByRole("group", { name: "프리셋 모아보기" })).toBeNull();
    expect(screen.queryByRole("region", { name: "추천" })).toBeNull();
    expect(screen.queryByRole("region", { name: "장착 중" })).toBeNull();
    expect(cards()).toHaveLength(3);
    expect(cards().every((card) => card.dataset.characterSlotCardCompact === "true")).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "장르 필터" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "추천" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "안경 해제" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole("group", { name: "장르 필터" })).toBeNull();
    view.rerender(<CharacterShaperShelf {...p} />);
    expect(screen.queryByRole("button", { name: "필터" })).toBeNull();
    expect(screen.getByRole("group", { name: "장르 필터" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "추천" })).toBeTruthy();
    expect(cards().every((card) => card.dataset.characterSlotCardCompact === undefined)).toBe(true);
  });

  it("필터와 터치 안내는 번역 키를 사용하고 누락된 문구에는 한국어 기본값을 표시한다", () => {
    translations.set("studio.character.shelf.filters", "Preset filters");
    const p = props({ compact: true });
    const view = render(<CharacterShaperShelf {...p} />);
    expect(screen.getByRole("button", { name: "Preset filters" })).toBeTruthy();
    expect(screen.getByText(/터치는 탭하면 적용되고 스크롤로는 바뀌지 않습니다/u)).toBeTruthy();
    translations.set("studio.character.shelf.interactionHint", "Tap to apply. Scrolling preserves the model.");
    view.rerender(<CharacterShaperShelf {...p} />);
    expect(screen.getByText("Tap to apply. Scrolling preserves the model.")).toBeTruthy();
    expect(screen.queryByText(/터치는 탭하면 적용되고 스크롤로는 바뀌지 않습니다/u)).toBeNull();
  });

  it("모바일 필터를 다시 접어도 필터 조건과 활성 개수를 유지한다", () => {
    const p = props({ compact: true, binding: binding({ evaluate: (item) => ({
      status: item.id === "accessory:glasses" ? "available" : "partial", reason: "지원 범위", missing: [],
    }) }) });
    render(<CharacterShaperShelf {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.click(screen.getByRole("button", { name: /완전 지원만/u }));
    fireEvent.click(screen.getByRole("button", { name: "필터 · 1" }));
    expect(cardIds()).toEqual(["accessory:glasses"]);
    expect(screen.queryByRole("button", { name: /완전 지원만/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "필터 · 1" }));
    expect(screen.getByRole("button", { name: /완전 지원만/u }).getAttribute("aria-pressed")).toBe("true");
    expect(p.onCommitEntry).not.toHaveBeenCalled();
  });

  it("모바일 손 적용 범위는 필터를 열지 않아도 선택할 수 있다", () => {
    const p = props({ compact: true, slot: "hand-pose" });
    render(<CharacterShaperShelf {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "왼손" }));
    expect(p.binding.setHandSide).toHaveBeenCalledWith("left");
    expect(screen.getByRole("button", { name: "필터" }).getAttribute("aria-expanded")).toBe("false");
  });

  it.each(["grid", "featured"] as const)("%s 카드는 터치 스크롤과 취소로 미리보기나 적용을 하지 않고 탭만 확정한다", (kind) => {
    const preview = vi.fn();
    const p = props({ binding: binding({ preview, recipe: { ...recipe, slots: { ...recipe.slots, accessory: [] } } }) });
    render(<CharacterShaperShelf {...p} />);
    const selector = kind === "grid" ? '[data-character-slot-card="accessory:glasses"]' : '[data-character-shaper-featured="accessory:glasses"]';
    const button = document.querySelector<HTMLButtonElement>(selector);
    expect(button).not.toBeNull();
    if (!button) throw new Error("프리셋 버튼이 없습니다.");
    fireEvent.pointerEnter(button, { pointerType: "touch" });
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 30, clientY: 30 });
    fireEvent.focus(button);
    advance(180);
    expect(preview).not.toHaveBeenCalled();
    fireEvent.pointerMove(button, { pointerType: "touch", clientX: 30, clientY: 90 });
    fireEvent.pointerCancel(button, { pointerType: "touch" });
    fireEvent.click(button, { detail: 1 });
    advance(180);
    expect(preview).not.toHaveBeenCalled();
    expect(p.onCommitEntry).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button, { detail: 1 });
    expect(p.onCommitEntry).toHaveBeenCalledExactlyOnceWith(entries[0]);
    expect(preview).not.toHaveBeenCalled();
  });

  it.each(["grid", "featured"] as const)("%s의 포커스 없는 터치 스크롤 취소 뒤 키보드 진입은 다시 미리 본다", (kind) => {
    const preview = vi.fn();
    const p = props({ binding: binding({ preview, recipe: { ...recipe, slots: { ...recipe.slots, accessory: [] } } }) });
    render(<CharacterShaperShelf {...p} />);
    const selector = kind === "grid" ? '[data-character-slot-card="accessory:glasses"]' : '[data-character-shaper-featured="accessory:glasses"]';
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error("프리셋 버튼이 없습니다.");
    fireEvent.pointerDown(button, { pointerType: "touch", isPrimary: true, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(button, { pointerType: "touch", clientX: 30, clientY: 90 });
    fireEvent.pointerCancel(button, { pointerType: "touch" });
    advance(180);
    expect(preview).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(button);
    if (kind === "grid") {
      const first = cards()[0];
      if (!first) throw new Error("첫 번째 카드가 없습니다.");
      act(() => { first.focus(); });
      fireEvent.keyDown(first, { key: "End" });
    } else {
      const search = screen.getByRole("searchbox");
      act(() => { search.focus(); });
      fireEvent.keyDown(search, { key: "Tab" });
      act(() => { button.focus(); });
    }
    advance(180);
    expect(document.activeElement).toBe(button);
    expect(preview).toHaveBeenCalledExactlyOnceWith(entries[0]);
    expect(p.onCommitEntry).not.toHaveBeenCalled();
  });

  it("추천은 마우스와 키보드로 미리 보고 필터를 접으면 예약된 미리보기를 취소한다", () => {
    const preview = vi.fn();
    const p = props({ compact: true, binding: binding({ preview, recipe: { ...recipe, slots: { ...recipe.slots, accessory: [] } } }) });
    render(<CharacterShaperShelf {...p} />);
    const toggle = screen.getByRole("button", { name: "필터" });
    fireEvent.click(toggle);
    const button = document.querySelector<HTMLButtonElement>('[data-character-shaper-featured="accessory:glasses"]');
    if (!button) throw new Error("추천 버튼이 없습니다.");
    fireEvent.pointerEnter(button, { pointerType: "mouse" }); advance(180);
    expect(preview).toHaveBeenCalledExactlyOnceWith(entries[0]);
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    fireEvent.focus(button); advance(180);
    expect(preview).toHaveBeenCalledTimes(2);
    fireEvent.blur(button);
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.click(toggle); advance(180);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(p.onCommitEntry).not.toHaveBeenCalled();
  });

  it("keeps unreviewed garments out of default discovery and recommendations until explicit opt-in", () => {
    const original: CharacterSlotEntry = { ...entry("top:original", "원본 유지", "accessory", true), slot: "top",
      apply: { kind: "costume-original", wardrobeSlot: "top", costumeSlots: ["tops"] } };
    const experimental: CharacterSlotEntry = { ...entry("top:tshirt", "티셔츠", "accessory", true), slot: "top",
      apply: { kind: "wardrobe", slot: "top", itemId: "tshirt", color: "#ffffff" } };
    const b = binding();
    const p = props({ slot: "top", binding: binding({ catalog: { ...b.catalog, entries: [original, experimental] } }) });
    render(<CharacterShaperShelf {...p} />);
    expect(cardIds()).toEqual(["top:original"]);
    expect(document.querySelector('[data-character-shaper-featured="top:tshirt"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "실험 의상 표시" }));
    expect(cardIds()).toEqual(["top:original", "top:tshirt"]);
    expect(p.onCommitEntry).not.toHaveBeenCalled();
    expect(document.querySelector('[data-character-shaper-featured="top:tshirt"]')).toBeNull();
    fireEvent.click(cards()[1]);
    expect(p.onCommitEntry).toHaveBeenCalledWith(experimental);
    fireEvent.click(screen.getByRole("button", { name: "실험 의상 표시" }));
    expect(cardIds()).toEqual(["top:original"]);
  });

  it("keeps a previously saved experimental selection visible without silently replacing it", () => {
    const experimental: CharacterSlotEntry = { ...entry("top:tshirt", "티셔츠", "accessory", true), slot: "top",
      apply: { kind: "wardrobe", slot: "top", itemId: "tshirt", color: "#ffffff" } };
    const b = binding();
    const p = props({ slot: "top", binding: binding({ catalog: { ...b.catalog, entries: [experimental] },
      recipe: { ...recipe, slots: { ...recipe.slots, top: "top:tshirt" } } }) });
    render(<CharacterShaperShelf {...p} />);
    expect(cardIds()).toEqual(["top:tshirt"]);
    expect(screen.getByRole("button", { name: "실험 의상 표시" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("실험 의상 · 원고 적용 전 형태 확인")).not.toBeNull();
    expect(p.onCommitEntry).not.toHaveBeenCalled();
  });

  it("provides all fifteen slots without asserting a partial fixture into a complete recipe", () => {
    expect(Object.keys(recipe.slots).sort()).toEqual([...CHARACTER_SLOT_KINDS].sort());
  });
  it("preserves explicit catalog order ahead of the Korean label tie-break", () => {
    const h = binding();
    const ordered = h.catalog.entries.map((item) => ({ ...item, order: item.id === "accessory:glasses" ? -1 : 0 }));
    render(<CharacterShaperShelf {...props({ binding: { ...h, catalog: { ...h.catalog, entries: ordered } } })} />);
    fireEvent.click(screen.getByRole("button", { name: "선택됨" }));
    expect(cardIds()).toEqual(["accessory:glasses", "accessory:hat"]);
  });
  it("cancels stale search when switching slots whose external queries are both empty", () => {
    const p = props(); const view = render(<CharacterShaperShelf {...p} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "안" } });
    view.rerender(<CharacterShaperShelf {...p} slot="hand-pose" />); advance();
    expect(p.onQueryChange).not.toHaveBeenCalled();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(cardIds()).toEqual(["hand-pose:peace"]);
  });
  it("does not publish partial IME composition", () => {
    const p = props(); render(<CharacterShaperShelf {...p} />); const search = screen.getByRole("searchbox");
    fireEvent.compositionStart(search); fireEvent.change(search, { target: { value: "안경" } }); advance();
    expect(p.onQueryChange).not.toHaveBeenCalled(); fireEvent.compositionEnd(search); advance();
    expect(p.onQueryChange).toHaveBeenCalledTimes(1); expect(p.onQueryChange).toHaveBeenCalledWith("안경");
  });
  it("does not restart debounce on unrelated host callback identity changes", () => {
    const p = props(); const view = render(<CharacterShaperShelf {...p} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "모자" } }); advance(80);
    const nextCallback = vi.fn(); view.rerender(<CharacterShaperShelf {...p} onQueryChange={nextCallback} />); advance(41);
    expect(p.onQueryChange).not.toHaveBeenCalled(); expect(nextCallback).toHaveBeenCalledTimes(1); expect(nextCallback).toHaveBeenCalledWith("모자");
  });
  it("clears search before the shell handles Escape", () => {
    const shell = vi.fn(() => true); const release = pushCharacterShaperKeyLayer(shell, window);
    try {
      const p = props(); render(<CharacterShaperShelf {...p} />); const search = screen.getByRole("searchbox");
      fireEvent.change(search, { target: { value: "안" } }); fireEvent.keyDown(search, { key: "Escape" });
      expect(shell).not.toHaveBeenCalled(); expect(p.onQueryChange).toHaveBeenCalledWith("");
    } finally { release(); }
  });
  it("bookmarks without committing a scene change and reuses those bookmarks", () => {
    const p = props(); render(<CharacterShaperShelf {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "모자 즐겨찾기 추가" }));
    expect(p.onCommitEntry).not.toHaveBeenCalled(); expect(p.binding.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기" }));
    expect(cardIds()).toEqual(["accessory:hat"]);
    expect(JSON.parse(localStorage.getItem(CHARACTER_FAVORITES_KEY) ?? "null")).toEqual({ version: 1, ids: ["accessory:hat"] });
  });
  it("shows every selected accessory in the catalog's Korean label tie-break order", () => {
    render(<CharacterShaperShelf {...props()} />); fireEvent.click(screen.getByRole("button", { name: "선택됨" }));
    expect(cardIds()).toEqual(["accessory:hat", "accessory:glasses"]);
  });
  it("excludes partial and unavailable entries only after explicit full-support filtering", () => {
    const p = props({ binding: binding({ evaluate: (item) => ({
      status: item.id === "accessory:glasses" ? "available" : item.id === "accessory:hat" ? "partial" : "unavailable",
      reason: "지원 범위", missing: [],
    }) }) });
    render(<CharacterShaperShelf {...p} />); expect(cards()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /완전 지원만/u })); expect(cardIds()).toEqual(["accessory:glasses"]);
  });
  it("refreshes support filtering after a model change", () => {
    const p = props(); const view = render(<CharacterShaperShelf {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /완전 지원만/u }));
    view.rerender(<CharacterShaperShelf {...p} binding={binding({ evaluate: (item) => ({
      status: item.id === "accessory:hat" ? "available" : "unavailable", reason: null, missing: [],
    }) })} />);
    expect(cardIds()).toEqual(["accessory:hat"]);
  });
  it.each([{ busyReason: "캡처 중" }, { compareActive: true }])("guards cards, featured selections and removals while locked: %j", (lock) => {
    const p = props({ binding: binding(lock) }); render(<CharacterShaperShelf {...p} />);
    fireEvent.click(cards()[0]!);
    fireEvent.click(document.querySelector<HTMLElement>("[data-character-shaper-featured]")!);
    fireEvent.click(screen.getByRole("button", { name: "안경 해제" }));
    expect(p.onCommitEntry).not.toHaveBeenCalled(); expect(p.binding.remove).not.toHaveBeenCalled();
    expect(cards()[0]?.getAttribute("aria-disabled")).toBe("true");
  });
  it("disables hand-side mutations while comparing", () => {
    const p = props({ slot: "hand-pose", binding: binding({ compareActive: true }) }); render(<CharacterShaperShelf {...p} />);
    const button = screen.getByRole("button", { name: "왼손" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button); expect(p.binding.setHandSide).not.toHaveBeenCalled();
  });
  it("returns focus to search after removing the last visible favorite", () => {
    localStorage.setItem(CHARACTER_FAVORITES_KEY, JSON.stringify({ version: 1, ids: ["accessory:hat"] }));
    render(<CharacterShaperShelf {...props()} />); fireEvent.click(screen.getByRole("button", { name: "즐겨찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "모자 즐겨찾기 해제" }));
    expect(cards()).toHaveLength(0); expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });
  it("does not nest favorite actions inside selectable card buttons", () => {
    render(<CharacterShaperShelf {...props()} />); expect(document.querySelectorAll("button button")).toHaveLength(0);
  });
  it("offers an explicit save retry after quota failure without changing the scene", () => {
    const p = props(); render(<CharacterShaperShelf {...p} />);
    const write = vi.spyOn(Storage.prototype, "setItem");
    try {
      write.mockImplementationOnce(() => { throw new DOMException("quota", "QuotaExceededError"); });
      fireEvent.click(screen.getByRole("button", { name: "모자 즐겨찾기 추가" }));
      expect(screen.getByRole("button", { name: "즐겨찾기 저장 다시 시도" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 저장 다시 시도" }));
      expect(screen.queryByRole("button", { name: "즐겨찾기 저장 다시 시도" })).toBeNull();
      expect(JSON.parse(localStorage.getItem(CHARACTER_FAVORITES_KEY) ?? "null").ids).toContain("accessory:hat");
      expect(p.onCommitEntry).not.toHaveBeenCalled(); expect(p.binding.commit).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

});
