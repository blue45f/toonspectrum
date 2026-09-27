// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Group, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { executeCharacterAuthoringTaskInBrowser } from "../runtime/character-authoring-worker-client";
import { executeCharacterAuthoringTask } from "../runtime/character-authoring-worker-runtime";
import { addCharacterGroomGroup } from "./character-groom-edit";
import { useCharacterGroomRuntime } from "./use-character-groom-runtime";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterAuthoringWorkerResultPayload } from "../runtime/character-authoring-worker-protocol";

vi.mock("../runtime/character-authoring-worker-client", () => ({ executeCharacterAuthoringTaskInBrowser: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function fixture() {
  const scene = new Scene();
  const modelRoot = new Group();
  const head = new Group();
  modelRoot.add(head); scene.add(modelRoot);
  const h = { status: "ready", vrm: { scene: modelRoot, humanoid: { getRawBoneNode: () => head } },
    captureRef: { current: { scene } }, texturePaintInvalidateRef: { current: vi.fn() }, captureSceneGeneration: 1,
  } as unknown as StudioVrmPoserHost;
  const initial = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:groom-hook",
    model: { assetId: "model:test", assetVersion: "1", contentSha256: null, mode: "canonical", topologyFamily: "family:test", topologyRevision: "topology:test", rigRevision: "rig:1", morphRevision: "morph:1", rendererRevision: "renderer:1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:1" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  const document = { ...initial, groom: addCharacterGroomGroup(initial.groom, "헤어") };
  return { scene, modelRoot, head, h, document };
}

describe("useCharacterGroomRuntime 준비와 복원", () => {
  it("문서 복원 전에는 Worker와 파생 메시를 만들지 않고 복원 후 실제 준비를 표시한다", async () => {
    const f = fixture();
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation(async (task) => executeCharacterAuthoringTask(task));
    const hook = renderHook(({ enabled }) => useCharacterGroomRuntime({ h: f.h, document: f.document, modelKey: "model:test", enabled }), { initialProps: { enabled: false } });
    expect(hook.result.current.status).toBe("idle");
    expect(executeCharacterAuthoringTaskInBrowser).not.toHaveBeenCalled();
    expect(f.head.children).toHaveLength(0);
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.head.children[0]?.children).toHaveLength(1);
    hook.rerender({ enabled: false });
    expect(hook.result.current.status).toBe("idle");
    expect(f.head.children).toHaveLength(0);
  });

  it("미리보기 취소 후 늦은 Worker가 돌아와도 원본 메시와 현재 준비 상태를 덮어쓰지 않는다", async () => {
    const f = fixture();
    const requests: { readonly resolve: (value: CharacterAuthoringWorkerResultPayload) => void; readonly payload: CharacterAuthoringWorkerResultPayload }[] = [];
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation((task) => new Promise((resolve) => {
      requests.push({ resolve, payload: executeCharacterAuthoringTask(task) });
    }));
    const hook = renderHook(({ document }) => useCharacterGroomRuntime({ h: f.h, document, modelKey: "model:test" }), { initialProps: { document: f.document } });
    const first = requests[0];
    if (!first) throw new Error("첫 요청이 없습니다.");
    await act(async () => { first.resolve(first.payload); });
    expect(hook.result.current.status).toBe("ready");
    const preview = { ...f.document, groom: { ...f.document.groom, groups: f.document.groom.groups.map((group) => ({ ...group, profile: { ...group.profile, lengthScale: 2 } })) } };
    hook.rerender({ document: preview });
    expect(hook.result.current.status).toBe("building");
    hook.rerender({ document: f.document });
    expect(hook.result.current.status).toBe("building");
    const second = requests[1]; const third = requests[2];
    if (!second || !third) throw new Error("취소와 복원 요청이 없습니다.");
    await act(async () => { third.resolve(third.payload); });
    const restored = f.head.children[0]?.children[0];
    await act(async () => { second.resolve(second.payload); });
    expect(hook.result.current.status).toBe("ready");
    expect(f.head.children[0]?.children[0]).toBe(restored);
  });

  it("모델이 capture 장면에서 빠지면 메시·준비 상태를 해제하고 재부착 때 복원한다", async () => {
    const f = fixture();
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation(async (task) => executeCharacterAuthoringTask(task));
    const hook = renderHook(() => useCharacterGroomRuntime({ h: f.h, document: f.document, modelKey: "model:test" }));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    act(() => { f.scene.remove(f.modelRoot); });
    expect(hook.result.current.status).toBe("idle");
    expect(f.head.children).toHaveLength(0);
    act(() => { f.scene.add(f.modelRoot); });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.head.children[0]?.children).toHaveLength(1);
  });
});
