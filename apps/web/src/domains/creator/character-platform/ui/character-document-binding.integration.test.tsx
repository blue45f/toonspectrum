// @vitest-environment jsdom
import { useMemo, useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { listCharacterSlotEntries } from "../../character-shaper/character-shaper-catalog";
import { createAvatarForgeState } from "../../vrm/studio-vrm-avatar-forge";
import { serializeCharacterDocumentV3 } from "../document/character-document-v3";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";
import { applyWardrobeItemSelection } from "../../vrm/studio-vrm-wardrobe";
import type { WardrobeSlot, WardrobeEquip, WardrobeState } from "../../vrm/studio-vrm-wardrobe";

const database = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: (namespace: string) => ({
    get: async (key: string) => database.rows.get(`${namespace}/${key}`) ?? null,
    set: async (key: string, value: string) => { database.rows.set(`${namespace}/${key}`, value); },
    delete: async (key: string) => { database.rows.delete(`${namespace}/${key}`); },
  }) }),
}));

function useFixture({ modelId = "unified-authoring" } = {}) {
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [transparentBackground, setTransparentBackground] = useState(true);
  const [avatarForgeState, handleAvatarForgeChange] = useState(createAvatarForgeState);
  const [wardrobeState, setWardrobeState] = useState<WardrobeState>({});
  const [activeExpressionId, setActiveExpressionId] = useState("");
  const [expressionWeights, setExpressionWeights] = useState<Record<string, number>>({});
  const vrm = useMemo(() => { const scene = new Group(); scene.name = modelId; return { scene }; }, [modelId]);
  const h = { activeModelId: modelId, status: "ready", vrm, customColors, setCustomColors,
    transparentBackground, setTransparentBackground, avatarForgeState, handleAvatarForgeChange,
    wardrobeMetrics: {}, wardrobeState, setWardrobeState,
    equipWardrobeItem: (slot: WardrobeSlot, itemId: string | null) => setWardrobeState((current) => applyWardrobeItemSelection(current, slot, itemId)),
    updateWardrobeEquip: (slot: WardrobeSlot, patch: Partial<WardrobeEquip>) => setWardrobeState((current) => {
      const equip = current[slot];
      return equip ? { ...current, [slot]: { ...equip, ...patch } } : current;
    }),
    setActiveExpressionId, activeExpressionId, setExpressionWeights, expressionWeights,
  };
  const runtime = useCharacterShaperBinding(h, { runtimeOnly: true });
  const workbench = useCharacterPlatformWorkbench(h, runtime, { documentAuthority: true });
  return { workbench, binding: workbench.binding, runtime, h };
}

beforeEach(() => database.rows.clear());
afterEach(cleanup);
async function ready(hook: { readonly result: { readonly current: ReturnType<typeof useFixture> } }) {
  await waitFor(() => expect(hook.result.current.workbench.authoring.hydrated).toBe(true));
  await waitFor(() => expect(hook.result.current.workbench.hostRuntime.pending).toBe(false));
}

