// @vitest-environment jsdom
import { useLayoutEffect, useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dProfessionalWorkspace } from "../bg3d/StudioBg3dProfessionalWorkspace";
import { useStudioBg3dCanonicalDocumentState } from "../bg3d/useStudioBg3dCanonicalDocumentState";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "../bg3d/studio-bg3d-scene-runtime";
import { createStudioBg3dHistorySnapshot } from "../bg3d/studio-bg3d-editor-derivations";
import {
  commitStudioBg3dHistoryTransition,
  type StudioBg3dHistoryCommandRefs,
} from "../bg3d/studio-bg3d-history-command-adapter";
import * as repositoryModule from "../studio-web-runtime/studio-web-authoring-project-v3-repository";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import type { StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";
import { createStudioScene3dCutBg3dHost } from "./studio-scene3d-cut-bg3d-host";

const memory = () => {
  const data = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
  const repository = new repositoryModule.StudioWebAuthoringProjectV3Repository(
    {
      storeFactory: async () => store,
      lockProvider: {
        request: async (_name, _options, operation) => operation(),
      },
    }
  );
  return { repository, data };
};
function initialDocument(): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    output: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
      exportAspectRatio: 1,
    },
  });
}
let currentHost: StudioScene3dCutBg3dEditorHost | null = null;
const appliedViews = vi.fn(() => true);
let history: StudioBg3dHistoryCommandRefs;
function Viewport({ h }: { readonly h: StudioScene3dCutBg3dEditorHost }) {
  return (
    <div data-testid="real-host-document">
      {JSON.stringify(h.sceneBaseDocument.camera.position)}
    </div>
  );
}
function Workspace() {
  const canonical = useStudioBg3dCanonicalDocumentState({
    initialDocument: initialDocument(),
  });
  const historyRef = useRef<StudioBg3dHistoryCommandRefs>({
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  });
  const hostRef = useRef<StudioScene3dCutBg3dEditorHost | null>(null);
  const pendingCamera = useRef<StudioBg3dSceneDocument["camera"] | null>(null);
  const viewportApi = useRef({ applyView: appliedViews });
  const modelRenderer = useRef({
    domElement: document.createElement("canvas"),
    isWebGPURenderer: true as const,
    hasFeature: () => false,
  });
  const storageIds = useRef(new Map<string, string>());
  const values: StudioScene3dCutBg3dEditorHost = {
    open: true,
    modelRenderer: modelRenderer.current,
    sharedStageSessionScopeKey: "project-a:page-1:bg-layer",
    ...canonical,
    storageModelIdByAttachmentIdRef: storageIds,
    pendingInitialCameraRef: pendingCamera,
    viewportApiRef: viewportApi,
    physicsRuntimeSourceRef: canonical.liveSceneRef,
    readCurrentCanonicalSceneForShot() {
      const live = canonical.liveSceneRef.current;
      const adapted = tryAdaptStudioBg3dRuntimeToDocument({
        primitives: live.primitives,
        customModels: live.customModels,
        attachmentByStorageModelId: new Map(),
        baseDocument: live.document,
      });
      return adapted.ok ? adapted.value.document : null;
    },
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      document,
      before,
      options
    ) {
      commitStudioBg3dHistoryTransition(historyRef.current, {
        before,
        after: createStudioBg3dHistorySnapshot({
          primitives,
          customModels,
          document,
        }),
        ...options,
      });
    },
    setLineArtPreview: () => undefined,
  };
  if (!hostRef.current) hostRef.current = values;
  else Object.assign(hostRef.current, values);
  useLayoutEffect(() => {
    currentHost = hostRef.current;
    history = historyRef.current;
  });
  return (
    <StudioBg3dProfessionalWorkspace
      outliner={<span>계층</span>}
      inspector={<span>속성</span>}
      viewport={<Viewport h={hostRef.current} />}
    />
  );
}
function host() {
  if (!currentHost) throw new Error("host missing");
  return currentHost;
}
function setCamera(x: number) {
  act(() => {
    const h = host();
    h.replaceCanonicalDocumentState({
      document: {
        ...h.sceneBaseDocument,
        camera: { ...h.sceneBaseDocument.camera, position: [x, 2, 5] },
      },
    });
  });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function createCut(name: string, camera: number) {
  setCamera(camera);
  fireEvent.change(screen.getByLabelText("컷 이름"), {
    target: { value: name },
  });
  click("현재 장면으로 컷 만들기");
  await screen.findByRole("button", { name: `${name} · 초안` });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  currentHost = null;
  appliedViews.mockClear();
});

