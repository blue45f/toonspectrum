// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  type StudioEditableMesh,
} from "./studio-editable-half-edge-mesh";
import {
  deriveStudioHybridDccAssetLayout,
  STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS,
} from "./studio-hybrid-dcc-asset-layout";
import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { resolveStudioHybridDccScreenComponentCandidate } from "./studio-hybrid-dcc-screen-selection";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceSetAssetVisibility,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  StudioHybridDccViewport,
} from "./StudioHybridDccViewport";

import type { ReactNode } from "react";

const fiberHarness = vi.hoisted(() => ({
  canvasProps: null as Record<string, unknown> | null,
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: (props: Record<string, unknown> & { readonly children?: ReactNode }) => {
    fiberHarness.canvasProps = props;
    return (
      <button
        type="button"
        data-testid="r3f-canvas"
        aria-label={String(props["aria-label"])}
        onClick={() => (props.onPointerMissed as (() => void) | undefined)?.()}
      />
    );
  },
  useThree: vi.fn(),
}));

vi.mock("@react-three/drei/core/ContactShadows.js", () => ({ ContactShadows: () => null }));
vi.mock("@react-three/drei/core/OrbitControls.js", () => ({ OrbitControls: () => null }));
vi.mock("@react-three/drei/core/OrthographicCamera.js", () => ({ OrthographicCamera: () => null }));
vi.mock("@react-three/drei/core/PerformanceMonitor.js", () => ({ PerformanceMonitor: () => null }));
vi.mock("@react-three/drei/core/PerspectiveCamera.js", () => ({ PerspectiveCamera: () => null }));
vi.mock("@react-three/drei/core/TransformControls.js", () => ({ TransformControls: () => null }));

const VIEWPORT_SOURCE = readFileSync(
  resolve(import.meta.dirname, "./StudioHybridDccViewport.tsx"),
  "utf8",
);

function workspaceWithMesh(
  mesh: StudioEditableMesh,
  assetId = "mesh",
): StudioHybridDccWorkspace {
  return workspaceWithMeshes([{ assetId, mesh }]);
}

