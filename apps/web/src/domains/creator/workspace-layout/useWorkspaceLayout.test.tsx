// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WORKSPACE_PRESET_COLORING_ID, WORKSPACE_PRESET_INKING_ID } from "./workspace-layout-presets";
import { createUnpersistedWorkspaceLayoutOptions, useWorkspaceLayout } from "./useWorkspaceLayout";
import type { WorkspaceLayoutStorageLike } from "./workspace-layout-store";

function memoryStorage(): WorkspaceLayoutStorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
  };
}

describe("useWorkspaceLayout", () => {
  it("초기 상태는 기본 프리셋(잉킹용)이다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    expect(result.current.activeLayoutId).toBe(WORKSPACE_PRESET_INKING_ID);
    expect(result.current.activeLayout.id).toBe(WORKSPACE_PRESET_INKING_ID);
    expect(result.current.layouts).toEqual([]);
  });

  it("applyLayout으로 프리셋을 전환한다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let ok = false;
    act(() => {
      ok = result.current.applyLayout(WORKSPACE_PRESET_COLORING_ID);
    });
    expect(ok).toBe(true);
    expect(result.current.activeLayoutId).toBe(WORKSPACE_PRESET_COLORING_ID);
    expect(result.current.activeLayout.name).toBe("채색용");
  });

  it("알 수 없는 id 적용은 실패하고 상태를 바꾸지 않는다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let ok = true;
    act(() => {
      ok = result.current.applyLayout("nope");
    });
    expect(ok).toBe(false);
    expect(result.current.activeLayoutId).toBe(WORKSPACE_PRESET_INKING_ID);
  });

  it("resetLayout으로 기본 프리셋으로 돌아간다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    act(() => { result.current.applyLayout(WORKSPACE_PRESET_COLORING_ID); });
    act(() => { result.current.resetLayout(); });
    expect(result.current.activeLayoutId).toBe(WORKSPACE_PRESET_INKING_ID);
  });

  it("addLayout·renameLayout·removeLayout이 동작한다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let id: string | null = null;
    act(() => {
      id = result.current.addLayout("내 작업 공간", { "left-rail": { panelIds: ["brush"] } });
    });
    expect(id).not.toBeNull();
    expect(result.current.layouts).toHaveLength(1);
    // 추가하면 바로 적용된다
    expect(result.current.activeLayoutId).toBe(id);

    let renamed = false;
    act(() => {
      renamed = result.current.renameLayout(id!, "바꾼 이름");
    });
    expect(renamed).toBe(true);
    expect(result.current.layouts[0].name).toBe("바꾼 이름");

    let removed = false;
    act(() => {
      removed = result.current.removeLayout(id!);
    });
    expect(removed).toBe(true);
    expect(result.current.layouts).toHaveLength(0);
    // 삭제된 레이아웃이 적용 중이었으면 기본 프리셋으로 폴백
    expect(result.current.activeLayoutId).toBe(WORKSPACE_PRESET_INKING_ID);
  });

  it("빈 이름으로는 추가·이름변경이 실패한다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let id: string | null = "x";
    act(() => {
      id = result.current.addLayout("   ");
    });
    expect(id).toBeNull();

    act(() => {
      id = result.current.addLayout("정상");
    });
    let renamed = true;
    act(() => {
      renamed = result.current.renameLayout(id!, "  ");
    });
    expect(renamed).toBe(false);
    expect(result.current.layouts[0].name).toBe("정상");
  });

  it("duplicateLayout으로 복제한다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let id: string | null = null;
    act(() => {
      id = result.current.addLayout("원본");
    });
    let copyId: string | null = null;
    act(() => {
      copyId = result.current.duplicateLayout(id!);
    });
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(id);
    expect(result.current.layouts).toHaveLength(2);
    expect(result.current.layouts[1].name).toBe("원본 복사");
  });

  it("updateLayoutSlots로 슬롯 배치를 갱신한다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let id: string | null = null;
    act(() => {
      id = result.current.addLayout("슬롯 테스트");
    });
    let ok = false;
    act(() => {
      ok = result.current.updateLayoutSlots(id!, {
        "right-inspector": { panelIds: ["layers", "timeline"], collapsed: true },
      });
    });
    expect(ok).toBe(true);
    expect(result.current.activeLayout.slots["right-inspector"].panelIds).toEqual([
      "layers",
      "timeline",
    ]);
    expect(result.current.activeLayout.slots["right-inspector"].collapsed).toBe(true);
  });

  it("프리셋은 삭제·이름변경·슬롯 갱신할 수 없다", () => {
    const { result } = renderHook(() => useWorkspaceLayout(createUnpersistedWorkspaceLayoutOptions()));
    let removed = true;
    let renamed = true;
    let updated = true;
    act(() => {
      removed = result.current.removeLayout(WORKSPACE_PRESET_INKING_ID);
      renamed = result.current.renameLayout(WORKSPACE_PRESET_INKING_ID, "바꿈");
      updated = result.current.updateLayoutSlots(WORKSPACE_PRESET_INKING_ID, {});
    });
    expect(removed).toBe(false);
    expect(renamed).toBe(false);
    expect(updated).toBe(false);
  });

  it("변경 사항이 저장소에 영속화되고 다시 불러와진다", () => {
    const storage = memoryStorage();
    const first = renderHook(() => useWorkspaceLayout({ storage }));
    act(() => {
      first.result.current.addLayout("영속 테스트");
    });
    const addedId = first.result.current.activeLayoutId;
    first.unmount();

    const second = renderHook(() => useWorkspaceLayout({ storage }));
    expect(second.result.current.layouts).toHaveLength(1);
    expect(second.result.current.layouts[0].name).toBe("영속 테스트");
    expect(second.result.current.activeLayoutId).toBe(addedId);
  });
});
