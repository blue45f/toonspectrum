import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from "three";

import { validateCharacterGeometryStrokeDocument } from "../surface-ink/character-geometry-stroke";
import { executeCharacterAuthoringTaskInBrowser } from "./character-authoring-worker-client";

import type { CharacterGeometryStrokeDocument } from "../surface-ink/character-geometry-stroke";
import type { CharacterGroomTaskExecutor } from "../groom/character-groom-three-runtime";
import type { Object3D } from "three";

const OUTPUT_BUDGET = 128 * 1024 * 1024;
export interface CharacterGeometryRuntimeResult {
  readonly status: "ready" | "stale";
  readonly strokeCount: number;
  readonly warnings: readonly string[];
}

function dispose(group: Group): void {
  group.removeFromParent();
  group.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
  });
  group.clear();
}

/** 자유 공간 원본을 모델 좌표의 파생 메시로 재생한다. 늦은 Worker는 게시하지 않는다. */
export class CharacterGeometryStrokeThreeRuntime {
  #generation = 0;
  #abort: AbortController | null = null;
  #group: Group | null = null;
  #disposed = false;

  constructor(readonly parent: Object3D, readonly invalidate: () => void,
    readonly execute: CharacterGroomTaskExecutor = executeCharacterAuthoringTaskInBrowser) {}

  async update(document: CharacterGeometryStrokeDocument): Promise<CharacterGeometryRuntimeResult> {
    if (this.#disposed) throw new Error("종료된 입체선 런타임입니다.");
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    const generation = ++this.#generation;
    const group = new Group();
    // 기존 semantic PSD가 이 조상 이름으로 액세서리 마스크를 식별한다.
    group.name = "prop:character-geometry-strokes";
    group.userData.characterAuthoringDerivative = "geometry-stroke";
    const warnings: string[] = [];
    let bytes = 0;
    try {
      const valid = validateCharacterGeometryStrokeDocument(document);
      for (const stroke of valid.strokes) {
        if (!stroke.visible) continue;
        if (stroke.status !== "valid" || stroke.points.some((point) => point.anchor.kind === "surface")) {
          warnings.push(`${stroke.name}: 표면 입체선의 부착 구조를 확인할 수 없어 원본을 보존하고 표시를 중지했습니다.`);
          continue;
        }
        if (abort.signal.aborted) throw new DOMException("입체선 생성을 취소했습니다.", "AbortError");
        const payload = await this.execute({ kind: "build-geometry-stroke", stroke }, { signal: abort.signal, allowMainThreadFallback: false });
        if (abort.signal.aborted) throw new DOMException("입체선 생성을 취소했습니다.", "AbortError");
        if (payload.kind !== "mesh") throw new Error("입체선 Worker가 메시를 반환하지 않았습니다.");
        bytes += payload.byteLength;
        if (bytes > OUTPUT_BUDGET) throw new Error("입체선 표시 메모리 예산을 초과했습니다. 원본은 보존됩니다.");
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(payload.positions), 3));
        geometry.setAttribute("normal", new BufferAttribute(new Float32Array(payload.normals), 3));
        geometry.setAttribute("uv", new BufferAttribute(new Float32Array(payload.uvs), 2));
        geometry.setIndex(new BufferAttribute(new Uint32Array(payload.indices), 1));
        geometry.computeBoundingSphere();
        const alpha = stroke.style.color.length === 9 ? Number.parseInt(stroke.style.color.slice(7), 16) / 255 : 1;
        const opacity = stroke.style.opacity * alpha;
        const material = new MeshStandardMaterial({ color: stroke.style.color.slice(0, 7), opacity, transparent: opacity < 1,
          side: DoubleSide, roughness: 0.8, metalness: 0, wireframe: stroke.style.lineOnly || !stroke.style.fill });
        material.name = `geometry-stroke:${stroke.strokeId}`;
        material.userData.toonstudioComponent = "props";
        const mesh = new Mesh(geometry, material);
        mesh.name = `character-geometry-stroke:${stroke.strokeId}`;
        mesh.userData.characterAuthoringDerivative = "geometry-stroke";
        mesh.userData.toonstudioComponent = "props";
        mesh.userData.characterGeometryStrokeId = stroke.strokeId;
        mesh.raycast = () => undefined;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      if (this.#disposed || generation !== this.#generation || abort.signal.aborted) {
        dispose(group);
        return { status: "stale", strokeCount: 0, warnings };
      }
      if (this.#group) dispose(this.#group);
      this.#group = group;
      this.parent.add(group);
      this.invalidate();
      return { status: "ready", strokeCount: group.children.length, warnings };
    } catch (error) {
      dispose(group);
      if (this.#disposed || generation !== this.#generation || abort.signal.aborted) return { status: "stale", strokeCount: 0, warnings };
      // 오류 화면에서 이전 문서의 파생 메시가 현재 원본처럼 남지 않게 한다.
      if (this.#group) dispose(this.#group);
      this.#group = null;
      this.invalidate();
      throw error;
    } finally { if (this.#abort === abort) this.#abort = null; }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#abort?.abort();
    this.#abort = null;
    if (this.#group) dispose(this.#group);
    this.#group = null;
    this.invalidate();
  }
}
