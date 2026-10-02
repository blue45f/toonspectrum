/**
 * GLB 내보내기 dense morph 용량(요청 §4.4): Babylon serializer는 morph target을 변경 정점 수와 무관하게 dense accessor로 쓴다.
 * `exportGlb()`가 사후 처리(`glb-sparse-morph.ts`)로 sparse accessor로 정리하는지, 실제 제작 패키지(Orion)에서 용량과 데이터가 어떻게 되는지 확인한다.
 * 실측(이 환경, NullEngine): Orion 내보내기 12.36 MB → 3.61 MB. 변경 정점이 많은 morph(헤어·눈 등)는 sparse가 더 커서 dense로 둔다.
 * 외부 뷰어에서 sparse가 보이는지(three.js·Blender 등)는 브라우저·외부 도구 미검증이다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseGlb } from "../testing/minimal-glb";

import { sparsifyGlbMorphTargets } from "./glb-sparse-morph";
import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createPackagePlanFixture } from "./testing/package-plan-fixture";

import type { NullEngineHarness } from "./testing/null-engine-harness";

const CHARACTERS_ROOT = path.resolve(process.cwd().endsWith("character-lab") ? process.cwd() : path.join(process.cwd(), "apps", "character-lab"), "public", "assets", "characters");

interface Accessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly sparse?: { readonly count: number; readonly indices: { readonly bufferView: number; readonly byteOffset?: number; readonly componentType: number }; readonly values: { readonly bufferView: number; readonly byteOffset?: number } };
}
interface BufferView {
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}
interface Gltf {
  readonly accessors: readonly Accessor[];
  readonly bufferViews: readonly BufferView[];
  readonly nodes: ReadonlyArray<{ readonly name?: string; readonly mesh?: number }>;
  readonly meshes: ReadonlyArray<{ readonly primitives: ReadonlyArray<{ readonly targets?: ReadonlyArray<{ readonly POSITION?: number }> }> }>;
}

const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** glTF accessor(sparse 포함)를 dense Float32로 푼다(float 성분만) */
function readFloats(json: Gltf, bin: Uint8Array, index: number): Float32Array {
  const accessor = json.accessors[index];
  if (!accessor) throw new Error(`accessor ${index}가 없습니다.`);
  if (accessor.componentType !== 5126) throw new Error("float accessor만 지원합니다.");
  const width = COMPONENTS[accessor.type] ?? 1;
  const out = new Float32Array(accessor.count * width);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  if (accessor.bufferView !== undefined) {
    const bufferView = json.bufferViews[accessor.bufferView];
    if (!bufferView) throw new Error("bufferView가 없습니다.");
    const stride = bufferView.byteStride ?? width * 4;
    const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let i = 0; i < accessor.count; i += 1) for (let c = 0; c < width; c += 1) out[i * width + c] = view.getFloat32(base + i * stride + c * 4, true);
  }
  if (accessor.sparse) {
    const { sparse } = accessor;
    const indexView = json.bufferViews[sparse.indices.bufferView];
    const valueView = json.bufferViews[sparse.values.bufferView];
    if (!indexView || !valueView) throw new Error("sparse bufferView가 없습니다.");
    const indexBase = (indexView.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0);
    const valueBase = (valueView.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0);
    const indexSize = sparse.indices.componentType === 5125 ? 4 : sparse.indices.componentType === 5123 ? 2 : 1;
    let previous = -1;
    for (let k = 0; k < sparse.count; k += 1) {
      const position = indexBase + k * indexSize;
      const target = indexSize === 4 ? view.getUint32(position, true) : indexSize === 2 ? view.getUint16(position, true) : view.getUint8(position);
      if (target <= previous || target >= accessor.count) throw new Error(`sparse 인덱스가 순서·범위를 어겼습니다: ${target}`);
      previous = target;
      for (let c = 0; c < width; c += 1) out[target * width + c] = view.getFloat32(valueBase + (k * width + c) * 4, true);
    }
  }
  return out;
}

function readPackageBytes(id: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(CHARACTERS_ROOT, id, `${id}.glb`)));
}

let harness: NullEngineHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

async function exportPackage(id: string): Promise<{ readonly bytes: Uint8Array; readonly exported: Uint8Array; readonly detail: string; readonly harness: NullEngineHarness }> {
  const bytes = readPackageBytes(id);
  const plan = createPackagePlanFixture({ characterId: id, glbUrl: `/assets/characters/${id}/${id}.glb`, bytes, preferredLod: 0 });
  harness = await createNullEngineHarness({ fetchBytes: () => Promise.resolve(bytes), verifyPackageSha: false, now: () => 7_000 });
  await harness.engine.loadSource({ kind: "package", plan });
  const exported = await harness.engine.exportGlb();
  return { bytes, exported, detail: harness.engine.sceneFeatures().glbMorphSparse.detail ?? "", harness };
}

