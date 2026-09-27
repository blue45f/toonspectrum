// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";
import { useCharacterRenderExtras } from "./use-character-render-extras";

import type { CharacterAuthoringWorkerTask } from "./character-authoring-worker-protocol";
import type { CharacterDocumentV3 } from "../document/character-document-v3";

const worker = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("./character-authoring-worker-client", () => ({ executeCharacterAuthoringTaskInBrowser: (...args: unknown[]) => worker.execute(...args) }));
afterEach(() => { cleanup(); worker.execute.mockReset(); });

function fixture() {
  const root = new Group();
  const material = new MeshStandardMaterial({ color: "#123456" }); material.name = "skin";
  root.add(new Mesh(new BoxGeometry(), material));
  const h = { vrm: { scene: root }, status: "ready", texturePaintInvalidateRef: { current: vi.fn() }, captureOperationRef: { current: null } };
  const document = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:extras", model: { assetId: "model:extras", assetVersion: "1", contentSha256: null, mode: "canonical" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "test" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  return { root, material, h, document };
}

describe("useCharacterRenderExtras", () => {
  it("hydrate 전에는 실행하지 않고 활성화 후 preview·cancel을 실제 재질에 반영한다", async () => {
    const f = fixture();
    const changed: CharacterDocumentV3 = { ...f.document, look: { ...f.document.look, materialOverrides: [{ materialId: "skin", baseColor: "#ff0000" }] } };
    const hook = renderHook(({ document, enabled }) => useCharacterRenderExtras({ h: f.h, document, enabled }),
      { initialProps: { document: changed, enabled: false } });
    expect(hook.result.current.status).toBe("idle");
    expect(f.material.color.getHexString()).toBe("123456");
    hook.rerender({ document: changed, enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.material.color.getHexString()).toBe("ff0000");
    hook.rerender({ document: f.document, enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.material.color.getHexString()).toBe("123456");
    hook.unmount();
    expect(f.root.children).toHaveLength(1);
  });

  it("문서 변경 첫 render에서 building을 반환하며 모델 교체 후 늦은 Worker를 무시한다", async () => {
    const f = fixture();
    const pending: (() => void)[] = [];
    worker.execute.mockImplementation((task: CharacterAuthoringWorkerTask) => new Promise((resolve) => pending.push(() => resolve(executeCharacterAuthoringTask(task)))));
    const strokeDocument = { ...f.document, geometryStrokes: { version: 1 as const, strokes: [{
      strokeId: "stroke:free", name: "자유선", visible: true, locked: false, status: "valid" as const,
      style: { color: "#222222", baseWidth: 0.01, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, profile: "ribbon" as const, fill: true, lineOnly: false },
      points: [
        { anchor: { kind: "free" as const, position: [0, 0, 0] as const }, pressure: 0.5, width: 1, twist: 0 },
        { anchor: { kind: "free" as const, position: [0, 1, 0] as const }, pressure: 0.5, width: 1, twist: 0 },
      ],
    }] } };
    const seen: string[] = [];
    const hook = renderHook(({ document, h }) => {
      const state = useCharacterRenderExtras({ h, document }); seen.push(state.status); return state;
    }, { initialProps: { document: f.document, h: f.h } });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    seen.length = 0;
    hook.rerender({ document: strokeDocument, h: f.h });
    expect(seen[0]).toBe("building");
    const nextRoot = new Group();
    hook.rerender({ document: f.document, h: { ...f.h, vrm: { scene: nextRoot } } });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    await act(async () => { pending[0]?.(); });
    expect(f.root.children).toHaveLength(1);
    expect(nextRoot.children[0]?.children).toHaveLength(0);
    expect(hook.result.current.strokeCount).toBe(0);
    hook.unmount();
    expect(nextRoot.children).toHaveLength(0);
  });
});
