// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioProductionSavedViews } from "./StudioProductionSavedViews";
import type { ProductionSavedView, ProductionSavedFilter } from "./studio-production-saved-views";

const f = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), acquire: vi.fn() }));
vi.mock("./studio-production-saved-views", async (original) => ({ ...await original<typeof import("./studio-production-saved-views")>(), acquireProductionViewsRepository: f.acquire }));
const filter: ProductionSavedFilter = { view: "due", query: "線画", stage: "all", layout: "calendar", sort: "due" };
const saved: ProductionSavedView = { id: "00000000-0000-4000-8000-000000000001", name: "기한 원고", filter };
beforeEach(() => {
  vi.resetAllMocks(); f.acquire.mockResolvedValue(f); f.load.mockResolvedValue([saved]); f.save.mockResolvedValue([saved]); f.remove.mockResolvedValue([]);
});
afterEach(cleanup);
function mount(actorId: string | null = "actor-a", scopeKey = "work:a") {
  const onApply = vi.fn();
  const result = render(<StudioProductionSavedViews actorId={actorId} scopeKey={scopeKey} filter={filter} onApply={onApply} />);
  result.container.querySelector("details")!.open = true;
  return { ...result, onApply };
}
describe("saved task view UI", () => {
  it("does not read or persist search text until explicitly requested", async () => {
    const v = mount(); expect(f.acquire).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("보기 이름"), { target: {value: "기한 원고"} });
    await act(async () => { fireEvent.click(screen.getByRole("button", {name: "현재 조건 저장"})); });
    expect(f.save).toHaveBeenCalledExactlyOnceWith(JSON.stringify(["actor-a", "work:a"]), "기한 원고", filter);
    expect(screen.getByRole("status").textContent).toContain("이 기기의");
    fireEvent.click(screen.getByRole("button", {name: "기한 원고"}));
    expect(v.onApply).toHaveBeenCalledExactlyOnceWith(filter);
  });
  it("ignores another actor's delayed load and removes their view names", async () => {
    let resolve!: (views: ProductionSavedView[]) => void;
    f.load.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const v = mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", {name: "저장된 보기 불러오기"})); });
    v.rerender(<StudioProductionSavedViews actorId="actor-b" scopeKey="work:a" filter={filter} onApply={v.onApply} />);
    await act(async () => { resolve([saved]); });
    expect(screen.queryByRole("button", {name:"기한 원고"})).toBeNull();
    expect(v.onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText("보기 이름")).toHaveProperty("value", "");
  });
  it("prevents a duplicate save and keeps input after storage failure", async () => {
    let reject!: (reason: Error) => void;
    f.save.mockReturnValueOnce(new Promise((_, fail) => {reject = fail;}));
    mount(); fireEvent.change(screen.getByLabelText("보기 이름"), {target:{value:"기한 원고"}});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name:"현재 조건 저장"}));
      fireEvent.click(screen.getByRole("button", {name:"현재 조건 저장"}));
    });
    expect(f.save).toHaveBeenCalledTimes(1);
    await act(async () => {reject(new Error("quota"));});
    expect(screen.getByLabelText("보기 이름")).toHaveProperty("value", "기한 원고");
    expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다");
    expect(screen.queryByRole("button", {name:"기한 원고"})).toBeNull();
  });
  it("retains the list when deleting fails, without touching tasks or changing active filters", async () => {
    const v = mount();
    await act(async () => {fireEvent.click(screen.getByRole("button", {name:"저장된 보기 불러오기"}));});
    f.remove.mockRejectedValueOnce(new Error("read-only"));
    await act(async () => {fireEvent.click(screen.getByRole("button", {name:"기한 원고 보기 삭제"}));});
    expect(screen.getByRole("button", {name:"기한 원고"})).toBeTruthy();
    expect(v.onApply).not.toHaveBeenCalled();
  });
  it("clears names on a workspace change and does not apply a personal assignment view anonymously", async () => {
    f.load.mockResolvedValueOnce([{...saved, filter:{...filter,view:"mine"}}]);
    const v = mount(null);
    await act(async () => {fireEvent.click(screen.getByRole("button", {name:"저장된 보기 불러오기"}));});
    expect(screen.getByRole("button", {name:"기한 원고"})).toHaveProperty("disabled",true);
    v.rerender(<StudioProductionSavedViews actorId={null} scopeKey="work:b" filter={filter} onApply={v.onApply} />);
    expect(screen.queryByRole("button", {name:"기한 원고"})).toBeNull();
  });
});
