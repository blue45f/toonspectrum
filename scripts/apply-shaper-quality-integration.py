#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:140]!r}")
    write(relative, source.replace(old, new, 1))


def replace_regex(relative: str, pattern: str, replacement: str) -> None:
    source = read(relative)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{relative}: regex expected one match, found {count}: {pattern[:140]!r}")
    write(relative, updated)


SCENE = "src/domains/creator/scene-3d/studio-mannequin-scene.ts"

replace_once(
    SCENE,
    '''import { solveStudioMannequinTwoBoneIk } from "./studio-mannequin-ik";''',
    '''import { solveStudioMannequinTwoBoneIk } from "./studio-mannequin-ik";
import {
  STUDIO_MANNEQUIN_SEMANTIC_PARTS,
  getStudioMannequinSemanticPartForJoint,
  partitionStudioMannequinSemanticLayers,
  type StudioMannequinSemanticRgbaLayer,
} from "./studio-mannequin-semantic-layers";''',
)

replace_once(
    SCENE,
    '''export interface StudioMannequinCaptureResult {
  readonly pngDataUrl: string;''',
    '''export interface StudioMannequinCaptureResult {
  readonly pngDataUrl: string;''',
)

replace_once(
    SCENE,
    '''}

/**
 * 캡처 래스터와 논리 뷰 크기로 삽입 결과를 만든다''',
    '''}

export interface StudioMannequinSemanticCaptureResult {
  readonly width: number;
  readonly height: number;
  readonly composite: Uint8ClampedArray;
  readonly layers: readonly StudioMannequinSemanticRgbaLayer[];
  readonly scaleWasReduced: boolean;
}

/**
 * 캡처 래스터와 논리 뷰 크기로 삽입 결과를 만든다''',
)

replace_once(
    SCENE,
    '''  captureDataUrl(
    scale: number,
    options?: { signal?: AbortSignal },
  ): Promise<StudioMannequinCaptureResult>;
  dispose(): void;''',
    '''  captureDataUrl(
    scale: number,
    options?: { signal?: AbortSignal },
  ): Promise<StudioMannequinCaptureResult>;
  captureSemanticLayers(
    scale: number,
    options?: { signal?: AbortSignal },
  ): Promise<StudioMannequinSemanticCaptureResult>;
  dispose(): void;''',
)

replace_once(
    SCENE,
    '''const MIN_CAPTURE_SCALE = 0.5;
const MAX_CAPTURE_SCALE = 4;
const CAPTURE_PNG_TIMEOUT_MS = 20_000;''',
    '''const MIN_CAPTURE_SCALE = 0.5;
const MAX_CAPTURE_SCALE = 4;
const CAPTURE_PNG_TIMEOUT_MS = 20_000;
// Six editable body layers plus composite and ID pass stay below a predictable memory ceiling.
const STUDIO_MANNEQUIN_SEMANTIC_CAPTURE_MAX_PIXELS = 2_359_296;''',
)

replace_once(
    SCENE,
    '''  const handleGeometry = new THREE.SphereGeometry(1, 12, 10);

  const mannequinRoot = new THREE.Group();''',
    '''  const handleGeometry = new THREE.SphereGeometry(1, 12, 10);
  const semanticIdMaterials = new Map(
    STUDIO_MANNEQUIN_SEMANTIC_PARTS.map((part) => {
      const [red, green, blue] = part.rgb;
      const color = (red << 16) | (green << 8) | blue;
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      return [part.id, material] as const;
    }),
  );

  const mannequinRoot = new THREE.Group();''',
)

