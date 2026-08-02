// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS } from "./studio-mannequin-model";
import { STUDIO_MANNEQUIN_POSE_PRESETS } from "./studio-mannequin-poses";

import type { StudioMannequinSceneHandle } from "./studio-mannequin-scene";

// Three.js 뷰포트는 jsdom 에서 만들 수 없으니 씬 계층 전체를 결정적 스텁으로 대체한다.
// (경로 계약: StudioMannequinPoserPanel 은 씬을 오직 이 모듈을 통해서만 만든다.)
const sceneHandle: StudioMannequinSceneHandle = {
  setBodySpec: vi.fn(),
  setPose: vi.fn(),
  getPose: vi.fn(() => ({ joints: {}, pelvisOffset: [0, 0, 0] as const })),
  setJointRotation: vi.fn(),
  getJointRotation: vi.fn(() => [0, 0, 0] as const),
  selectJoint: vi.fn(),
  setMaterialStyle: vi.fn(),
  getMaterialStyle: vi.fn(() => "wood" as const),
  setCameraPreset: vi.fn(),
  setProjection: vi.fn(),
  getProjection: vi.fn(() => "perspective" as const),
  resetCamera: vi.fn(),
  resize: vi.fn(),
  invalidate: vi.fn(),
  captureDataUrl: vi.fn(async () => ({
    pngDataUrl: "data:image/png;base64,AAAA",
    width: 640,
    height: 480,
    // 래스터는 dpr×배율 슈퍼샘플 — 논리 뷰 크기가 함께 전달돼야 캔버스에 논리 크기로 삽입된다.
    displayWidth: 320,
    displayHeight: 240,
  })),
  dispose: vi.fn(),
};

const createScene = vi.fn((_options: unknown) => sceneHandle);

const webcamRuntimeMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  init: vi.fn(),
}));

vi.mock("./studio-mannequin-scene", () => ({
  createStudioMannequinScene: (options: unknown) => createScene(options),
}));

vi.mock("./studio-mannequin-webcam-tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-mannequin-webcam-tracking")>();
  return {
    ...actual,
    disposeStudioMannequinPoseLandmarker: webcamRuntimeMocks.dispose,
    initStudioMannequinPoseLandmarker: webcamRuntimeMocks.init,
  };
});

const { StudioMannequinPoserPanel } = await import("./StudioMannequinPoserPanel");

const originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalSecureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  webcamRuntimeMocks.init.mockReset();
  webcamRuntimeMocks.dispose.mockReset();
  if (originalMediaDevicesDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "mediaDevices");
  }
  if (originalSecureContextDescriptor) {
    Object.defineProperty(window, "isSecureContext", originalSecureContextDescriptor);
  } else {
    Reflect.deleteProperty(window, "isSecureContext");
  }
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function renderPanel(overrides: {
  onClose?: () => void;
  onInsert?: (result: unknown) => boolean | void | Promise<boolean | void>;
} = {}) {
  return render(
    <StudioMannequinPoserPanel
      open
      onClose={overrides.onClose ?? vi.fn()}
      onInsert={overrides.onInsert ?? vi.fn()}
    />,
  );
}

function installWebcamBrowserStubs(getUserMedia: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 17);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
}

