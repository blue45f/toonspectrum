import { Group, Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { executeCharacterAuthoringTask } from "../runtime/character-authoring-worker-runtime";
import { addCharacterGroomGroup } from "./character-groom-edit";
import { createEmptyCharacterGroomDocument } from "./character-groom-document";
import { CharacterGroomThreeRuntime, type CharacterGroomTaskExecutor } from "./character-groom-three-runtime";

import type { CharacterAuthoringWorkerResultPayload } from "../runtime/character-authoring-worker-protocol";

function groom() { return addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:test"), "앞머리"); }
const execute: CharacterGroomTaskExecutor = async (task) => executeCharacterAuthoringTask(task);

function onlyMesh(parent: Group): Mesh {
  const group = parent.children[0];
  const mesh = group?.children[0];
  if (!(mesh instanceof Mesh)) throw new Error("생성된 헤어 메시가 없습니다.");
  return mesh;
}

describe("CharacterGroomThreeRuntime", () => {
  it("Worker 결과로 실제 머리 자식 메시를 만들고 머리 이동을 따르며 파생 자원을 정리한다", async () => {
    const head = new Group();
    const invalidate = vi.fn();
    const runtime = new CharacterGroomThreeRuntime(head, invalidate, execute);
    const source = groom();
    const serialized = JSON.stringify(source);
    const result = await runtime.update(source, "topology:test", "#123456");
    expect(result.guideCount).toBe(1);
    expect(result.triangleCount).toBe(36);
    const mesh = onlyMesh(head);
    expect(mesh.geometry.getAttribute("position").count).toBe(38);
    expect(mesh.geometry.getIndex()?.count).toBe(108);
    head.position.set(0, 2, 0);
    head.updateMatrixWorld(true);
    expect(mesh.getWorldPosition(new Vector3()).y).toBe(2);
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) throw new Error("헤어 재질이 없습니다.");
    const disposeMaterial = vi.spyOn(material, "dispose");
    runtime.dispose();
    expect(head.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(source)).toBe(serialized);
  });

  it("수정과 빈 원본 복원 때 이전 메시와 재질을 해제한다", async () => {
    const head = new Group();
    const runtime = new CharacterGroomThreeRuntime(head, () => undefined, execute);
    const source = groom();
    await runtime.update(source, "topology:test");
    const first = onlyMesh(head);
    const dispose = vi.spyOn(first.geometry, "dispose");
    const changed = { ...source, groups: source.groups.map((group) => ({ ...group, profile: { ...group.profile, lengthScale: 2 } })) };
    await runtime.update(changed, "topology:test");
    expect([...onlyMesh(head).geometry.getAttribute("position").array]).not.toEqual([...first.geometry.getAttribute("position").array]);
    expect(dispose).toHaveBeenCalledTimes(1);
    await runtime.update(createEmptyCharacterGroomDocument("topology:test"), "topology:test");
    expect(head.children[0]?.children).toHaveLength(0);
    runtime.dispose();
  });

  it("더 늦게 끝난 이전 요청은 게시하지 않고 이전 Worker 신호를 취소한다", async () => {
    const requests: { readonly resolve: (value: CharacterAuthoringWorkerResultPayload) => void; readonly value: CharacterAuthoringWorkerResultPayload; readonly signal: AbortSignal | undefined }[] = [];
    const delayed: CharacterGroomTaskExecutor = (task, options) => new Promise((resolve) => requests.push({ resolve, value: executeCharacterAuthoringTask(task), signal: options?.signal }));
    const head = new Group();
    const runtime = new CharacterGroomThreeRuntime(head, () => undefined, delayed);
    const old = runtime.update(groom(), "topology:test");
    const latest = runtime.update(groom(), "topology:test");
    const first = requests[0];
    const second = requests[1];
    if (!first || !second) throw new Error("두 Worker 요청이 필요합니다.");
    expect(first.signal?.aborted).toBe(true);
    second.resolve(second.value);
    expect((await latest).status).toBe("ready");
    const mesh = onlyMesh(head);
    first.resolve(first.value);
    expect((await old).status).toBe("stale");
    expect(onlyMesh(head)).toBe(mesh);
    runtime.dispose();
  });

  it("생성 도중 종료하면 취소하고 장면에 메시를 남기지 않는다", async () => {
    let finish: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    const delayed: CharacterGroomTaskExecutor = (task, options) => new Promise((resolve) => {
      signal = options?.signal;
      finish = () => resolve(executeCharacterAuthoringTask(task));
    });
    const head = new Group();
    const runtime = new CharacterGroomThreeRuntime(head, () => undefined, delayed);
    const pending = runtime.update(groom(), "topology:test");
    runtime.dispose();
    expect(signal?.aborted).toBe(true);
    finish?.();
    expect((await pending).status).toBe("stale");
    expect(head.children).toHaveLength(0);
  });

  it("다른 토폴로지나 확인되지 않은 표면 앵커는 메시로 표시하지 않으며 원본을 유지한다", async () => {
    const head = new Group();
    const run = vi.fn(execute);
    const runtime = new CharacterGroomThreeRuntime(head, () => undefined, run);
    const source = groom();
    expect((await runtime.update(source, "topology:other")).skippedGuideCount).toBe(1);
    const anchored = { ...source, groups: source.groups.map((group) => ({ ...group, scalpRegionId: "scalp:front" })) };
    expect((await runtime.update(anchored, "topology:test")).skippedGuideCount).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(source.groups[0]?.guides).toHaveLength(1);
    runtime.dispose();
  });

  it("Worker 오류 후 재시도해 실제 메시를 복원한다", async () => {
    const head = new Group();
    const run = vi.fn(execute).mockRejectedValueOnce(new Error("Worker 생성 실패"));
    const runtime = new CharacterGroomThreeRuntime(head, () => undefined, run);
    await expect(runtime.update(groom(), "topology:test")).rejects.toThrow("Worker 생성 실패");
    expect(head.children).toHaveLength(0);
    await expect(runtime.update(groom(), "topology:test")).resolves.toMatchObject({ status: "ready", guideCount: 1 });
    expect(onlyMesh(head).geometry.getAttribute("position").count).toBeGreaterThan(0);
    runtime.dispose();
  });
});