replace_once(
    SCENE,
    '''  function clampCaptureDimensions(scale: number): { width: number; height: number } {
    const safeScale = Math.min(MAX_CAPTURE_SCALE, Math.max(MIN_CAPTURE_SCALE, scale));
    const pixelRatio = renderer.getPixelRatio();
    let width = Math.max(1, Math.round(viewWidth * pixelRatio * safeScale));
    let height = Math.max(1, Math.round(viewHeight * pixelRatio * safeScale));
    if (width * height > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
      const shrink = Math.sqrt(STUDIO_BG3D_LT_RENDER_MAX_PIXELS / (width * height));''',
    '''  function clampCaptureDimensions(
    scale: number,
    maxPixels = STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
  ): { width: number; height: number; scaleWasReduced: boolean } {
    const safeScale = Math.min(MAX_CAPTURE_SCALE, Math.max(MIN_CAPTURE_SCALE, scale));
    const pixelRatio = renderer.getPixelRatio();
    let width = Math.max(1, Math.round(viewWidth * pixelRatio * safeScale));
    let height = Math.max(1, Math.round(viewHeight * pixelRatio * safeScale));
    const requestedPixels = width * height;
    if (requestedPixels > maxPixels) {
      const shrink = Math.sqrt(maxPixels / requestedPixels);''',
)
replace_once(
    SCENE,
    '''    return { width, height };
  }

  async function captureDataUrl(''',
    '''    return { width, height, scaleWasReduced: width * height < requestedPixels };
  }

  function throwIfCaptureAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw new DOMException("3D 데생 인형 캡처를 취소했습니다.", "AbortError");
  }

  function prepareCaptureGraph(): StudioMannequinJointId | null {
    const previousSelection = selectedJointId;
    selectedJointId = null;
    applySelectionTint();
    helpers.visible = false;
    for (const handle of effectorHandles) handle.visible = false;
    return previousSelection;
  }

  function restoreCaptureGraph(previousSelection: StudioMannequinJointId | null): void {
    helpers.visible = true;
    for (const handle of effectorHandles) handle.visible = true;
    selectedJointId = previousSelection;
    applySelectionTint();
    invalidate();
  }

  async function captureDataUrl(''',
)

replace_once(
    SCENE,
    '''    const { width, height } = clampCaptureDimensions(scale);''',
    '''    const { width, height } = clampCaptureDimensions(scale);''',
)

replace_once(
    SCENE,
    '''    // 헬퍼(그리드·IK 핸들)와 선택 틴트는 참고용 이미지에 굽지 않는다.
    const previousSelection = selectedJointId;
    selectedJointId = null;
    applySelectionTint();
    helpers.visible = false;
    for (const handle of effectorHandles) handle.visible = false;
    let rgba: Uint8ClampedArray;
    try {
      rgba = captureStudioVrmRgba(renderer, scene, activeCamera, { width, height });
    } finally {
      helpers.visible = true;
      for (const handle of effectorHandles) handle.visible = true;
      selectedJointId = previousSelection;
      applySelectionTint();
      invalidate();
    }''',
    '''    // 헬퍼(그리드·IK 핸들)와 선택 틴트는 참고용 이미지에 굽지 않는다.
    const previousSelection = prepareCaptureGraph();
    let rgba: Uint8ClampedArray;
    try {
      throwIfCaptureAborted(captureOptions.signal);
      rgba = captureStudioVrmRgba(renderer, scene, activeCamera, { width, height });
    } finally {
      restoreCaptureGraph(previousSelection);
    }''',
)

replace_once(
    SCENE,
    '''  // ── 핸들 구성 ────────────────────────────────────────────────────────────

  rebuildMannequin();''',
    '''  async function captureSemanticLayers(
    scale: number,
    captureOptions: { signal?: AbortSignal } = {},
  ): Promise<StudioMannequinSemanticCaptureResult> {
    if (disposed) throw new Error("이미 정리된 3D 데생 인형 씬입니다.");
    const { width, height, scaleWasReduced } = clampCaptureDimensions(
      scale,
      STUDIO_MANNEQUIN_SEMANTIC_CAPTURE_MAX_PIXELS,
    );
    const previousSelection = prepareCaptureGraph();
    let composite: Uint8ClampedArray;
    let idPass: Uint8ClampedArray;
    try {
      throwIfCaptureAborted(captureOptions.signal);
      composite = captureStudioVrmRgba(renderer, scene, activeCamera, { width, height });
      throwIfCaptureAborted(captureOptions.signal);
      for (const mesh of bodyMeshes) {
        const jointId = (mesh.userData as BodyMeshUserData).studioMannequinJointId;
        const partId = getStudioMannequinSemanticPartForJoint(jointId);
        const idMaterial = semanticIdMaterials.get(partId);
        if (idMaterial) mesh.material = idMaterial;
      }
      idPass = captureStudioVrmRgba(renderer, scene, activeCamera, { width, height });
      throwIfCaptureAborted(captureOptions.signal);
    } finally {
      restoreCaptureGraph(previousSelection);
    }
    const layers = partitionStudioMannequinSemanticLayers({
      width,
      height,
      composite,
      idPass,
    });
    return Object.freeze({
      width,
      height,
      composite,
      layers,
      scaleWasReduced,
    });
  }

  // ── 핸들 구성 ────────────────────────────────────────────────────────────

  rebuildMannequin();''',
)