describe("제품 전문가 작업공간의 컷 버전 통합", () => {
  it("3컷 생성→원본 변경→승인 컷 보존→선택 업데이트→repository 저장→재진입을 실제 패널과 canonical host로 실행한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    const rendered = render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    await createCut("첫 컷", 1);
    click("이 버전 승인");
    await createCut("둘째 컷", 2);
    await createCut("셋째 컷", 3);
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const before = [...data.values()][0];
    const beforeProject = JSON.parse(before);
    const original = beforeProject.shotVersions.cuts[0];
    setCamera(9);
    click("첫 컷 · 승인");
    click("현재 원본과 비교");
    expect(screen.getByText(/장면 원본 변경됨/u)).toBeDefined();
    click("둘째 컷 · 초안");
    click("현재 원본과 비교");
    click("선택한 원본만 업데이트");
    expect(
      screen.getByRole("button", { name: "둘째 컷 · 재검토 필요" })
    ).toBeDefined();
    click("첫 컷 · 승인");
    click("이 컷으로 복귀");
    await screen.findByText(/고정한 컷으로 돌아왔습니다/u);
    expect(host().sceneBaseDocument.camera.position).toEqual([1, 2, 5]);
    expect(host().sceneBaseDocument.pinnedVersionedCut?.status).toBe(
      "approved"
    );
    expect(appliedViews).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: [1, 2, 5] })
    );
    expect(
      history.historyCommandTimelineRef.current?.readSnapshot().history.at(-1)
        ?.commandId
    ).toBe("scene3d.cut.restore");
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const saved = JSON.parse([...data.values()][0]);
    expect(saved.shotVersions.cuts).toHaveLength(3);
    expect(saved.shotVersions.cuts[0]).toEqual(original);
    rendered.unmount();
    render(<Workspace />);
    await screen.findByText("저장한 컷과 원본을 복원했습니다.");
    expect(screen.getByRole("button", { name: "첫 컷 · 승인" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "둘째 컷 · 재검토 필요" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "셋째 컷 · 초안" })
    ).toBeDefined();
    expect(host().sceneBaseDocument.camera.position).toEqual([1, 2, 5]);
  });
  it("이름·복제·삭제·컷 history와 JSON 가져오기를 실제 패널에서 실행한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    await createCut("원본", 1);
    click("컷 복제");
    fireEvent.change(screen.getByLabelText("컷 이름"), {
      target: { value: "수정본" },
    });
    click("이름 변경");
    click("컷 삭제");
    expect(screen.queryByRole("button", { name: "수정본 · 초안" })).toBeNull();
    click("컷 실행 취소");
    expect(screen.getByRole("button", { name: "수정본 · 초안" })).toBeDefined();
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const raw = [...data.values()][0];
    click("컷 삭제");
    fireEvent.change(screen.getByLabelText("프로젝트 JSON"), {
      target: { value: raw },
    });
    click("JSON 가져오기");
    await screen.findByText(/JSON 백업을 가져왔습니다/u);
    expect(screen.getByRole("button", { name: "원본 · 초안" })).toBeDefined();
    expect(screen.getByRole("button", { name: "수정본 · 초안" })).toBeDefined();
  });
  it("복귀는 입력 잠금과 잘못된 프로젝트를 거부하며 history를 건드리지 않는다", async () => {
    const { repository } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const h = host();
    const adapter = createStudioScene3dCutBg3dHost(h);
    const source = adapter.readSource();
    Object.assign(h, { isCapturing: true });
    await expect(
      adapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/장면 복원/u);
    Object.assign(h, { isCapturing: false });
    for (const [key, value] of Object.entries({
      captureInFlightRef: { current: true },
      modelImportAbortRef: { current: new AbortController() },
      sceneRestoreAbortRef: { current: new AbortController() },
      destructiveMutationGuardRef: { current: { blocksClose: true } },
      placementSessionRef: { current: { phase: "preview" } },
      physicsPhaseRef: { current: "running" },
      physicsInteractionLocked: true,
      deletingModelId: "deleting-model",
    })) {
      Object.assign(h, { [key]: value });
      await expect(
        adapter.applySource(source, null, new AbortController().signal)
      ).rejects.toThrow(/장면 복원/u);
      Object.assign(h, { [key]: undefined });
    }
    const renderer = h.modelRenderer;
    Object.assign(h, { modelRenderer: undefined });
    await expect(
      adapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/렌더러 준비/u);
    Object.assign(h, { modelRenderer: renderer });
    await expect(
      adapter.applySource(
        { ...source, scene: { ...source.scene, documentId: "other" } },
        null,
        new AbortController().signal
      )
    ).rejects.toThrow(/다른 장면/u);
    expect(history.historyCommandTimelineRef.current).toBeNull();
  });
  it("다른 modal 세션의 완료를 차단하고 보류 카메라와 실제 적용 상태를 구분한다", async () => {
    const { repository } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const h = host();
    const sessionRef = { current: { id: "first" } };
    Object.assign(h, { modalAssetSessionRef: sessionRef });
    const staleAdapter = createStudioScene3dCutBg3dHost(h);
    const source = staleAdapter.readSource();
    sessionRef.current = { id: "second" };
    await expect(
      staleAdapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/세션이 바뀌어/u);
    expect(history.historyCommandTimelineRef.current).toBeNull();
    const adapter = createStudioScene3dCutBg3dHost(h);
    appliedViews.mockReturnValueOnce(false);
    await act(async () => {
      expect(
        await adapter.applySource(source, null, new AbortController().signal)
      ).toBe("deferred");
    });
    expect(h.pendingInitialCameraRef.current).toEqual(
      host().sceneBaseDocument.camera
    );
    const pending = host().pendingInitialCameraRef;
    pending.current = {
      ...host().sceneBaseDocument.camera,
      position: [99, 99, 99],
    };
    await act(async () => {
      expect(
        await adapter.applySource(source, null, new AbortController().signal)
      ).toBe("applied");
    });
    expect(pending.current).toBeNull();
  });
});