/** 보고 문구 "12.36 MB → 3.61 MB"에서 앞뒤 MB를 읽는다 */
function megabytesOf(detail: string): { readonly before: number; readonly after: number } {
  const match = /([\d.]+) MB → ([\d.]+) MB/u.exec(detail);
  if (!match) throw new Error(`보고 문구에서 용량을 읽지 못했습니다: ${detail}`);
  return { before: Number(match[1]), after: Number(match[2]) };
}

describe("GLB 내보내기: dense morph → sparse 정리(실제 제작 패키지)", () => {
  it("Orion: 내보내기 용량이 약 12 MB에서 4 MB 안팎으로 준다(보고 문구와 실제 바이트 일치)", async () => {
    const { exported, detail } = await exportPackage("avatar-orion-authored");
    const { before, after } = megabytesOf(detail);
    expect(before).toBeGreaterThan(10);
    expect(before).toBeLessThan(15);
    expect(after).toBeLessThan(4.2);
    expect(after).toBeLessThan(before * 0.4);
    expect(exported.byteLength / (1024 * 1024)).toBeCloseTo(after, 1);
    expect(detail).toMatch(/sparse \d+개/u);
    expect(detail).toContain("dense 유지");
  });

  it("Orion: 출력은 유효한 GLB이고 메시별 morph target 수가 보존되며 sparse accessor가 100개 넘게 생긴다", async () => {
    const { exported } = await exportPackage("avatar-orion-authored");
    const parsed = parseGlb(exported);
    const json = parsed.json as unknown as Gltf;
    const rig = harness?.engine.inspectRig();
    const expected = new Map<string, number>();
    rig?.parts.forEach((part) => part.meshNames.forEach((name, i) => expected.set(name, part.morphTargetCountsByMesh[i] ?? 0)));
    let checked = 0;
    for (const node of json.nodes) {
      if (node.mesh === undefined || !node.name) continue;
      const primitives = json.meshes[node.mesh]?.primitives ?? [];
      const targets = primitives[0]?.targets?.length ?? 0;
      if (expected.has(node.name)) {
        expect(targets, node.name).toBe(expected.get(node.name));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(3);
    expect(json.accessors.filter((accessor) => accessor.sparse !== undefined).length).toBeGreaterThan(100);
  });

  it("Orion: 내보낸 sparse morph를 dense로 풀면 로드된 Babylon morph target 변위와 같다(무손실)", async () => {
    const { exported, harness: h } = await exportPackage("avatar-orion-authored");
    const parsed = parseGlb(exported);
    const json = parsed.json as unknown as Gltf;
    const bin = parsed.bin;
    if (!bin) throw new Error("BIN 청크가 없습니다.");
    const scene = h.nullEngine.scenes[0];
    let compared = 0;
    let worst = 0;
    for (const node of json.nodes) {
      if (node.mesh === undefined || !node.name) continue;
      const primitive = json.meshes[node.mesh]?.primitives[0];
      const mesh = scene?.getMeshByName(node.name);
      const manager = mesh?.morphTargetManager;
      const base = mesh?.getVerticesData("position");
      if (!primitive?.targets || !manager || !base) continue;
      for (let t = 0; t < Math.min(primitive.targets.length, manager.numTargets, 6); t += 1) {
        const accessorIndex = primitive.targets[t]?.POSITION;
        const absolute = manager.getTarget(t).getPositions();
        if (accessorIndex === undefined || !absolute) continue;
        const delta = readFloats(json, bin, accessorIndex);
        expect(delta.length).toBe(base.length);
        for (let i = 0; i < delta.length; i += 1) worst = Math.max(worst, Math.abs((delta[i] as number) - ((absolute[i] as number) - (base[i] as number))));
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(10);
    expect(worst).toBeLessThan(1e-5);
  });

  it("정리 결과를 다시 정리해도 바뀌지 않는다(멱등)", async () => {
    const { exported } = await exportPackage("avatar-orion-authored");
    const again = sparsifyGlbMorphTargets(exported);
    expect(again.report.unchanged).toBe(true);
    expect(again.glb.byteLength).toBe(exported.byteLength);
  });

  it("reference-character(변경 정점이 많은 소형 패키지)는 줄어드는 폭이 작지만 같은 방식으로 줄고 dense 유지 수를 밝힌다", async () => {
    const { exported, detail } = await exportPackage("reference-character");
    const { before, after } = megabytesOf(detail);
    expect(after).toBeLessThan(before);
    expect(detail).toContain("dense 유지");
    expect(parseGlb(exported).version).toBe(2);
  });

  it("morph가 없는 절차 소스 내보내기는 정리할 것이 없다고 밝힌다", async () => {
    harness = await createNullEngineHarness({ now: () => 7_000 });
    const { createProceduralFixture } = await import("./testing/procedural-fixture");
    const model = createProceduralFixture();
    await harness.engine.loadSource({ kind: "procedural", model: { ...model, parts: model.parts.map((part) => ({ ...part, morphs: [] })), morphNames: [] } });
    const exported = await harness.engine.exportGlb();
    expect(parseGlb(exported).version).toBe(2);
    const state = harness.engine.sceneFeatures().glbMorphSparse;
    expect(state.status).toBe("off");
    expect(state.reasonKo).toContain("morph target가 없어");
  });
});