replace_once(
    SCENE,
    '''    invalidate,
    captureDataUrl,
    dispose() {''',
    '''    invalidate,
    captureDataUrl,
    captureSemanticLayers,
    dispose() {''',
)

replace_once(
    SCENE,
    '''      handleMaterial.dispose();
      gradientMap.dispose();''',
    '''      handleMaterial.dispose();
      for (const material of semanticIdMaterials.values()) material.dispose();
      semanticIdMaterials.clear();
      gradientMap.dispose();''',
)

PANEL = "src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx"

replace_once(
    PANEL,
    '''import {
  buildShaperLayeredPsd,
  type ShaperPresetSelection,
} from "./studio-shaper-model";''',
    '''import {
  DEFAULT_SHAPER_SELECTION,
  applyShaperSelectionToBodyParams,
  buildShaperLayeredPsd,
  createShaperLineArtFromComposite,
  type ShaperPresetSelection,
} from "./studio-shaper-model";''',
)

replace_once(
    PANEL,
    '''  { id: "shaper", label: "셰이퍼", icon: <Wand2 size={13} aria-hidden /> },''',
    '''  { id: "shaper", label: "워크숍", icon: <Wand2 size={13} aria-hidden /> },''',
)

replace_once(
    PANEL,
    '''  const [params, setParams] = useState<StudioMannequinBodyParams>(
    STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  );
  const [pose, setPose] = useState<StudioMannequinPose>(createStudioMannequinRestPose);''',
    '''  const [params, setParams] = useState<StudioMannequinBodyParams>(
    STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  );
  const [shaperSelection, setShaperSelection] = useState<ShaperPresetSelection>(() => ({
    ...DEFAULT_SHAPER_SELECTION,
  }));
  const [pose, setPose] = useState<StudioMannequinPose>(createStudioMannequinRestPose);''',
)

replace_regex(
    PANEL,
    r'''  const handleShaperSelectionChange = useCallback\(\(sel: ShaperPresetSelection\) => \{[\s\S]*?  \}, \[applyPosePreset, commitParams, params\]\);''',
    '''  const handleShaperSelectionChange = useCallback((selection: ShaperPresetSelection) => {
    setShaperSelection({ ...selection });
    commitParams(applyShaperSelectionToBodyParams(stateRef.current.params, selection));

    if (selection.bodypose === "pose-run") {
      applyPosePreset("dash");
    } else if (selection.bodypose === "pose-sit") {
      applyPosePreset("sit-chair");
    } else if (selection.bodypose === "pose-hip") {
      applyPosePreset("cross-arms");
    } else if (selection.bodypose === "pose-sword") {
      applyPosePreset("sword-ready");
    } else if (selection.bodypose === "pose-stand") {
      applyPosePreset("neutral");
    }

    if (selection.handpose) applyPosePreset(selection.handpose);
  }, [applyPosePreset, commitParams]);''',
)

replace_regex(
    PANEL,
    r'''  const handleExportPsdFromScene = useCallback\(async \(\) => \{[\s\S]*?  \}, \[\]\);\n\n  const handleCapture''',
    '''  const handleExportPsdFromScene = useCallback(async () => {
    const handle = sceneRef.current;
    if (!handle) return;
    try {
      setCapturing(true);
      setError(null);
      const capture = await handle.captureSemanticLayers(Math.min(2, captureScale));
      const lineArt = createShaperLineArtFromComposite(
        capture.composite,
        capture.width,
        capture.height,
      );
      const psdBlob = buildShaperLayeredPsd({
        width: capture.width,
        height: capture.height,
        flatColor: capture.composite,
        semanticLayers: capture.layers
          .filter((layer) => layer.visiblePixelCount > 0)
          .map((layer) => ({ id: layer.id, name: layer.name, data: layer.data })),
        lineArt,
      });

      const url = URL.createObjectURL(psdBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `toonstudio-character-parts-${Date.now()}.psd`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (capture.scaleWasReduced) {
        setError("PSD 메모리 예산을 지키기 위해 출력 크기를 안전하게 줄였습니다.");
      }
    } catch (cause) {
      setError(getErrorText(cause, "부위 레이어 PSD 내보내기를 실패했습니다."));
      throw cause;
    } finally {
      setCapturing(false);
    }
  }, [captureScale]);

  const handleCapture''',
)

replace_once(
    PANEL,
    '''      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">''',
    '''      <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">''',
)

replace_once(
    PANEL,
    '''          <aside className="flex min-h-0 w-full flex-col border-t border-line/70 md:w-[320px] md:border-l md:border-t-0">''',
    '''          <aside className="flex min-h-0 w-full flex-col border-t border-line/70 md:w-[400px] md:border-l md:border-t-0 xl:w-[440px]">''',
)

