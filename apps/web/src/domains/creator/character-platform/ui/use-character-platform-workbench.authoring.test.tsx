// @vitest-environment jsdom
import { useMemo, useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { createAvatarForgeState } from "../../vrm/studio-vrm-avatar-forge";
import { serializeCharacterDocumentV3 } from "../document/character-document-v3";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";

const database = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: (namespace: string) => ({
    get: async (key: string) => database.rows.get(`${namespace}/${key}`) ?? null,
    set: async (key: string, value: string) => { database.rows.set(`${namespace}/${key}`, value); },
    delete: async (key: string) => { database.rows.delete(`${namespace}/${key}`); },
  }) }),
}));

function useFixture() {
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [transparentBackground, setTransparentBackground] = useState(true);
  const [avatarForgeState, handleAvatarForgeChange] = useState(createAvatarForgeState);
  const vrm = useMemo(() => ({ scene: new Group() }), []);
  const h = { activeModelId: "runtime-authoring-test", status: "ready", vrm,
    customColors, setCustomColors, transparentBackground, setTransparentBackground, avatarForgeState, handleAvatarForgeChange };
  const binding = useCharacterShaperBinding(h);
  return { workbench: useCharacterPlatformWorkbench(h, binding), customColors, transparentBackground, avatarForgeState, binding };
}

beforeEach(() => database.rows.clear());
afterEach(cleanup);

describe("V3 authority와 실제 호스트 상태의 왕복", () => {
  it("색상 명령·undo·redo·백업 import를 실제 캐릭터 색에 적용하고 echo로 history를 늘리지 않는다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.authoring.hydrated).toBe(true));
    const initial = hook.result.current.workbench.authoring.snapshot.document;
    act(() => {
      expect(hook.result.current.workbench.authoring.dispatch({
        commandId: "authoring/skin", label: "피부색", source: "user",
        expectedDocumentId: initial.documentId, expectedRevision: initial.revision,
        operations: [{ kind: "set-color", target: "skin", color: "#123456" }],
      }).status).toBe("applied");
    });
    await waitFor(() => expect(hook.result.current.customColors.body).toBe("#123456"));
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(1);
    act(() => { hook.result.current.workbench.authoring.undo(); });
    await waitFor(() => expect(hook.result.current.customColors.body).toBeUndefined());
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(0);
    act(() => { hook.result.current.workbench.authoring.redo(); });
    await waitFor(() => expect(hook.result.current.customColors.body).toBe("#123456"));
    const imported = { ...initial, look: { ...initial.look, colors: { ...initial.look.colors, skin: "#abcdef" } } };
    await act(async () => { expect(await hook.result.current.workbench.authoring.importJson(serializeCharacterDocumentV3(imported))).toBe(true); });
    await waitFor(() => expect(hook.result.current.customColors.body).toBe("#abcdef"));
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(2);
    expect(hook.result.current.workbench.hostRuntime.error).toBeNull();
    act(() => { hook.result.current.workbench.authoring.undo(); });
    await waitFor(() => expect(hook.result.current.customColors.body).toBe("#123456"));
  });

  it("저장 후 다시 연 문서를 빈 호스트보다 우선하여 복원한다", async () => {
    const first = renderHook(useFixture);
    await waitFor(() => expect(first.result.current.workbench.authoring.hydrated).toBe(true));
    const initial = first.result.current.workbench.authoring.snapshot.document;
    await act(async () => {
      await first.result.current.workbench.authoring.importJson(serializeCharacterDocumentV3({
        ...initial, look: { ...initial.look, colors: { ...initial.look.colors, skin: "#345678" } },
      }));
    });
    await waitFor(() => expect(first.result.current.customColors.body).toBe("#345678"));
    first.unmount();
    const reopened = renderHook(useFixture);
    await waitFor(() => expect(reopened.result.current.customColors.body).toBe("#345678"));
    expect(reopened.result.current.workbench.authoring.snapshot.document.look.colors.skin).toBe("#345678");
    expect(reopened.result.current.workbench.authoring.snapshot.canUndo).toBe(false);
  });

  it("V3 출력 변경은 기존 렌더 배경 상태와 undo를 함께 갱신한다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.authoring.hydrated).toBe(true));
    act(() => {
      const document = hook.result.current.workbench.authoring.snapshot.document;
      hook.result.current.workbench.authoring.dispatch({
        commandId: "authoring/output", label: "불투명 배경", source: "user",
        expectedDocumentId: document.documentId, expectedRevision: document.revision,
        operations: [{ kind: "set-output", output: { ...document.output, transparent: false } }],
      });
    });
    await waitFor(() => expect(hook.result.current.transparentBackground).toBe(false));
    act(() => { hook.result.current.workbench.authoring.undo(); });
    await waitFor(() => expect(hook.result.current.transparentBackground).toBe(true));
  });

  it("정밀 얼굴 제어는 카드와 충돌하지 않고 레이어 삭제 시 기본값으로 복원한다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.authoring.hydrated).toBe(true));
    act(() => {
      const document = hook.result.current.workbench.authoring.snapshot.document;
      hook.result.current.workbench.authoring.dispatch({
        commandId: "authoring/face", label: "얼굴 너비", source: "user",
        expectedDocumentId: document.documentId, expectedRevision: document.revision,
        operations: [{ kind: "upsert-deformation-layer", layer: {
          layerId: "deform:face-controls", kind: "control-cage", name: "얼굴", enabled: true,
          symmetric: true, falloff: 0.5, controlPoints: { headWidth: [1.12, 0, 0] },
        } }],
      });
    });
    await waitFor(() => expect(hook.result.current.avatarForgeState.face.headWidth).toBe(1.12));
    await waitFor(() => expect(hook.result.current.workbench.hostRuntime.pending).toBe(false));
    expect(hook.result.current.workbench.hostRuntime.error).toBeNull();
    act(() => {
      const document = hook.result.current.workbench.authoring.snapshot.document;
      hook.result.current.workbench.authoring.dispatch({
        commandId: "authoring/face-remove", label: "얼굴 제어 삭제", source: "user",
        expectedDocumentId: document.documentId, expectedRevision: document.revision,
        operations: [{ kind: "remove-deformation-layer", layerId: "deform:face-controls" }],
      });
    });
    await waitFor(() => expect(hook.result.current.avatarForgeState.face.headWidth).toBe(createAvatarForgeState().face.headWidth));
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(2);
  });
});
