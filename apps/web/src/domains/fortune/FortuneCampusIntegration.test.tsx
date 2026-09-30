// @vitest-environment jsdom
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FortuneReading } from "@toonstudio/core/fortune";
import { CampusContext, type CampusContextValue } from "@/shared/components/spatial-campus/campus-context";
import { campusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { FortuneObservatory } from "./FortuneObservatory";
import { FortuneCreativeMission } from "./FortuneReadingTools";
import { readFortunePreferences, writeFortunePreferences } from "./fortune-observatory-storage";

/**
 * 프로덕션의 SessionContext처럼 계정 변경을 리액티브하게 전파하는 세션 목.
 * React Compiler가 부모 JSX를 메모이즈해도 useSyncExternalStore 구독을 통해
 * useSession() 호출자가 직접 리렌더되므로 실제 계정 전환과 동일한 경로로 검증한다.
 */
const actor = vi.hoisted(() => {
  let id = "actor-A";
  const listeners = new Set<() => void>();
  return {
    get current() { return id; },
    switch(next: string) { if (id !== next) { id = next; listeners.forEach((notify) => notify()); } },
    reset() { id = "actor-A"; },
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    getSnapshot() { return id; },
  };
});
vi.mock("@/domains/auth/public/session/auth-session-store", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSession: () => {
      const id = useSyncExternalStore(actor.subscribe, actor.getSnapshot);
      return { data: { user: { id } }, ready: true };
    },
  };
});
const context: CampusContextValue = {
  binding: { routeId: "experience-fortune", districtId: "observatory", surface: "room", private: true },
  district: campusDistrict("observatory"), mode: "scene",
  privacyMode: false, privacySensitive: true,
  returnHref: null, setMode: () => undefined, setPrivacyMode: () => undefined,
};
const reading: FortuneReading = { id: "cookie", title: "포춘쿠키", eyebrow: "오늘의 문장", summary: "작은 시작", generatedFor: "2026-09-22", sections: [], notes: [] };
function Observatory({ mode = "scene" }: { mode?: CampusContextValue["mode"] }) {
  return <MemoryRouter initialEntries={["/fortune?content=dream"]}><CampusContext.Provider value={{ ...context, mode }}><FortuneObservatory /></CampusContext.Provider></MemoryRouter>;
}
beforeEach(() => { actor.reset(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("observatory campus adapter", () => {
  it("preserves private inputs across presentation changes without persisting them", () => {
    const view = render(<Observatory />);
    const input = screen.getByRole("textbox", { name: /기억나는 꿈의 장면/ });
    fireEvent.change(input, { target: { value: "캠퍼스 테스트용 비공개 꿈" } });
    view.rerender(<Observatory mode="focus" />);
    expect(screen.getByRole("textbox", { name: /기억나는 꿈의 장면/ })).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("캠퍼스 테스트용 비공개 꿈");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("캠퍼스 테스트용 비공개 꿈");
  });
  it("clears in-memory private input when the account identity changes", () => {
    render(<Observatory />);
    fireEvent.change(screen.getByRole("textbox", { name: /기억나는 꿈의 장면/ }), { target: { value: "only actor A" } });
    act(() => { actor.switch("actor-B"); });
    expect((screen.getByRole("textbox", { name: /기억나는 꿈의 장면/ }) as HTMLTextAreaElement).value).toBe("");
  });
  it("uses the exact return target for a creative mission, not a newly selected project", () => {
    const href = "/studio/p/project-A/d/document-B?pageId=C";
    render(<MemoryRouter><CampusContext.Provider value={{ ...context, returnHref: href }}><FortuneCreativeMission reading={reading} /></CampusContext.Provider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "원래 원고에서 이어 그리기" }).getAttribute("href")).toBe(href);
  });
  it("offers creation explicitly when there is no verified return reference", () => {
    render(<MemoryRouter><CampusContext.Provider value={context}><FortuneCreativeMission reading={reading} /></CampusContext.Provider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "새 작품으로 그리기" }).getAttribute("href")).toBe("/studio/new");
  });
});

it("switches saved notebook scope along with the actor without deleting their records", () => {
  const notes = { favorites: ["tarot"], notebook: [{ id: "saved-A", title: "Account A only", text: "Private note", savedAt: "2026-09-22" }] };
  writeFortunePreferences(notes, "actor-A");
  render(<Observatory />);
  expect(screen.getByRole("button", { name: "나의 보관함 1" })).toBeTruthy();
  act(() => { actor.switch("actor-B"); });
  expect(screen.getByRole("button", { name: "나의 보관함 0" })).toBeTruthy();
  expect(readFortunePreferences("actor-A")).toEqual(notes);
  expect(readFortunePreferences("actor-B").notebook).toHaveLength(0);
});