replace_once(
    PANEL,
    '''                <StudioShaperPanel
                  onSelectionChange={handleShaperSelectionChange}
                  onExportPsd={handleExportPsdFromScene}
                  onTriggerPoseScanner={() => setTab("pose")}
                  onInsertCanvas={handleCapture}
                />''',
    '''                <StudioShaperPanel
                  selection={shaperSelection}
                  bodyParams={params}
                  disabled={capturing || persistenceStatus === "loading"}
                  onSelectionChange={handleShaperSelectionChange}
                  onBodyParamsChange={commitParams}
                  onExportPsd={handleExportPsdFromScene}
                  onTriggerPoseScanner={() => setTab("pose")}
                  onNavigateToTab={setTab}
                  onInsertCanvas={handleCapture}
                />''',
)

TEST = "src/domains/creator/scene-3d/StudioMannequinPoserPanel.test.tsx"

replace_once(
    TEST,
    '''  captureDataUrl: vi.fn(async () => ({
    pngDataUrl: "data:image/png;base64,AAAA",
    width: 640,
    height: 480,
    // 래스터는 dpr×배율 슈퍼샘플 — 논리 뷰 크기가 함께 전달돼야 캔버스에 논리 크기로 삽입된다.
    displayWidth: 320,
    displayHeight: 240,
  })),
  dispose: vi.fn(),''',
    '''  captureDataUrl: vi.fn(async () => ({
    pngDataUrl: "data:image/png;base64,AAAA",
    width: 640,
    height: 480,
    // 래스터는 dpr×배율 슈퍼샘플 — 논리 뷰 크기가 함께 전달돼야 캔버스에 논리 크기로 삽입된다.
    displayWidth: 320,
    displayHeight: 240,
  })),
  captureSemanticLayers: vi.fn(async () => {
    const width = 2;
    const height = 2;
    const composite = new Uint8ClampedArray(width * height * 4).fill(180);
    composite[3] = 255;
    composite[7] = 255;
    composite[11] = 255;
    composite[15] = 255;
    return {
      width,
      height,
      composite,
      layers: [
        { id: "head" as const, name: "머리·목", data: composite.slice(), visiblePixelCount: 4 },
      ],
      scaleWasReduced: false,
    };
  }),
  dispose: vi.fn(),''',
)

replace_once(
    TEST,
    '''    for (const label of ["셰이퍼", "체형", "포즈", "관절", "카메라"]) {''',
    '''    for (const label of ["워크숍", "체형", "포즈", "관절", "카메라"]) {''',
)

replace_regex(
    TEST,
    r'''  it\("셰이퍼 탭을 클릭하면 Shaper 패널이 렌더링되고 프리셋 선택이 씬에 반영된다", async \(\) => \{[\s\S]*?  \}\);\n''',
    '''  it("워크숍 탭은 실제 적용 슬롯만 활성화하고 체형을 같은 플래너로 반영한다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^워크숍/ }));

    expect(screen.getByText("캐릭터 워크숍")).toBeTruthy();
    expect(screen.getByText("6/14 슬롯 적용")).toBeTruthy();
    const hair = screen.getByRole("button", { name: /헤어/ });
    expect(hair.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /판타지 액션/ }));
    await waitFor(() => {
      expect(sceneHandle.setBodySpec).toHaveBeenCalled();
      expect(sceneHandle.setPose).toHaveBeenCalled();
    });
  });

  it("워크숍 PSD 출력은 scene 의미 레이어 캡처를 사용한다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^워크숍/ }));
    fireEvent.click(screen.getByRole("tab", { name: "출력" }));
    fireEvent.click(screen.getByRole("button", { name: "부위 레이어 PSD 내려받기" }));

    await waitFor(() => expect(sceneHandle.captureSemanticLayers).toHaveBeenCalledTimes(1));
    expect(sceneHandle.captureDataUrl).not.toHaveBeenCalled();
  });
''',
)

# Existing test setup resets every scene mock. The new semantic capture needs the same treatment.
replace_once(
    TEST,
    '''    vi.mocked(sceneHandle.captureDataUrl).mockClear();''',
    '''    vi.mocked(sceneHandle.captureDataUrl).mockClear();
    vi.mocked(sceneHandle.captureSemanticLayers).mockClear();''',
)

print("Applied latest-main character workshop integration and semantic PSD wiring.")