describe("상위 V3 authority와 Shaper의 단일 편집 이력", () => {
  it("색과 정밀 얼굴을 문서에 먼저 확정하고 호스트 복원·undo·redo는 이력을 추가하지 않는다", async () => {
    const hook = renderHook(useFixture);
    await ready(hook);
    act(() => {
      hook.result.current.binding.commitColor("skin", "#123456");
      expect(hook.result.current.workbench.authoring.authority.getSnapshot().document.look.colors.skin).toBe("#123456");
      expect(hook.result.current.h.customColors.body).toBeUndefined();
      hook.result.current.binding.commitFaceParams({ headWidth: 1.12 }, "얼굴 너비");
    });
    await waitFor(() => expect(hook.result.current.h.customColors.body).toBe("#123456"));
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.face.headWidth).toBe(1.12));
    expect(hook.result.current.binding.history.length).toBe(2);
    expect(hook.result.current.runtime.history.length).toBe(0);
    act(() => hook.result.current.binding.undo());
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.face.headWidth).toBe(1));
    expect(hook.result.current.h.customColors.body).toBe("#123456");
    act(() => hook.result.current.binding.redo());
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.face.headWidth).toBe(1.12));
    expect(hook.result.current.binding.history.length).toBe(2);
  });

  it("카드 preview/cancel/apply와 V3 palette preview를 실제 호스트에 재생한다", async () => {
    const hook = renderHook(useFixture);
    await ready(hook);
    const hair = listCharacterSlotEntries("hair").find((entry) => entry.apply.kind === "forge-hair" && entry.apply.hair.style !== "none");
    if (!hair || hair.apply.kind !== "forge-hair") throw new Error("헤어 fixture 없음");
    const style = hair.apply.hair.style;
    const original = hook.result.current.workbench.authoring.snapshot.document;
    act(() => { expect(hook.result.current.binding.preview?.(hair).ok).toBe(true); });
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).toBe(style));
    expect(hook.result.current.workbench.authoring.snapshot.document).toBe(original);
    act(() => hook.result.current.binding.cancelPreview?.());
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).toBe("none"));
    expect(hook.result.current.binding.history.length).toBe(0);
    act(() => { hook.result.current.binding.preview?.(hair); });
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).toBe(style));
    act(() => { expect(hook.result.current.binding.commitPreview?.(hair).ok).toBe(true); });
    expect(hook.result.current.binding.history.length).toBe(1);
    act(() => {
      const a = hook.result.current.workbench.authoring;
      const d = a.authority.getSnapshot().document;
      a.beginPreview({ commandId: "palette/preview", label: "팔레트 미리보기", source: "user", expectedDocumentId: d.documentId, expectedRevision: d.revision,
        operations: [{ kind: "set-color", target: "skin", color: "#abcdef" }] });
    });
    await waitFor(() => expect(hook.result.current.h.customColors.body).toBe("#abcdef"));
    act(() => hook.result.current.binding.cancelPreview?.());
    await waitFor(() => expect(hook.result.current.h.customColors.body).toBeUndefined());
    expect(hook.result.current.runtime.history.length).toBe(0);
    expect(hook.result.current.binding.history.length).toBe(1);
  });

  it("헤어 정밀 수치·복원·비교·초기화가 같은 이력을 사용하고 재오픈 뒤에도 원본이 유지된다", async () => {
    const hook = renderHook(useFixture);
    await ready(hook);
    const hair = listCharacterSlotEntries("hair").find((entry) => entry.apply.kind === "forge-hair" && entry.apply.hair.style !== "none");
    if (!hair) throw new Error("헤어 fixture 없음");
    act(() => { hook.result.current.binding.commit(hair); });
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).not.toBe("none"));
    act(() => hook.result.current.binding.commitHairParams({ length: 0.77, volume: 1.13 }, "헤어 정밀 편집"));
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.length).toBe(0.77));
    act(() => hook.result.current.binding.setCompareActive(true));
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).toBe("none"));
    act(() => hook.result.current.binding.setCompareActive(false));
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.length).toBe(0.77));
    expect(hook.result.current.binding.history.length).toBe(2);
    act(() => hook.result.current.binding.resetToBaseline());
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.style).toBe("none"));
    act(() => hook.result.current.binding.undo());
    await waitFor(() => expect(hook.result.current.h.avatarForgeState.hair.length).toBe(0.77));
    await act(async () => { expect(await hook.result.current.workbench.authoring.saveNow()).toBe(true); });
    hook.unmount();
    const reopened = renderHook(useFixture);
    await ready(reopened);
    await waitFor(() => expect(reopened.result.current.h.avatarForgeState.hair.length).toBe(0.77));
    expect(reopened.result.current.binding.history.length).toBe(0);
  });

  it("다중 파츠와 팔레트 명령을 순차 재생하며 다른 파츠와 단일 history를 보존한다", async () => {
    const hook = renderHook(useFixture);
    await ready(hook);
    const top = listCharacterSlotEntries("top").find((entry) => entry.apply.kind === "wardrobe" && entry.apply.slot === "top" && entry.apply.itemId);
    const bottom = listCharacterSlotEntries("bottom").find((entry) => entry.apply.kind === "wardrobe" && entry.apply.itemId);
    if (!top || !bottom || top.apply.kind !== "wardrobe" || bottom.apply.kind !== "wardrobe") throw new Error("의상 fixture 없음");
    const topId = top.apply.itemId;
    const bottomId = bottom.apply.itemId;
    const selection = (entryId: string) => ({ entryId, entryVersion: "1", providerId: "toonstudio", catalogRevision: "character-slot-catalog-v1" });
    act(() => {
      const a = hook.result.current.workbench.authoring;
      const d = a.authority.getSnapshot().document;
      expect(a.dispatch({ commandId: "multi/parts", label: "상하의와 색상", source: "user", expectedDocumentId: d.documentId, expectedRevision: d.revision,
        operations: [{ kind: "set-slot", slot: "top", selection: selection(top.id) }, { kind: "set-slot", slot: "bottom", selection: selection(bottom.id) },
          { kind: "set-color", target: "top", color: "#aabbcc" }, { kind: "set-color", target: "bottom", color: "#112233" }] }).status).toBe("applied");
    });
    await waitFor(() => expect(hook.result.current.h.wardrobeState.top?.itemId).toBe(topId));
    await waitFor(() => expect(hook.result.current.h.wardrobeState.bottom?.itemId).toBe(bottomId));
    await waitFor(() => expect(hook.result.current.h.wardrobeState.top?.color).toBe("#aabbcc"));
    expect(hook.result.current.h.wardrobeState.bottom?.color).toBe("#112233");
    expect(hook.result.current.binding.history.length).toBe(1);
    act(() => hook.result.current.binding.undo());
    await waitFor(() => expect(hook.result.current.h.wardrobeState.top).toBeUndefined());
    await waitFor(() => expect(hook.result.current.h.wardrobeState.bottom).toBeUndefined());
    expect(hook.result.current.runtime.history.length).toBe(0);
  });

  it("팔레트 키가 없는 유효한 백업을 복원하면 이전 런타임 색을 제거한다", async () => {
    const hook = renderHook(useFixture);
    await ready(hook);
    act(() => hook.result.current.binding.commitColor("skin", "#123456"));
    await waitFor(() => expect(hook.result.current.h.customColors.body).toBe("#123456"));
    const current = hook.result.current.workbench.authoring.snapshot.document;
    await act(async () => {
      expect(await hook.result.current.workbench.authoring.importJson(serializeCharacterDocumentV3({
        ...current, look: { ...current.look, colors: {} },
      }))).toBe(true);
    });
    await waitFor(() => expect(hook.result.current.h.customColors.body).toBeUndefined());
    expect(hook.result.current.workbench.hostRuntime.error).toBeNull();
    expect(hook.result.current.binding.recipe.colors.skin).toBeNull();
    expect(hook.result.current.binding.history.length).toBe(2);
  });

  it("늦게 끝난 Worker·이전 모델 preview가 새 문서나 이력을 덮어쓰지 않는다", async () => {
    const hook = renderHook(useFixture, { initialProps: { modelId: "model-a" } });
    await ready(hook);
    const authority = hook.result.current.workbench.authoring.authority;
    const job = authority.beginJob("delayed/job");
    act(() => hook.result.current.binding.commitColor("skin", "#123456"));
    expect(authority.commitJob(job, { commandId: "delayed/commit", label: "늦은 색상", operations: [{ kind: "set-color", target: "skin", color: "#abcdef" }] }).status).toBe("stale");
    const old = authority.getSnapshot().document;
    act(() => { authority.beginPreview({ commandId: "model/preview", label: "이전 모델 미리보기", source: "user", expectedDocumentId: old.documentId, expectedRevision: old.revision,
      operations: [{ kind: "set-color", target: "skin", color: "#aabbcc" }] }); });
    hook.rerender({ modelId: "model-b" });
    await ready(hook);
    expect(hook.result.current.workbench.authoring.authority).not.toBe(authority);
    expect(hook.result.current.workbench.authoring.snapshot.previewDocument).toBeNull();
    expect(hook.result.current.binding.history.length).toBe(0);
    const serialized = serializeCharacterDocumentV3(hook.result.current.workbench.authoring.snapshot.document);
    act(() => { authority.cancelPreview(); });
    expect(serializeCharacterDocumentV3(hook.result.current.workbench.authoring.snapshot.document)).toBe(serialized);
  });
});