describe("StudioMannequinPoserPanel", () => {
  it("닫혀 있으면 아무것도 렌더링하지 않는다", () => {
    render(<StudioMannequinPoserPanel open={false} onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createScene).not.toHaveBeenCalled();
  });

  it("열리면 다이얼로그·탭·뷰포트를 렌더링하고 씬을 한 번 만든다", () => {
    renderPanel();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("3D 데생 인형")).toBeTruthy();
    for (const label of ["체형", "포즈", "관절", "카메라"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    expect(createScene).toHaveBeenCalledTimes(1);
  });

  it("포즈 탭에 모든 프리셋 칩이 있고 클릭하면 씬에 포즈가 반영된다", async () => {
    renderPanel();
    for (const preset of STUDIO_MANNEQUIN_POSE_PRESETS) {
      expect(screen.getByRole("button", { name: preset.label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "달리기" }));
    await waitFor(() => {
      expect(sceneHandle.setPose).toHaveBeenCalled();
    });
  });

  it("체형 탭 슬라이더 조작이 새 스펙을 씬으로 보낸다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^체형/ }));
    const heightSlider = screen.getByLabelText(/신장/);
    fireEvent.change(heightSlider, { target: { value: "190" } });
    await waitFor(() => {
      expect(sceneHandle.setBodySpec).toHaveBeenCalled();
    });
  });

  it("캡처 버튼은 씬 캡처 → onInsert → onClose 순으로 흐르고 논리 크기를 함께 전달한다", async () => {
    const onClose = vi.fn();
    const onInsert = vi.fn(() => true);
    renderPanel({ onClose, onInsert });
    fireEvent.click(screen.getByRole("button", { name: /카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: /캔버스로 캡처/ }));
    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith({
        pngDataUrl: "data:image/png;base64,AAAA",
        width: 640,
        height: 480,
        displayWidth: 320,
        displayHeight: 240,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("display 쌍이 없는 캡처 결과(예산 축소 등)는 그대로 래스터 크기만 전달한다", async () => {
    vi.mocked(sceneHandle.captureDataUrl).mockResolvedValueOnce({
      pngDataUrl: "data:image/png;base64,BBBB",
      width: 500,
      height: 400,
    });
    const onInsert = vi.fn(() => true);
    renderPanel({ onInsert });
    fireEvent.click(screen.getByRole("button", { name: /카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: /캔버스로 캡처/ }));
    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith({
        pngDataUrl: "data:image/png;base64,BBBB",
        width: 500,
        height: 400,
      });
    });
  });

  it("same-origin 동작 인식 엔진이 준비되면 카메라를 시작하고 중지 시 모든 자원을 정리한다", async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installWebcamBrowserStubs(getUserMedia);
    webcamRuntimeMocks.init.mockResolvedValue({
      detectForVideo: vi.fn(() => ({ landmarks: [] })),
      close: vi.fn(),
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: "웹캠 실시간 동작 인식 시작" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "실시간 동작 인식 중지" })).toBeTruthy();
    });
    expect(webcamRuntimeMocks.init).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: { ideal: "user" },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "실시간 동작 인식 중지" }));
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(webcamRuntimeMocks.dispose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "웹캠 실시간 동작 인식 시작" })).toBeTruthy();
  });

  it("엔진 자산 로드 실패를 카메라 권한 오류와 구분하고 즉시 재시도 버튼을 제공한다", async () => {
    const getUserMedia = vi.fn();
    installWebcamBrowserStubs(getUserMedia);
    webcamRuntimeMocks.init.mockRejectedValue(
      Object.assign(new Error("Failed to load local Wasm loader."), {
        name: "StudioMannequinVisionWasmLoadError",
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: "웹캠 실시간 동작 인식 시작" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("엔진 파일");
    });
    expect(screen.getByRole("button", { name: "웹캠 동작 인식 다시 시도" })).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(webcamRuntimeMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("카메라 권한 거부를 정확히 안내하고 준비 중 취소도 AbortSignal로 중단한다", async () => {
    const permissionDenied = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });
    const getUserMedia = vi.fn().mockRejectedValue(permissionDenied);
    installWebcamBrowserStubs(getUserMedia);
    webcamRuntimeMocks.init.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] })),
      close: vi.fn(),
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: "웹캠 실시간 동작 인식 시작" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("카메라 권한이 차단");
    });
    expect(screen.getByRole("button", { name: "웹캠 동작 인식 다시 시도" })).toBeTruthy();

    let receivedSignal: AbortSignal | undefined;
    webcamRuntimeMocks.init.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = signal;
          signal?.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })),
            { once: true },
          );
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "웹캠 동작 인식 다시 시도" }));
    expect(screen.getByRole("button", { name: "동작 인식 준비 취소" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "동작 인식 준비 취소" }));

    expect(receivedSignal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "웹캠 실시간 동작 인식 시작" })).toBeTruthy();
  });

  it("onInsert 가 false 를 반환하면 닫지 않고 오류를 보여준다", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose, onInsert: () => false });
    fireEvent.click(screen.getByRole("button", { name: /카메라/ }));
    fireEvent.click(screen.getByRole("button", { name: /캔버스로 캡처/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("삽입하지 않았습니다");
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("언마운트 시 씬을 dispose 한다(rAF/GPU 정리 하우스 규칙)", () => {
    const { unmount } = renderPanel();
    unmount();
    expect(sceneHandle.dispose).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼은 마지막 체형/포즈를 localStorage 버전드 문서로 저장한다", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "3D 데생 인형 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const stored = localStorage.getItem("toonspectrum-studio-mannequin-state:v1");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { kind?: string; params?: { heightCm?: number } };
    expect(parsed.kind).toBe("studio-mannequin-state");
    expect(parsed.params?.heightCm).toBe(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS.heightCm);
  });
});
