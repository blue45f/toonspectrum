// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceLayout } from "./workspace-layout-model";
import { WORKSPACE_PRESET_INKING_ID } from "./workspace-layout-presets";
import {
  addWorkspaceLayout,
  duplicateWorkspaceLayout,
  loadWorkspaceLayoutStore,
  removeWorkspaceLayout,
  renameWorkspaceLayout,
  resolveWorkspaceLayout,
  saveWorkspaceLayoutStore,
  updateWorkspaceLayoutSlots,
  WORKSPACE_LAYOUTS_MAX_CUSTOM,
  WORKSPACE_LAYOUTS_STORAGE_KEY,
  type WorkspaceLayoutStorageLike,
} from "./workspace-layout-store";

function memoryStorage(): WorkspaceLayoutStorageLike & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("workspace-layout-store CRUD", () => {
  it("추가: 이름이 비어 있으면 null을 반환한다", () => {
    const { layouts, layout } = addWorkspaceLayout([], "   ");
    expect(layout).toBeNull();
    expect(layouts).toEqual([]);
  });

  it("추가: 최대 개수를 초과하면 추가하지 않는다", () => {
    let layouts = Array.from({ length: WORKSPACE_LAYOUTS_MAX_CUSTOM }, (_, index) =>
      createWorkspaceLayout(`레이아웃 ${index}`, {}, { id: `layout-${index}` }),
    );
    const { layouts: next, layout } = addWorkspaceLayout(layouts, "초과");
    expect(layout).toBeNull();
    expect(next).toHaveLength(WORKSPACE_LAYOUTS_MAX_CUSTOM);
  });

  it("추가: 정상 추가 시 정규화된 레코드를 반환한다", () => {
    const { layouts, layout } = addWorkspaceLayout(
      [],
      "내 레이아웃",
      { "left-rail": { panelIds: ["brush", "brush"], size: 5 } },
      { now: 1700000000000 },
    );
    expect(layout).not.toBeNull();
    expect(layout!.name).toBe("내 레이아웃");
    expect(layout!.updatedAt).toBe(1700000000000);
    expect(layout!.slots["left-rail"].panelIds).toEqual(["brush"]);
    expect(layout!.slots["left-rail"].size).toBe(1);
    expect(layouts).toHaveLength(1);
  });

  it("이름 변경: 빈 이름·40자 초과는 실패한다", () => {
    const layout = createWorkspaceLayout("원본");
    expect(renameWorkspaceLayout(layout, "  ").ok).toBe(false);
    expect(renameWorkspaceLayout(layout, "가".repeat(41)).ok).toBe(false);
    const result = renameWorkspaceLayout(layout, "  새 이름  ", { now: 42 });
    expect(result.ok).toBe(true);
    expect(result.layout!.name).toBe("새 이름");
    expect(result.layout!.updatedAt).toBe(42);
  });

  it("슬롯 갱신: 부분 병합 후 updatedAt이 갱신된다", () => {
    const layout = createWorkspaceLayout("원본", {}, { now: 1 });
    const next = updateWorkspaceLayoutSlots(
      layout,
      { "right-inspector": { panelIds: ["layers"], collapsed: true } },
      { now: 99 },
    );
    expect(next.slots["right-inspector"].panelIds).toEqual(["layers"]);
    expect(next.slots["right-inspector"].collapsed).toBe(true);
    expect(next.updatedAt).toBe(99);
    expect(next.slots["left-rail"].panelIds).toEqual([]);
  });

  it("복제: 새 id와 ' 복사' 접미사 이름을 가진다", () => {
    const layout = createWorkspaceLayout("원본", {}, { id: "layout-1" });
    const copy = duplicateWorkspaceLayout(layout);
    expect(copy.id).not.toBe("layout-1");
    expect(copy.name).toBe("원본 복사");
  });

  it("삭제: id가 일치하는 것만 제거한다", () => {
    const first = createWorkspaceLayout("A", {}, { id: "a" });
    const second = createWorkspaceLayout("B", {}, { id: "b" });
    expect(removeWorkspaceLayout([first, second], "a")).toEqual([second]);
  });
});

