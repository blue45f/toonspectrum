import { Group, Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { buildStudioVrmComponentCapturePlan } from "../../vrm/studio-vrm-component-pass-plan";
import { executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";
import { CharacterGeometryStrokeThreeRuntime } from "./character-geometry-stroke-three-runtime";

import type { CharacterGroomTaskExecutor } from "../groom/character-groom-three-runtime";
import type { CharacterGeometryStroke, CharacterGeometryStrokeDocument } from "../surface-ink/character-geometry-stroke";
import type { CharacterAuthoringWorkerResultPayload } from "./character-authoring-worker-protocol";

const stroke: CharacterGeometryStroke = {
  strokeId: "stroke:free", name: "자유 입체선", visible: true, locked: false, status: "valid",
  style: { color: "#123456", baseWidth: 0.03, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0.5, profile: "ribbon", fill: true, lineOnly: false },
  points: [
    { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
    { anchor: { kind: "free", position: [0, 1, 0] }, pressure: 0.5, width: 1, twist: 0 },
  ],
};
const document: CharacterGeometryStrokeDocument = { version: 1, strokes: [stroke] };
const execute: CharacterGroomTaskExecutor = async (task) => executeCharacterAuthoringTask(task);
function onlyMesh(root: Group): Mesh {
  const mesh = root.children[0]?.children[0];
  if (!(mesh instanceof Mesh)) throw new Error("입체선이 없습니다.");
  return mesh;
}

describe("CharacterGeometryStrokeThreeRuntime", () => {
  it("free 원본을 실제 모델 좌표의 메시로 표시하고 기존 PSD 구성 패스에서 props로 분류한다", async () => {
    const root = new Group();
    const runtime = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, execute);
    const serialized = JSON.stringify(document);
    expect(await runtime.update(document)).toEqual({ status: "ready", strokeCount: 1, warnings: [] });
    const mesh = onlyMesh(root);
    root.position.set(1, 2, 3);
    root.updateMatrixWorld(true);
    expect(mesh.getWorldPosition(new Vector3()).toArray()).toEqual([1, 2, 3]);
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(mesh.castShadow).toBe(true);
    const plan = buildStudioVrmComponentCapturePlan([{ objectId: mesh.uuid, objectName: mesh.name, objectUserData: mesh.userData }]);
    expect(plan.classifications[0]?.component).toBe("props");
    expect(plan.requiresReview).toBe(false);
    expect(plan.requests.find((pass) => pass.id === "props")?.includeRenderableIds).toContain(mesh.uuid);
    runtime.dispose();
    expect(root.children).toHaveLength(0);
    expect(JSON.stringify(document)).toBe(serialized);
  });

  it("preview 교체·cancel·undo 때 geometry와 material을 해제하고 복원한다", async () => {
    const root = new Group();
    const runtime = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, execute);
    await runtime.update(document);
    const first = onlyMesh(root);
    const geometryDispose = vi.spyOn(first.geometry, "dispose");
    if (Array.isArray(first.material)) throw new Error("입체선 재질은 하나입니다.");
    const materialDispose = vi.spyOn(first.material, "dispose");
    await runtime.update({ version: 1, strokes: [{ ...stroke, style: { ...stroke.style, baseWidth: 1 } }] });
    expect(onlyMesh(root).geometry.getAttribute("position").getX(0)).not.toBe(first.geometry.getAttribute("position").getX(0));
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    await runtime.update({ version: 1, strokes: [] });
    expect(root.children[0]?.children).toHaveLength(0);
    await runtime.update(document);
    expect(onlyMesh(root).geometry.getAttribute("position").array).toEqual(first.geometry.getAttribute("position").array);
    runtime.dispose();
  });

  it("늦은 Worker와 모델 종료 결과를 게시하지 않는다", async () => {
    const tasks: { resolve: (payload: CharacterAuthoringWorkerResultPayload) => void; payload: CharacterAuthoringWorkerResultPayload; signal?: AbortSignal }[] = [];
    const delayed: CharacterGroomTaskExecutor = (task, options) => new Promise((resolve) => tasks.push({ resolve, payload: executeCharacterAuthoringTask(task), signal: options?.signal }));
    const root = new Group();
    const runtime = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, delayed);
    const old = runtime.update(document);
    const next = runtime.update(document);
    const [first, second] = tasks;
    if (!first || !second) throw new Error("두 요청이 필요합니다.");
    expect(first.signal?.aborted).toBe(true);
    second.resolve(second.payload);
    expect((await next).status).toBe("ready");
    const mesh = onlyMesh(root);
    first.resolve(first.payload);
    expect((await old).status).toBe("stale");
    expect(onlyMesh(root)).toBe(mesh);
    const closing = runtime.update(document);
    runtime.dispose();
    const third = tasks[2];
    if (!third) throw new Error("세 번째 요청이 필요합니다.");
    third.resolve(third.payload);
    expect((await closing).status).toBe("stale");
    expect(root.children).toHaveLength(0);
  });

  it("Worker 실패에서 오래된 파생물을 제거하고 재시도로 복원한다", async () => {
    const root = new Group();
    const run = vi.fn(execute);
    const runtime = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, run);
    await runtime.update(document);
    run.mockRejectedValueOnce(new Error("Worker 실패"));
    await expect(runtime.update(document)).rejects.toThrow("Worker 실패");
    expect(root.children).toHaveLength(0);
    expect((await runtime.update(document)).strokeCount).toBe(1);
    runtime.dispose();
  });

  it("확인되지 않은 surface anchor는 원본을 보존하며 제한을 알린다", async () => {
    const root = new Group();
    const run = vi.fn(execute);
    const runtime = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, run);
    const surface: CharacterGeometryStrokeDocument = { version: 1, strokes: [{ ...stroke, status: "needs-reprojection" }] };
    const result = await runtime.update(surface);
    expect(result.strokeCount).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(run).not.toHaveBeenCalled();
    expect(surface.strokes[0]?.points).toBe(stroke.points);
    runtime.dispose();
  });
});
