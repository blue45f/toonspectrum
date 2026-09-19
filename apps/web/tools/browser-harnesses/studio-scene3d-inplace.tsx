
import "../../src/styles/globals.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";

import { resolveStudioBg3dDeviceQuality } from "../../src/domains/creator/bg3d/studio-bg3d-device-quality";
import { createStudioBg3dHistorySnapshot } from "../../src/domains/creator/bg3d/studio-bg3d-editor-derivations";
import {
  commitStudioBg3dHistoryTransition,
  stepStudioBg3dCommandHistory,
} from "../../src/domains/creator/bg3d/studio-bg3d-history-command-adapter";
import { studioBg3dModalOperationCoordinator } from "../../src/domains/creator/bg3d/studio-bg3d-modal-operation-coordinator";
import { loadStudioBg3dModelLibraryModule } from "../../src/domains/creator/bg3d/studio-bg3d-model-library-loader";
import { admitAndCacheStudioBg3dModel } from "../../src/domains/creator/bg3d/studio-bg3d-model-runtime-admission";
import {
  createDefaultStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
} from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import {
  tryAdaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "../../src/domains/creator/bg3d/studio-bg3d-scene-runtime";
import { useStudioBg3dCanonicalDocumentState } from "../../src/domains/creator/bg3d/useStudioBg3dCanonicalDocumentState";
import { useStudioBg3dInplaceTools } from "../../src/domains/creator/bg3d/useStudioBg3dInplaceTools";
import { createSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-fixtures";
import { createTexturedSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-texture-fixtures";
import { StudioScene3dAssetToolsPanel } from "../../src/domains/creator/scene3d/specialists/StudioScene3dAssetToolsPanel";

import type { StudioBg3dHistoryCommandRefs } from "../../src/domains/creator/bg3d/studio-bg3d-history-command-adapter";
import type { StudioBg3dModelRootCacheEntry } from "../../src/domains/creator/bg3d/studio-bg3d-model-runtime-admission";
import type { StudioBg3dModelAttachment } from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import type { BgCustomModelInstance } from "../../src/domains/creator/studio-background-3d-model";

declare global {
  interface Window {
    __scene3dInplace?: {
      check(): unknown;
      reopen(serialized: string): Promise<unknown>;
    };
    __scene3dInplaceError?: string;
    __scene3dInplaceStage?: string;
  }
}
function assert(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(detail);
}
const documentValue = createDefaultStudioBg3dSceneDocument();
const quality = resolveStudioBg3dDeviceQuality({
  document: documentValue,
  mode: "edit",
  preference: "desktop",
  signals: {
    cssWidth: 800,
    cssHeight: 600,
    devicePixelRatio: 1,
    pointer: "fine",
    saveData: false,
    deviceMemoryGb: 16,
    hardwareConcurrency: 8,
  },
});

async function mount() {
  window.__scene3dInplaceStage = "module-ready";
  const textured = new URL(location.href).searchParams.get("operation") === "release";
  // Redirect only the processing Worker to the built artifact; storage/validator use real product workers.
  const workerPath = new URL(location.href).searchParams.get("worker");
  if (workerPath) {
    assert(
      /^\/assets\/specialist\.worker-[a-zA-Z0-9_-]+\.js$/.test(workerPath),
      "Invalid built worker.",
    );
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(
          String(url).includes("/specialist.worker.ts") ? workerPath! : url,
          options,
        );
      }
    };
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(560, 300);
  renderer.setClearColor(0x253040);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 560 / 300, 0.01, 100);
  camera.position.set(5, 4, 9);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 3));
  const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(4, 6, 6); scene.add(key);
  const host = document.createElement("main");
  host.style.cssText = "max-width:680px;margin:16px auto";
  document.body.append(host);
  const viewport = document.createElement("div");
  viewport.append(renderer.domElement);
  host.append(viewport);
  const ui = document.createElement("div");
  host.append(ui);
  const cache = new Map<string, StudioBg3dModelRootCacheEntry>();
  const attachments = new Map<string, StudioBg3dModelAttachment>();
  const storageIds = new Map<string, string>();
  window.__scene3dInplaceStage = "opening-library";
  const library = await loadStudioBg3dModelLibraryModule();
  window.__scene3dInplaceStage = "importing-source";
  const [record] = await library.importVerifiedBg3dModelsAtomicallyV12(
    [
      {
        file: new File(
          [await (textured ? createTexturedSpecialistFixture(true) : createSpecialistFixture("sphere"))],
          "source-sphere.glb",
          { type: "model/gltf-binary" },
        ),
        rights: {
          status: "public-domain",
          commercialUse: true,
          licenseName: "CC0-1.0",
        },
      },
    ],
    { executionBackend: "worker" },
  );
  assert(record, "Actual source import failed.");
  const attachment = library.createStudioBg3dModelAttachment(record);
  attachments.set(record.id, attachment);
  storageIds.set(attachment.id, record.id);
  window.__scene3dInplaceStage = "admitting-source";
  const sourceEntry = await admitAndCacheStudioBg3dModel({
    record,
    document: documentValue,
    quality,
    cumulativeUsedBytes: 0,
    renderer,
    cache,
    pending: new Map(),
    isActive: () => true,
  });
  const session = studioBg3dModalOperationCoordinator.beginSession();
  const model: BgCustomModelInstance = {
    id: "selected-model",
    modelId: record.id,
    name: "선택한 구형 모델",
    position: [-2, 0, 0],
    rotation: [0, 0.2, 0],
    scale: [1, 1, 1],
    parentId: null,
  };
  const originals = [
    model,
    {
      ...model,
      id: "shared-model",
      name: "공유 원본",
      position: [2, 0, 0] as [number, number, number],
    },
  ];
  let group = new THREE.Group();
  scene.add(group);
  function draw(models: readonly BgCustomModelInstance[]) {
    scene.remove(group);
    group.clear();
    group = new THREE.Group();
    scene.add(group);
    for (const item of models) {
      const root = cache.get(item.modelId)?.root;
      assert(root, "Missing real model cache.");
      const parent = new THREE.Group();
      parent.position.set(...item.position);
      parent.rotation.set(...item.rotation);
      parent.scale.set(...item.scale);
      parent.add(root.clone(true));
      group.add(parent);
    }
    renderer.render(scene, camera);
  }
  function App() {
    const state = useStudioBg3dCanonicalDocumentState({
      initialDocument: documentValue,
    });
    const history = useRef<StudioBg3dHistoryCommandRefs>({
      historyRef: { current: [] },
      historyIndexRef: { current: -1 },
      historyCommandTimelineRef: { current: null },
    });
    const [tick, setTick] = useState(0);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      state.replaceCanonicalDocumentState({ customModels: originals });
      setLoaded(true);
    }, []);
    const bridge = useStudioBg3dInplaceTools({
      live: state.liveSceneRef,
      selectedIds: new Set([model.id]),
      session,
      ready: loaded,
      renderer,
      quality,
      cache,
      attachments,
      storageIds,
      isSessionCurrent: (value) =>
        studioBg3dModalOperationCoordinator.isCurrent(value),
      isBlocked: () => false,
      replace: state.replaceCanonicalDocumentState,
      commitHistory: (primitives, customModels, document, before, options) => {
        commitStudioBg3dHistoryTransition(history.current, {
          before,
          after: createStudioBg3dHistorySnapshot({
            primitives,
            customModels,
            document,
          }),
          ...options,
        });
      },
      notify: () => setTick((value) => value + 1),
    });
    useEffect(() => {
      if (loaded) draw(state.customModels);
    }, [state.customModels, loaded, tick]);
    useEffect(() => {
      if (!loaded) return;
      window.__scene3dInplace = {
        check() {
          const live = state.liveSceneRef.current;
          const selected = live.customModels[0]!;
          const shared = live.customModels[1]!;
          assert(
            selected.modelId !== record.id,
            "Selected model was not replaced.",
          );
          assert(
            shared.modelId === record.id,
            "Shared unselected instance changed.",
          );
          const derived = cache.get(selected.modelId)!;
          const compressedTextures = new Set<THREE.Texture>();
          derived.root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
              for (const value of Object.values(material)) if (value && typeof value === "object" && (value as THREE.CompressedTexture).isCompressedTexture) compressedTextures.add(value as THREE.Texture);
            }
          });
          if (textured) assert(compressedTextures.size >= 2, "KTX2 color/normal textures did not reach the actual renderer.");
          assert(
            derived.metrics.triangles < sourceEntry.metrics.triangles,
            "Actual displayed derivative did not reduce triangles.",
          );
          assert(
            Math.abs(
              selected.scale[0] * derived.root.scale.x -
                sourceEntry.root.scale.x,
            ) < 1e-7,
            "Normalization changed world scale.",
          );
          assert(
            JSON.stringify(selected.position) ===
              JSON.stringify(model.position),
            "Position changed.",
          );
          const saved = tryAdaptStudioBg3dRuntimeToDocument({
            primitives: live.primitives,
            customModels: live.customModels,
            attachmentByStorageModelId: attachments,
            baseDocument: live.document,
          });
          assert(
            saved.ok && saved.value.diagnostics.length === 0,
            "Canonical save lost data.",
          );
          assert(
            !saved.value.serialized.includes(record.id) &&
              !saved.value.serialized.includes(derived.record.id),
            "Private storage IDs leaked into document.",
          );
          const beforeCount =
            history.current.historyCommandTimelineRef.current!.readRetainedStates()
              .states.length;
          assert(
            beforeCount === 2,
            "Apply was not exactly one history command.",
          );
          const undo = stepStudioBg3dCommandHistory(history.current, "undo");
          assert(
            undo?.state.customModels[0]?.modelId === record.id,
            "Undo failed.",
          );
          state.replaceCanonicalDocumentState(undo!.state);
          const redo = stepStudioBg3dCommandHistory(history.current, "redo");
          assert(
            redo?.state.customModels[0]?.modelId === derived.record.id,
            "Redo failed.",
          );
          state.replaceCanonicalDocumentState(redo!.state);
          return {
            status: "ok",
            serialized: saved.value.serialized,
            sourceHash: record.contentHash,
            derivativeHash: derived.record.contentHash,
            compressedTextureCount: compressedTextures.size,
            operation: textured ? "release" : "lod",
            sourceTriangles: sourceEntry.metrics.triangles,
            derivativeTriangles: derived.metrics.triangles,
            undo: true,
            redo: true,
            sharedInstancePreserved: true,
            normalizationPreserved: true,
            storage: "actual SQLite Worker + native OPFS CAS",
            historyCommands: beforeCount - 1,
          };
        },
        async reopen(serialized) {
          const document = parseStudioBg3dSceneDocument(serialized);
          assert(document, "Saved document did not parse.");
          const bindings = new Map<string, string>();
          for (const item of document.attachments) {
            const stored = await library.getStoredBg3dModelByHashV12(item.hash);
            assert(
              stored && stored.contentHash === item.hash,
              "Missing durable source/derivative bytes after page reload.",
            );
            bindings.set(item.id, stored.id);
            attachments.set(stored.id, item);
            storageIds.set(item.id, stored.id);
            await admitAndCacheStudioBg3dModel({
              record: stored,
              document,
              quality,
              cumulativeUsedBytes: 0,
              renderer,
              cache,
              pending: new Map(),
              isActive: () => true,
            });
          }
          const hydrated = hydrateStudioBg3dDocumentToRuntime({
            document,
            storageModelIdByAttachmentId: bindings,
          });
          assert(
            hydrated.ok && hydrated.diagnostics.length === 0,
            "Hydrated scene differs after page reload.",
          );
          assert(
            hydrated.customModels.length === 2,
            "Lost scene instances on reopen.",
          );
          state.replaceCanonicalDocumentState({
            primitives: hydrated.primitives,
            customModels: hydrated.customModels,
            document,
          });
          draw(hydrated.customModels);
          return {
            status: "ok",
            reopenedModels: hydrated.customModels.length,
            sourceStillPresent: Boolean(
              await library.getStoredBg3dModelByHashV12(record.contentHash),
            ),
            storage: "native OPFS",
          };
        },
      };
    }, [loaded]);
    return (
      <>
        <h1 className="text-lg font-bold">장면 내 3D 가공 검증</h1>
        <p role="status">{loaded ? "선택 모델 준비 완료" : "준비 중"}</p>
        <StudioScene3dAssetToolsPanel
          inplaceTools={bridge}
          disabled={!loaded}
        />
      </>
    );
  }
  window.__scene3dInplaceStage = "mounting-panel";
  createRoot(ui).render(<App />);
}
void mount().catch((error: unknown) => {
  window.__scene3dInplaceError =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
});