function workspaceWithMeshes(
  assets: readonly { readonly assetId: string; readonly mesh: StudioEditableMesh }[],
): StudioHybridDccWorkspace {
  if (assets.length === 0) throw new Error("test workspace needs at least one mesh");
  const workspace = createStudioHybridDccWorkspace(`viewport-${assets[0]!.assetId}`);
  let session = workspace.session;
  for (const asset of assets) {
    session = hybridDccRegisterAsset(session, asset.assetId, asset.mesh, {
      source: "primitive",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  }
  return { ...workspace, session, activeAssetId: assets.at(-1)!.assetId };
}

function createDisconnectedRegularPolygonMesh(
  faceCount: number,
  cornersPerFace: number,
): StudioEditableMesh {
  const positions: Array<{ readonly x: number; readonly y: number; readonly z: number }> = [];
  const faces: number[][] = [];
  const columns = Math.ceil(Math.sqrt(faceCount));
  for (let face = 0; face < faceCount; face += 1) {
    const centerX = (face % columns) * 1.25;
    const centerZ = Math.floor(face / columns) * 1.25;
    const loop: number[] = [];
    for (let corner = 0; corner < cornersPerFace; corner += 1) {
      const angle = corner / cornersPerFace * Math.PI * 2;
      loop.push(positions.length);
      positions.push({
        x: centerX + Math.cos(angle) * 0.48,
        y: 0,
        z: centerZ + Math.sin(angle) * 0.48,
      });
    }
    faces.push(loop);
  }
  return createStudioEditableMeshFromPolygons(positions, faces);
}

afterEach(() => {
  cleanup();
  fiberHarness.canvasProps = null;
  vi.restoreAllMocks();
});

describe("StudioHybridDccViewport", () => {
  it("uses a screen-pixel radius for point and edge refinement instead of arbitrary face picks", () => {
    const mesh = createStudioEditableMeshFromPolygons(
      [
        { x: -1, y: -1, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [[0, 1, 2]],
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const vertexNdc = new THREE.Vector3(-1, -1, 0).project(camera);
    const edgeMidpointNdc = new THREE.Vector3(0, -1, 0).project(camera);
    const candidates = {
      vertexIds: [0, 1, 2],
      edges: [{ id: 7, vertexIds: [0, 1] as const }],
    };

    expect(resolveStudioHybridDccScreenComponentCandidate(
      mesh,
      "vertex",
      candidates,
      new THREE.Vector2(vertexNdc.x, vertexNdc.y),
      camera,
      new THREE.Matrix4(),
      { width: 1_000, height: 1_000 },
      8,
    )).toBe(0);
    expect(resolveStudioHybridDccScreenComponentCandidate(
      mesh,
      "edge",
      candidates,
      new THREE.Vector2(edgeMidpointNdc.x, edgeMidpointNdc.y),
      camera,
      new THREE.Matrix4(),
      { width: 1_000, height: 1_000 },
      8,
    )).toBe(7);
    expect(resolveStudioHybridDccScreenComponentCandidate(
      mesh,
      "vertex",
      candidates,
      new THREE.Vector2(0, 0),
      camera,
      new THREE.Matrix4(),
      { width: 1_000, height: 1_000 },
      8,
    )).toBeNull();
  });

  it("shows an authority-safe empty state without starting WebGL", () => {
    render(
      <StudioHybridDccViewport
        workspace={createStudioHybridDccWorkspace("empty-viewport")}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );

    expect(screen.getByText("3D 작업대가 비어 있습니다.")).toBeTruthy();
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트").className).toContain("min-h-80");
  });

  it("renders real authority mesh stats and forwards asset/background selection", () => {
    const onSelectAsset = vi.fn();
    let workspace = createStudioHybridDccWorkspace("cube-viewport");
    workspace = workspaceAddUnitCube(workspace, "hero-cube");
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={onSelectAsset}
        webglAvailable
      />,
    );

    expect(screen.getByTestId("r3f-canvas")).toBeTruthy();
    expect(screen.getByText("V 8 · △ 12")).toBeTruthy();
    const assetButton = screen.getByText("hero-cube").closest("button");
    expect(assetButton?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(assetButton!);
    expect(onSelectAsset).toHaveBeenLastCalledWith("hero-cube");
    fireEvent.click(screen.getByTestId("r3f-canvas"));
    expect(onSelectAsset).toHaveBeenLastCalledWith(null);
  });

  it("honors bridge visibility without deleting the canonical object", () => {
    let workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("hidden-viewport"),
      "hidden-cube",
    );
    workspace = workspaceSetAssetVisibility(workspace, "hidden-cube", false);
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );

    expect(workspace.session.state.geometry.records["hidden-cube"]).toBeTruthy();
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(screen.getByText("3D 작업대가 비어 있습니다.")).toBeTruthy();
  });

  it("supports controlled-quality projection and overlay controls with touch-sized targets", () => {
    const onProjectionChange = vi.fn();
    const onOverlayChange = vi.fn();
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("controls-viewport"),
      "controls-cube",
    );
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        onProjectionChange={onProjectionChange}
        onOverlayChange={onOverlayChange}
        webglAvailable
      />,
    );

    const root = screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트");
    const orthographic = screen.getByRole("button", { name: "직교 투영" });
    const wireframe = screen.getByRole("button", { name: "와이어 표현" });
    expect(orthographic.className).toContain("min-h-11");
    expect(orthographic.className).toContain("min-w-11");
    expect(orthographic.className).toContain("shrink-0");
    fireEvent.click(orthographic);
    expect(root.getAttribute("data-projection")).toBe("orthographic");
    expect(onProjectionChange).toHaveBeenLastCalledWith("orthographic");
    fireEvent.click(wireframe);
    expect(root.getAttribute("data-overlay")).toBe("wireframe");
    expect(onOverlayChange).toHaveBeenLastCalledWith("wireframe");
  });

  it("exposes professional object gizmo modes and local/world space only at a commit boundary", () => {
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("gizmo-viewport"),
      "gizmo-cube",
    );
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        onCommitAssetTransform={vi.fn()}
        webglAvailable
      />,
    );

    const root = screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트");
    fireEvent.click(screen.getByRole("button", { name: "회전 도구 (R)" }));
    expect(root.getAttribute("data-transform-mode")).toBe("rotate");
    fireEvent.click(screen.getByRole("button", { name: "월드 좌표계" }));
    expect(root.getAttribute("data-transform-space")).toBe("local");
    expect(screen.getByRole("button", { name: "로컬 좌표계" })).toBeTruthy();
  });

  it("exposes stable point, edge, face modes and clears component selection on empty space", () => {
    const onClearComponentSelection = vi.fn();
    const onComponentSelectionModeChange = vi.fn();
    const onDeleteSelected = vi.fn();
    const onDuplicateSelected = vi.fn();
    const onSelectAsset = vi.fn();
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("component-selection"),
      "component-cube",
    );
    const record = workspace.session.state.geometry.records["component-cube"]!;
    const selected = mutateStudioHybridDccComponentSelection(
      createStudioHybridDccComponentSelection(),
      {
        mode: "face",
        operation: "replace",
        ids: [record.mesh.faces[0]!.id],
        activeId: record.mesh.faces[0]!.id,
        source: {
          assetId: record.assetId,
          mesh: record.mesh,
          meshRevision: record.revision,
          sourceHash: record.meshHash,
        },
      },
    );
    if (!selected.ok) throw new Error("component selection fixture failed");

    render(
      <StudioHybridDccViewport
        workspace={workspace}
        componentSelection={selected.value}
        onClearComponentSelection={onClearComponentSelection}
        onComponentSelectionModeChange={onComponentSelectionModeChange}
        onDeleteSelected={onDeleteSelected}
        onDuplicateSelected={onDuplicateSelected}
        onSelectAsset={onSelectAsset}
        onSelectComponent={vi.fn()}
        onCommitAssetTransform={vi.fn()}
        webglAvailable
      />,
    );

    const root = screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트");
    expect(root.getAttribute("data-selection-mode")).toBe("face");
    expect(root.getAttribute("data-selected-elements")).toBe("1");
    expect(screen.queryByRole("button", { name: "이동 도구 (G)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "꼭짓점 선택 모드 (1)" }));
    expect(onComponentSelectionModeChange).toHaveBeenLastCalledWith("vertex");

    const faceMode = screen.getByRole("button", { name: "면 선택 모드 (3)" });
    faceMode.focus();
    fireEvent.keyDown(faceMode, { key: "2", code: "Digit2" });
    expect(onComponentSelectionModeChange).toHaveBeenLastCalledWith("edge");

    fireEvent.keyDown(faceMode, { key: "D", code: "KeyD", shiftKey: true });
    fireEvent.keyDown(faceMode, { key: "Delete", code: "Delete" });
    expect(onDuplicateSelected).not.toHaveBeenCalled();
    expect(onDeleteSelected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("r3f-canvas"));
    expect(onClearComponentSelection).toHaveBeenCalledTimes(1);
    expect(onSelectAsset).not.toHaveBeenCalledWith(null);
  });

  it("offers standard DCC views plus scene and selection framing through buttons and shortcuts", () => {
    const onProjectionChange = vi.fn();
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("view-navigation"),
      "view-cube",
    );
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        onProjectionChange={onProjectionChange}
        webglAvailable
      />,
    );

    const root = screen.getByLabelText("Hybrid DCC 3D 작업 뷰포트");
    fireEvent.click(screen.getByRole("button", { name: "정면 보기 (숫자 키패드 1)" }));
    expect(root.getAttribute("data-view-preset")).toBe("front");
    expect(root.getAttribute("data-projection")).toBe("orthographic");
    expect(onProjectionChange).toHaveBeenLastCalledWith("orthographic");

    fireEvent.click(screen.getByRole("button", { name: "선택 오브젝트 화면 맞춤 (마침표)" }));
    expect(root.getAttribute("data-frame-target")).toBe("selection");
    const frontButton = screen.getByRole("button", { name: "정면 보기 (숫자 키패드 1)" });
    frontButton.focus();
    fireEvent.keyDown(frontButton, { key: "Home", code: "Home" });
    expect(root.getAttribute("data-frame-target")).toBe("scene");
    fireEvent.keyDown(frontButton, { key: "7", code: "Numpad7" });
    expect(root.getAttribute("data-view-preset")).toBe("top");
  });

  it("routes reversible duplicate and delete shortcuts only while the viewport owns focus", () => {
    const onDeleteSelected = vi.fn();
    const onDuplicateSelected = vi.fn();
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("object-shortcuts"),
      "shortcut-cube",
    );
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        onDeleteSelected={onDeleteSelected}
        onDuplicateSelected={onDuplicateSelected}
        webglAvailable
      />,
    );

    const focusOwner = screen.getByRole("button", { name: "등각 보기" });
    focusOwner.focus();
    fireEvent.keyDown(focusOwner, { key: "D", code: "KeyD", shiftKey: true });
    fireEvent.keyDown(focusOwner, { key: "Delete", code: "Delete" });
    expect(onDuplicateSelected).toHaveBeenCalledTimes(1);
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);

    focusOwner.blur();
    fireEvent.keyDown(window, { key: "Delete", code: "Delete" });
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it("pins ACES, sRGB, PCF shadows, bounded DPR, and demand rendering at the Canvas boundary", () => {
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("renderer-profile"),
      "profile-cube",
    );
    render(
      <StudioHybridDccViewport
        workspace={workspace}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );

    const props = fiberHarness.canvasProps;
    expect(props).not.toBeNull();
    expect(props?.dpr).toEqual([1, 2]);
    expect(props?.frameloop).toBe("demand");
    expect(props?.gl).toMatchObject({
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    expect(props?.shadows).toEqual({ enabled: true, type: THREE.PCFShadowMap });

    const domElement = document.createElement("canvas");
    const renderer = {
      domElement,
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 0,
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    };
    act(() => {
      (props?.onCreated as ((state: { readonly gl: typeof renderer }) => void))({ gl: renderer });
    });
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.08);
    expect(renderer.shadowMap).toEqual({ enabled: true, type: THREE.PCFShadowMap });
    expect(domElement.getAttribute("role")).toBe("application");
    expect(domElement.getAttribute("aria-label")).toBe("편집 메시 3D 렌더");
    expect(domElement.getAttribute("aria-describedby")).toBeTruthy();
    expect(domElement.tabIndex).toBe(0);
  });

  it("rejects a WebGL1-only browser before Canvas because Three r184 requires WebGL2", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Viewport Test Browser");
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(((contextId: string) => (
        contextId === "webgl" ? {} : null
      )) as HTMLCanvasElement["getContext"]);
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("webgl1-only"),
      "legacy-cube",
    );
    render(<StudioHybridDccViewport workspace={workspace} onSelectAsset={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("WebGL 3D 렌더링을 사용할 수 없습니다.")).toBeTruthy();
    });
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(getContext).not.toHaveBeenCalledWith("webgl");
  });

  it("releases the temporary WebGL2 capability-probe context before starting Canvas", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Viewport Test Browser");
    const loseContext = vi.fn();
    const getExtension = vi.fn((name: string) => (
      name === "WEBGL_lose_context" ? { loseContext } : null
    ));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(((contextId: string) => (
        contextId === "webgl2" ? { getExtension } : null
      )) as HTMLCanvasElement["getContext"]);
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("webgl2-probe-release"),
      "probe-cube",
    );

    render(<StudioHybridDccViewport workspace={workspace} onSelectAsset={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("r3f-canvas")).toBeTruthy());
    expect(getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("accepts more than 4,000 simple faces after the authority converter became linear", () => {
    const mesh = createDisconnectedRegularPolygonMesh(4_001, 3);
    render(
      <StudioHybridDccViewport
        workspace={workspaceWithMesh(mesh, "linear-large")}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.getByTestId("r3f-canvas")).toBeTruthy();
    expect(screen.getByText("V 12,003 · △ 4,001")).toBeTruthy();
  });

  it("fails soft when high-order polygons exceed their real segment-pair validation work", () => {
    const mesh = createDisconnectedRegularPolygonMesh(123, 128);
    render(
      <StudioHybridDccViewport
        workspace={workspaceWithMesh(mesh, "pair-heavy")}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(screen.getByText(/동기 다각형 교차 검사 예산을 초과했습니다/u)).toBeTruthy();
  });

  it("applies polygon-pair work cumulatively while preserving assets that fit", () => {
    const mesh = createDisconnectedRegularPolygonMesh(92, 128);
    render(
      <StudioHybridDccViewport
        workspace={workspaceWithMeshes([
          { assetId: "pair-a", mesh },
          { assetId: "pair-b", mesh },
        ])}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.getByTestId("r3f-canvas")).toBeTruthy();
    expect(screen.getByText("V 11,776 · △ 11,592")).toBeTruthy();
    expect(screen.getByText(/pair-b: 동시 표시 변환 예산을 초과했습니다/u)).toBeTruthy();
  });

  it("rejects concave fan triangulation and mixed split-normal authority instead of lying", () => {
    const concave = createStudioEditableMeshFromPolygons(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 2 },
        { x: 0, y: 0, z: 2 },
      ],
      [[0, 1, 2, 3, 4]],
    );
    const { rerender } = render(
      <StudioHybridDccViewport
        workspace={workspaceWithMesh(concave, "concave")}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(screen.getByText(/오목 다각형 삼각화/u)).toBeTruthy();

    const cube = createStudioUnitCubeMesh();
    const mixed: StudioEditableMesh = {
      ...cube,
      faces: cube.faces.map((face, index) => index === 0 ? { ...face, smooth: true } : face),
    };
    rerender(
      <StudioHybridDccViewport
        workspace={workspaceWithMesh(mixed, "mixed-normals")}
        onSelectAsset={vi.fn()}
        webglAvailable
      />,
    );
    expect(screen.queryByTestId("r3f-canvas")).toBeNull();
    expect(screen.getByText(/split-normal 렌더 경로/u)).toBeTruthy();
  });

  it("owns and disposes local IBL, shadow, edge, and geometry resources", () => {
    expect(VIEWPORT_SOURCE).toContain("new RoomEnvironment()");
    expect(VIEWPORT_SOURCE).toContain("new THREE.PMREMGenerator(gl)");
    expect(VIEWPORT_SOURCE).toContain("target.dispose()");
    expect(VIEWPORT_SOURCE).toContain("generator.dispose()");
    expect(VIEWPORT_SOURCE).toContain("room.dispose()");
    expect(VIEWPORT_SOURCE).toContain("return () => next.dispose()");
    expect(VIEWPORT_SOURCE).toContain("edges.dispose()");
    expect(VIEWPORT_SOURCE).toContain("geometry.dispose()");
    expect(VIEWPORT_SOURCE).toContain("indexedGeometry.toNonIndexed()");
    expect(VIEWPORT_SOURCE).toContain("THREE.PCFShadowMap");
    expect(VIEWPORT_SOURCE).not.toContain("THREE.PCFSoftShadowMap");
    expect(VIEWPORT_SOURCE).toContain("polygonPairWork += points.length * points.length");
    expect(VIEWPORT_SOURCE).not.toContain("estimatedFaceScanWork");
    expect(VIEWPORT_SOURCE).not.toContain("faceCount * faceCount");
  });
});