describe("workspace-layout-store resolve", () => {
  it("커스텀 레이아웃을 우선 해석한다", () => {
    const custom = createWorkspaceLayout("내 것", {}, { id: "custom-1" });
    expect(resolveWorkspaceLayout("custom-1", [custom]).id).toBe("custom-1");
  });

  it("프리셋 id도 해석한다", () => {
    const resolved = resolveWorkspaceLayout(WORKSPACE_PRESET_INKING_ID, []);
    expect(resolved.id).toBe(WORKSPACE_PRESET_INKING_ID);
    expect(resolved.name).toBe("잉킹용");
  });

  it("알 수 없는 id는 기본 프리셋으로 폴백한다", () => {
    expect(resolveWorkspaceLayout("unknown", []).id).toBe(WORKSPACE_PRESET_INKING_ID);
    expect(resolveWorkspaceLayout(null, []).id).toBe(WORKSPACE_PRESET_INKING_ID);
  });
});

describe("workspace-layout-store persistence", () => {
  it("메모리 저장소 round-trip이 동작한다", () => {
    const storage = memoryStorage();
    const { layouts } = addWorkspaceLayout([], "저장 테스트", {
      "left-rail": { panelIds: ["brush"] },
    });
    const state = { layouts, activeLayoutId: layouts[0].id };
    expect(saveWorkspaceLayoutStore(state, storage)).toBe(true);
    expect(storage.entries.get(WORKSPACE_LAYOUTS_STORAGE_KEY)).toContain("저장 테스트");

    const loaded = loadWorkspaceLayoutStore(storage);
    expect(loaded.layouts).toHaveLength(1);
    expect(loaded.layouts[0].name).toBe("저장 테스트");
    expect(loaded.layouts[0].slots["left-rail"].panelIds).toEqual(["brush"]);
    expect(loaded.activeLayoutId).toBe(layouts[0].id);
  });

  it("실제 localStorage 키로 round-trip이 동작한다", () => {
    const { layouts } = addWorkspaceLayout([], "로컬 테스트");
    saveWorkspaceLayoutStore({ layouts, activeLayoutId: WORKSPACE_PRESET_INKING_ID });
    const raw = window.localStorage.getItem(WORKSPACE_LAYOUTS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const loaded = loadWorkspaceLayoutStore();
    expect(loaded.layouts[0].name).toBe("로컬 테스트");
    expect(loaded.activeLayoutId).toBe(WORKSPACE_PRESET_INKING_ID);
  });

  it("깨진 JSON·잘못된 형식은 빈 상태로 폴백한다", () => {
    const storage = memoryStorage();
    storage.setItem(WORKSPACE_LAYOUTS_STORAGE_KEY, "not-json{{{");
    expect(loadWorkspaceLayoutStore(storage)).toEqual({ layouts: [], activeLayoutId: null });

    storage.setItem(WORKSPACE_LAYOUTS_STORAGE_KEY, JSON.stringify({ layouts: "oops" }));
    expect(loadWorkspaceLayoutStore(storage)).toEqual({ layouts: [], activeLayoutId: null });
  });

  it("알 수 없는 패널이 든 레코드는 버리고 유효한 것만 살린다", () => {
    const storage = memoryStorage();
    storage.setItem(
      WORKSPACE_LAYOUTS_STORAGE_KEY,
      JSON.stringify({
        layouts: [
          {
            id: "bad",
            name: "깨진 것",
            slots: {
              "left-rail": { panelIds: ["ghost"], collapsed: false, size: 0.2 },
              "right-inspector": { panelIds: [], collapsed: false, size: 0.2 },
              "bottom-dock": { panelIds: [], collapsed: false, size: 0.2 },
              floating: { panelIds: [], collapsed: false, size: 0 },
            },
            updatedAt: 1,
          },
          {
            id: "good",
            name: "좋은 것",
            slots: {
              "left-rail": { panelIds: ["brush"], collapsed: false, size: 0.2 },
              "right-inspector": { panelIds: [], collapsed: false, size: 0.2 },
              "bottom-dock": { panelIds: [], collapsed: false, size: 0.2 },
              floating: { panelIds: [], collapsed: false, size: 0 },
            },
            updatedAt: 1,
          },
        ],
        activeLayoutId: "bad",
      }),
    );
    const loaded = loadWorkspaceLayoutStore(storage);
    expect(loaded.layouts.map((layout) => layout.id)).toEqual(["good"]);
    expect(loaded.activeLayoutId).toBeNull();
  });

  it("저장소 예외 시 false·빈 상태를 반환한다", () => {
    const failing: WorkspaceLayoutStorageLike = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadWorkspaceLayoutStore(failing)).toEqual({ layouts: [], activeLayoutId: null });
    expect(saveWorkspaceLayoutStore({ layouts: [], activeLayoutId: null }, failing)).toBe(false);
  });
});
