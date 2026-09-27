// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Bone, Euler, Group, Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterAuthoringAuthority } from "../application/character-authoring-authority";
import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { captureCharacterPoseRuntimeV3 } from "./character-pose-runtime-adapter";
import { useCharacterPoseRuntime } from "./use-character-pose-runtime";

import type { CharacterAuthoringAuthorityHookResult } from "../ui/use-character-authoring-authority";
import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function fixture() {
  const scene = new Group();
  const nodes = new Map<string, Bone>();
  let parent: Group | Bone = scene;
  for (const name of ["hips", "leftUpperArm", "leftLowerArm", "leftHand"]) {
    const bone = new Bone(); bone.name = name; bone.position.x = 0.5; parent.add(bone); nodes.set(name, bone); parent = bone;
  }
  const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.15);
  const vrm = { scene, humanoid: {
    getNormalizedBoneNode: (name: string) => nodes.get(name) ?? null,
    normalizedRestPose: Object.fromEntries([...nodes].map(([name]) => [name, { rotation: name === "leftUpperArm" ? rest.toArray() : [0, 0, 0, 1] }])),
    update: vi.fn(),
  } };
  const base = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:pose-readiness", model: { assetId: "model:pose", assetVersion: "1", contentSha256: null, mode: "canonical" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "test" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  const document = { ...base, pose: captureCharacterPoseRuntimeV3({ source: vrm, poseId: "pose:initial", generationId: 1 }) };
  const authority = new CharacterAuthoringAuthority(document);
  const setCustomBones = vi.fn(); const setCustomYOffset = vi.fn(); const setPoseTranslations = vi.fn(); const setBodyRotation = vi.fn();
  const h: StudioVrmPoserHost = { vrm, status: "ready", customBones: { leftIndexProximal: { rotation: [0.1, 0.2, 0.3] } }, customYOffset: 0,
    poseTranslations: { root: [0, 0, 0], bones: {} }, bodyRotation: 0, setCustomBones, setCustomYOffset, setPoseTranslations, setBodyRotation };
  const setRuntimeSyncPending = vi.fn();
  function authoring(): CharacterAuthoringAuthorityHookResult {
    return { authority, snapshot: authority.getSnapshot(), hydrated: true, persistenceStatus: "ready", persistenceError: null,
      dispatch: (command) => authority.dispatch(command), beginPreview: (command) => authority.beginPreview(command),
      commitPreview: () => authority.commitPreview(), cancelPreview: () => authority.cancelPreview(), undo: () => authority.undo(), redo: () => authority.redo(),
      exportJson: () => JSON.stringify(authority.getSnapshot().document), importJson: async () => false, saveNow: async () => true, retryRestore: () => undefined, setRuntimeSyncPending };
  }
  function echo() {
    h.customBones = setCustomBones.mock.lastCall?.[0];
    h.customYOffset = setCustomYOffset.mock.lastCall?.[0];
    h.poseTranslations = setPoseTranslations.mock.lastCall?.[0];
    h.bodyRotation = setBodyRotation.mock.lastCall?.[0];
  }
  const seen: string[] = [];
  function useRuntime(input: { readonly host: StudioVrmPoserHost; readonly owner: CharacterAuthoringAuthority } = { host: h, owner: authority }) {
    const snapshot = useSyncExternalStore(input.owner.subscribe, input.owner.getSnapshot, input.owner.getSnapshot);
    const runtime = useCharacterPoseRuntime({ h: input.host, authoring: { ...authoring(), authority: input.owner, snapshot }, selectedRegions: ["left-arm"] });
    seen.push(`${runtime.pending}:${runtime.ready}:${runtime.runtimeError}`);
    return runtime;
  }
  function replace(pose: CharacterDocumentV3["pose"]) {
    const current = authority.getSnapshot().document;
    authority.dispatch({ commandId: `pose/change/${current.revision}`, label: "포즈 복원", source: "user", expectedDocumentId: current.documentId,
      expectedRevision: current.revision, operations: [{ kind: "set-pose", pose }] });
  }
  return { h, vrm, nodes, rest, authority, document, setCustomBones, echo, seen, useRuntime, replace, setRuntimeSyncPending };
}