describe("deriveStudioHybridDccAssetLayout", () => {
  it("uses canonical TRS authority and rotated world bounds instead of an inspection grid", () => {
    const cube = createStudioUnitCubeMesh();
    const layout = deriveStudioHybridDccAssetLayout([{
      assetId: "placed-cube",
      meshHash: "placed",
      mesh: cube,
      transform: {
        revision: 1,
        position: [5, 2, -3],
        rotationEulerRad: [0, Math.PI / 2, 0],
        scale: [2, 1, 1],
      },
    }]);

    expect(layout.sourceTransforms).toBe("canonical");
    expect(layout.center).toEqual([5, 2, -3]);
    expect(layout.items[0]).toMatchObject({
      position: [5, 2, -3],
      rotationEulerRad: [0, Math.PI / 2, 0],
      scale: [2, 1, 1],
    });
    expect(layout.items[0]!.worldMax[0] - layout.items[0]!.worldMin[0]).toBeCloseTo(1);
    expect(layout.items[0]!.worldMax[2] - layout.items[0]!.worldMin[2]).toBeCloseTo(2);
  });

  it("sorts deterministically, grounds assets, and recenters off-origin authority bounds", () => {
    const cube = createStudioUnitCubeMesh();
    const shifted: StudioEditableMesh = {
      ...cube,
      vertices: cube.vertices.map((vertex) => ({
        ...vertex,
        position: {
          x: vertex.position.x + 100,
          y: vertex.position.y + 7,
          z: vertex.position.z - 40,
        },
      })),
    };
    const before = shifted.vertices.map((vertex) => ({ ...vertex.position }));
    const forward = deriveStudioHybridDccAssetLayout([
      { assetId: "zeta", meshHash: "z", mesh: shifted },
      { assetId: "alpha", meshHash: "a", mesh: cube },
    ]);
    const reversed = deriveStudioHybridDccAssetLayout([
      { assetId: "alpha", meshHash: "a", mesh: cube },
      { assetId: "zeta", meshHash: "z", mesh: shifted },
    ]);

    expect(forward.sourceTransforms).toBe("absent");
    expect(forward.signature).toBe(reversed.signature);
    expect(forward.items.map((item) => item.assetId)).toEqual(["alpha", "zeta"]);
    expect(forward.items.map((item) => item.position)).toEqual(
      reversed.items.map((item) => item.position),
    );
    for (const item of forward.items) {
      expect(item.min[1] + item.position[1]).toBeCloseTo(0);
      expect((item.min[0] + item.max[0]) / 2 + item.position[0]).toBeCloseTo(
        item.assetId === "alpha" ? forward.items[0]!.position[0] : -forward.items[0]!.position[0],
      );
      expect((item.min[2] + item.max[2]) / 2 + item.position[2]).toBeCloseTo(0);
    }
    expect(shifted.vertices.map((vertex) => vertex.position)).toEqual(before);
  });

  it("bounds the shared presentation contract and fails excess assets softly", () => {
    const cube = createStudioUnitCubeMesh();
    const layout = deriveStudioHybridDccAssetLayout(
      Array.from(
        { length: STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS.maxAssets + 1 },
        (_, index) => ({
          assetId: `asset-${index.toString().padStart(3, "0")}`,
          meshHash: `mesh-${index}`,
          mesh: cube,
        }),
      ),
    );

    expect(layout.items).toHaveLength(STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS.maxAssets);
    expect(layout.errors).toEqual([
      { assetId: "asset-256", message: "동시 표시 에셋 예산을 초과했습니다." },
    ]);
  });
});