describe("Pose V3 화면 적용 영수증", () => {
  it("첫 render부터 pending을 표시하고 모든 호스트 echo를 확인한 뒤에만 ready가 된다", () => {
    const f = fixture(); const hook = renderHook(() => f.useRuntime());
    expect(f.seen[0]).toBe("true:false:null");
    expect(hook.result.current.pending).toBe(true);
    expect(hook.result.current.ready).toBe(false);
    // root·몸높이도 맞지 않으면 뼈 회전 하나의 확인만으로 준비 완료가 되지 않는다.
    f.h.customYOffset = 8; f.h.customBones = f.setCustomBones.mock.lastCall?.[0]; hook.rerender();
    expect(hook.result.current.pending).toBe(true);
    f.echo(); hook.rerender();
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.ready).toBe(true);
    expect(f.authority.getSnapshot().historyLength).toBe(0);
  });

  it("preview 취소와 새 pose는 이전 ready를 무효화하고 늦은 echo는 준비 완료로 인정하지 않는다", () => {
    const f = fixture(); const hook = renderHook(() => f.useRuntime()); f.echo(); hook.rerender();
    const oldBones = f.h.customBones;
    const changed = { ...f.document.pose, bones: { ...f.document.pose.bones, leftUpperArm: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.7).toArray() as [number, number, number, number] } };
    f.seen.length = 0;
    act(() => { f.authority.beginPreview({ commandId: "pose-v3:preview", label: "미리보기", source: "user", expectedDocumentId: f.document.documentId,
      expectedRevision: f.document.revision, operations: [{ kind: "set-pose", pose: changed }] }); });
    expect(f.seen[0]).toBe("true:false:null");
    f.h.customBones = oldBones; hook.rerender();
    expect(hook.result.current.pending).toBe(true);
    f.echo(); hook.rerender(); expect(hook.result.current.ready).toBe(true);
    act(() => { f.authority.cancelPreview(); });
    expect(hook.result.current.pending).toBe(true);
    f.echo(); hook.rerender();
    expect(hook.result.current.ready).toBe(true);
    expect(f.nodes.get("leftUpperArm")?.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7);
    expect(f.authority.getSnapshot().historyLength).toBe(0);
  });

  it("empty pose는 rest를 본과 호스트에 복원하고 잔류 body override를 제거하며 손가락은 보존한다", () => {
    const f = fixture(); const hook = renderHook(() => f.useRuntime()); f.echo(); hook.rerender();
    f.h.customBones = { ...f.h.customBones, head: { rotation: [0.7, 0, 0] } };
    act(() => { f.replace({ ...f.document.pose, bones: {} }); });
    expect(hook.result.current.pending).toBe(true);
    const body = f.setCustomBones.mock.lastCall?.[0];
    expect(body.head).toBeUndefined();
    expect(body.leftIndexProximal).toEqual({ rotation: [0.1, 0.2, 0.3] });
    const rotation = body.leftUpperArm.rotation;
    expect(new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2], "YXZ")).angleTo(f.rest)).toBeLessThan(1e-7);
    expect(f.nodes.get("leftUpperArm")?.quaternion.angleTo(f.rest)).toBeLessThan(1e-7);
    f.echo(); hook.rerender(); expect(hook.result.current.ready).toBe(true);
    expect(f.authority.getSnapshot().document.pose.bones).toEqual({});
  });

  it("모델·authority가 바뀌면 이전 영수증을 무효화하고 timeout 뒤 재시도로 복구한다", () => {
    vi.useFakeTimers();
    const f = fixture(); const hook = renderHook(f.useRuntime, { initialProps: { host: f.h, owner: f.authority } });
    f.echo(); hook.rerender({ host: f.h, owner: f.authority }); expect(hook.result.current.ready).toBe(true);
    const next = fixture();
    hook.rerender({ host: next.h, owner: next.authority });
    expect(hook.result.current.pending).toBe(true);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.runtimeError).toContain("확인");
    act(() => { hook.result.current.retryRuntime(); });
    expect(hook.result.current.pending).toBe(true);
    next.echo(); hook.rerender({ host: next.h, owner: next.authority });
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.runtimeError).toBeNull();
    hook.unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it("실제 rest가 없으면 원본을 보존하고 실패를 표시하지만 적용할 pose가 없는 일반 모델은 막지 않는다", () => {
    const f = fixture();
    f.vrm.humanoid.normalizedRestPose = {};
    f.replace({ ...f.document.pose, bones: {} });
    const hook = renderHook(f.useRuntime, { initialProps: { host: f.h, owner: f.authority } });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.runtimeError).toContain("정규화 rest");
    expect(f.setCustomBones).not.toHaveBeenCalled();
    hook.rerender({ host: { ...f.h, vrm: { scene: new Group() } }, owner: f.authority });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.runtimeError).toBeNull();
  });

  it("같은 모델의 재로딩에서도 이전 ready 영수증을 재사용하지 않는다", () => {
    const f = fixture(); const hook = renderHook(() => f.useRuntime());
    f.echo(); hook.rerender(); expect(hook.result.current.ready).toBe(true);
    f.h.status = "loading"; hook.rerender();
    expect(hook.result.current.ready).toBe(false);
    f.h.status = "ready"; f.seen.length = 0; hook.rerender();
    expect(f.seen[0]).toBe("true:false:null");
    expect(hook.result.current.pending).toBe(true);
    f.echo(); hook.rerender(); expect(hook.result.current.ready).toBe(true);
  });
});
