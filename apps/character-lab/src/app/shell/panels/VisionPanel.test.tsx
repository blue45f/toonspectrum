// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LEFT_FINGER_BONE_NAMES, RIGHT_FINGER_BONE_NAMES, createEmptyRaster, createPresetCatalog, failVisible } from "../../../contracts";
import { fistHandLandmarks, tPoseBody, toImageLandmarks, toWorldLandmarks } from "../../../domains/vision/landmark-fixtures";
import { toEmbedding } from "../../../domains/vision/similarity";
import { createMockLabStore, MockLabProvider } from "../../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../../testing/recipe-fixtures";

import { VisionPanel, createBrowserVisionDeps } from "./VisionPanel";

import type { DecodedImage, VisionPanelDeps } from "./VisionPanel";
import type { CapturedRaster, EmbedderPort, LabCommand, ThumbnailEntry } from "../../../contracts";
import type { HandDetectorPort, LoadedModel, PoseDetectorPort, VisionLoaders, VisionModelKey } from "../../../domains/vision/vision-ports";

interface TaggedImage {
  readonly tag: number;
}

function tagged(tag: number): ImageData {
  return { tag } as unknown as ImageData;
}

function loadedModel<Port>(key: VisionModelKey, port: Port, disposed?: string[]): LoadedModel<Port> {
  return { key, port, observedSha256: "ab".repeat(32), pinned: key === "imageEmbedder", bytes: 10, license: "Apache-2.0", delegate: "CPU", dispose: () => void disposed?.push(key) };
}

function fakeLoaders(options: { readonly failEmbedder?: boolean; readonly noPerson?: boolean; readonly calls?: string[]; readonly disposed?: string[] } = {}): VisionLoaders {
  const embedder: EmbedderPort = {
    embed: async (image) => {
      const tag = (image as unknown as TaggedImage).tag;
      return tag >= 128 ? toEmbedding([1, 0]) : toEmbedding([0, 1]);
    },
  };
  const poseDetector: PoseDetectorPort = {
    detect: async () => (options.noPerson ? null : { landmarks: toImageLandmarks(tPoseBody()), worldLandmarks: toWorldLandmarks(tPoseBody()) }),
  };
  const handDetector: HandDetectorPort = {
    detect: async () => [{ reportedHandedness: "Left", score: 0.9, landmarks: fistHandLandmarks(), worldLandmarks: null }],
  };
  return {
    imageEmbedder: async () => {
      options.calls?.push("imageEmbedder");
      if (options.failEmbedder) throw failVisible("vision-model-timeout", "모델 imageEmbedder 다운로드가 15초 안에 끝나지 않았습니다.", undefined, 1);
      return loadedModel("imageEmbedder", embedder, options.disposed);
    },
    poseLandmarker: async () => {
      options.calls?.push("poseLandmarker");
      return loadedModel("poseLandmarker", poseDetector, options.disposed);
    },
    handLandmarker: async () => {
      options.calls?.push("handLandmarker");
      return loadedModel("handLandmarker", handDetector, options.disposed);
    },
  };
}

function solidRgba(size: number, r: number, g: number, b: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let p = 0; p < size * size; p += 1) rgba.set([r, g, b, 255], p * 4);
  return rgba;
}

function fakeDeps(loaders: VisionLoaders, extra: Partial<VisionPanelDeps> = {}): VisionPanelDeps {
  return {
    createLoaders: async () => loaders,
    decodeImage: async (file): Promise<DecodedImage> => ({ width: 8, height: 6, rgba: solidRgba(8, 220, 30, 30).subarray(0, 8 * 6 * 4), source: tagged(255), previewUrl: null, label: file instanceof File ? file.name : "blob" }),
    rasterToImage: (raster: CapturedRaster) => tagged(raster.rgba[0] ?? 0),
    now: () => 1,
    ...extra,
  };
}

function thumbnail(red: number, cacheKey: string): ThumbnailEntry {
  const raster = createEmptyRaster(4, 4);
  for (let p = 0; p < 16; p += 1) raster.rgba.set([red, 0, 0, 255], p * 4);
  return { status: "ready", raster, cacheKey };
}

function selectFile(label: string, name: string): void {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "image/png" })] } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VisionPanel", () => {
  const catalog = createPresetCatalog(vocabularyCatalogEntries());

  it("모델 상태 행은 SHA 고정/미고정·베타를 구분하고 카메라 미지원을 정직하게 표시한다", () => {
    render(
      <MockLabProvider catalog={catalog}>
        <VisionPanel deps={fakeDeps(fakeLoaders())} />
      </MockLabProvider>,
    );
    const rows = screen.getAllByRole("listitem").filter((node) => node.className === "cl-vision-model");
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toMatch(/이미지 임베더.*SHA 고정.*대기/u);
    expect(rows[1]?.textContent).toMatch(/포즈 랜드마커.*SHA 미고정·베타/u);
    expect(rows[2]?.textContent).toMatch(/손 랜드마커.*SHA 미고정·베타/u);
    expect((screen.getByRole("button", { name: "카메라 열기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/카메라\(getUserMedia\)를 지원하지 않습니다/u)).toBeTruthy();
  });

  it("참고 이미지 → 슬롯별 추천·팔레트 색 추천, 카드 클릭은 slot/apply·color/set 1회", async () => {
    const dispatched: LabCommand[] = [];
    const store = createMockLabStore({ thumbnails: { "hair/soft-bob": thumbnail(255, "sb"), "hair/twin-tail": thumbnail(0, "tt"), "eyes/round": { status: "pending", cacheKey: "er" } } }, (command) => dispatched.push(command));
    render(
      <MockLabProvider store={store} catalog={catalog}>
        <VisionPanel deps={fakeDeps(fakeLoaders())} />
      </MockLabProvider>,
    );
    selectFile("참고 이미지 파일", "ref.png");
    await screen.findByText(/후보 2\/\d+개 · 썸네일 임베딩 2개\(재사용 0개\) · 제외 1개/u);
    const softBob = screen.getByRole("button", { name: /1\. 헤어 soft-bob · 1\.00/u });
    expect(screen.getByRole("button", { name: /2\. 헤어 twin-tail · 0\.00/u })).toBeTruthy();
    fireEvent.click(softBob);
    expect(dispatched).toEqual([{ type: "slot/apply", slot: "hair", presetId: "hair/soft-bob" }]);
    fireEvent.click(screen.getByRole("button", { name: /추천 색 적용\(2개\)/u }));
    expect(dispatched.slice(1)).toEqual([
      { type: "color/set", key: "hair", value: "#dc1e1e" },
      { type: "color/set", key: "brow", value: "#dc1e1e" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "1순위 전체 적용" }));
    expect(dispatched[3]).toEqual({ type: "slot/apply", slot: "hair", presetId: "hair/soft-bob" });
    const visionEvents = store.events.filter((event) => event.type === "vision/status");
    expect(visionEvents.map((event) => (event.type === "vision/status" ? event.status.phase : ""))).toEqual(["loading", "ready"]);
    const ready = visionEvents[1];
    expect(ready?.type === "vision/status" && ready.status.phase === "ready" && ready.status.observedSha256).toBe("ab".repeat(32));
    expect(screen.getByText(/eyes\/round: 썸네일 생성 중/u)).toBeTruthy();
  });

  it("사진 포즈: 오버레이 33점·손 21점, 범위·거울 옵션으로 pose/set, 손은 셀피 여부로 측을 정한다", async () => {
    const dispatched: LabCommand[] = [];
    const store = createMockLabStore(undefined, (command) => dispatched.push(command));
    render(
      <MockLabProvider store={store} catalog={catalog}>
        <VisionPanel deps={fakeDeps(fakeLoaders())} />
      </MockLabProvider>,
    );
    selectFile("포즈 사진 파일", "pose.png");
    await screen.findByRole("button", { name: "포즈 적용" });
    expect(document.querySelectorAll("circle.cl-vision-landmark").length).toBe(33);
    expect(document.querySelectorAll("circle.cl-vision-hand-landmark").length).toBe(21);
    expect(screen.getByText(/적용 14\/14본 · 건너뜀 0본/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "포즈 적용" }));
    expect(dispatched[0]?.type).toBe("pose/set");
    if (dispatched[0]?.type === "pose/set") {
      expect(dispatched[0].scope).toBe("full");
      expect(Object.keys(dispatched[0].pose)).toContain("hips");
      expect(dispatched[0].labelKo).toBe("사진 포즈(전신)");
    }
    fireEvent.change(screen.getByLabelText("적용 범위"), { target: { value: "arms-hands" } });
    fireEvent.click(screen.getByLabelText(/거울 모드/u));
    expect(screen.getByText(/적용 6\/6본/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "포즈 적용" }));
    if (dispatched[1]?.type === "pose/set") {
      expect(dispatched[1].scope).toBe("arms-hands");
      expect(Object.keys(dispatched[1].pose).sort()).toEqual(["leftHand", "leftLowerArm", "leftUpperArm", "rightHand", "rightLowerArm", "rightUpperArm"]);
      expect(dispatched[1].labelKo).toBe("사진 포즈(팔·손, 거울)");
    } else {
      throw new Error("pose/set 없음");
    }
    expect(screen.getByText(/손 1: 모델 보고 Left → 오른손/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "오른손 포즈 적용" }));
    if (dispatched[2]?.type === "pose/set") {
      // 거울 모드가 켜져 있으므로 오른손 랜드마크가 왼손에 적용된다
      expect(dispatched[2].scope).toBe("left-hand");
      expect(Object.keys(dispatched[2].pose).sort()).toEqual([...LEFT_FINGER_BONE_NAMES].sort());
    } else {
      throw new Error("손 pose/set 없음");
    }
    fireEvent.click(screen.getByLabelText(/거울 모드/u));
    fireEvent.click(screen.getByLabelText(/셀피/u));
    expect(screen.getByText(/손 1: 모델 보고 Left → 왼손/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "왼손 포즈 적용" }));
    if (dispatched[3]?.type === "pose/set") {
      expect(dispatched[3].scope).toBe("left-hand");
      expect(Object.keys(dispatched[3].pose).length).toBe(RIGHT_FINGER_BONE_NAMES.length);
    }
    fireEvent.change(screen.getByLabelText("가시성 임계"), { target: { value: "1" } });
    expect(screen.getByText(/적용 6\/6본 · 건너뜀 0본/u)).toBeTruthy();
  });

  it("모델 실패는 failed로 남아 자동 재시도하지 않고, 다시 시도 버튼만 다시 로드한다", async () => {
    const calls: string[] = [];
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store} catalog={catalog}>
        <VisionPanel deps={fakeDeps(fakeLoaders({ failEmbedder: true, calls }))} />
      </MockLabProvider>,
    );
    selectFile("참고 이미지 파일", "ref.png");
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/15초 안에 끝나지 않았습니다\. \(vision-model-timeout\)/u);
    expect(calls).toEqual(["imageEmbedder"]);
    const failedEvent = store.events.find((event) => event.type === "vision/status" && event.status.phase === "failed");
    expect(failedEvent).toBeDefined();
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "vision-model-timeout")).toBe(true);
    selectFile("참고 이미지 파일", "ref2.png");
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(calls).toEqual(["imageEmbedder"]);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(calls).toEqual(["imageEmbedder", "imageEmbedder"]));
  });

  it("사람이 없으면 vision-no-person 실패, 카메라 열기 실패는 사유를 표시한다", async () => {
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store} catalog={catalog}>
        <VisionPanel deps={fakeDeps(fakeLoaders({ noPerson: true }), { openCamera: async () => Promise.reject(new Error("NotAllowedError")) })} />
      </MockLabProvider>,
    );
    selectFile("포즈 사진 파일", "pose.png");
    // 사유와 코드는 같은 alert 안의 서로 다른 텍스트 노드라 textContent로 본다.
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/사진에서 사람\(포즈\)을 찾지 못했습니다\. \(vision-no-person\)/u);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "vision-no-person")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "카메라 열기" }));
    await screen.findByText(/카메라를 열지 못했습니다/u);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "vision-camera-failed")).toBe(true);
  });

  it("deps.now가 없어도 부모가 다시 렌더될 때 비전 세션과 로드된 모델이 폐기되지 않는다", async () => {
    const disposed: string[] = [];
    const base = fakeDeps(fakeLoaders({ disposed }));
    // production 기본 deps(createBrowserVisionDeps)처럼 now가 없는 deps
    const deps: VisionPanelDeps = { createLoaders: base.createLoaders, decodeImage: base.decodeImage, rasterToImage: base.rasterToImage };
    const store = createMockLabStore();
    const tree = (
      <MockLabProvider store={store} catalog={catalog}>
        <VisionPanel deps={deps} />
      </MockLabProvider>
    );
    const view = render(tree);
    const embedderRow = (): string => screen.getAllByRole("listitem").find((node) => node.getAttribute("data-model") === "imageEmbedder")?.textContent ?? "";
    fireEvent.click(screen.getAllByRole("button", { name: "불러오기" })[0] as HTMLElement);
    await waitFor(() => expect(embedderRow()).toMatch(/준비됨/u));
    for (let i = 0; i < 3; i += 1) {
      view.rerender(
        <MockLabProvider store={store} catalog={catalog}>
          <VisionPanel deps={deps} />
        </MockLabProvider>,
      );
    }
    // 세션이 재생성됐다면 이전 세션 dispose로 모델이 해제되고 상태가 대기로 돌아간다
    expect(disposed).toEqual([]);
    expect(embedderRow()).toMatch(/준비됨/u);
    expect(store.events.filter((event) => event.type === "vision/status").map((event) => (event.type === "vision/status" ? event.status.phase : ""))).toEqual(["loading", "ready"]);
    view.unmount();
    expect(disposed).toEqual(["imageEmbedder"]);
  });

  describe("이미지 디코드 자원(ObjectURL·ImageBitmap) 해제", () => {
    function releasableImage(name: string, log: string[]): DecodedImage {
      return {
        width: 8,
        height: 6,
        rgba: solidRgba(8, 220, 30, 30).subarray(0, 8 * 6 * 4),
        source: tagged(255),
        previewUrl: `blob:${name}`,
        label: name,
        releaseSource: () => log.push(`source:${name}`),
        releasePreview: () => log.push(`preview:${name}`),
      };
    }
    const depsWithLog = (log: string[], loaders: VisionLoaders): VisionPanelDeps =>
      fakeDeps(loaders, { decodeImage: async (file) => releasableImage(file instanceof File ? file.name : "blob", log) });

    it("참고 이미지: 추정이 끝나면 비트맵을, 이미지를 바꾸면 이전 미리보기를, 언마운트하면 현재 미리보기를 해제한다", async () => {
      const log: string[] = [];
      const store = createMockLabStore();
      const view = render(
        <MockLabProvider store={store} catalog={catalog}>
          <VisionPanel deps={depsWithLog(log, fakeLoaders())} />
        </MockLabProvider>,
      );
      selectFile("참고 이미지 파일", "a.png");
      await screen.findByRole("img", { name: "참고 이미지 a.png" });
      expect(log).toEqual(["source:a.png"]);
      selectFile("참고 이미지 파일", "b.png");
      await screen.findByRole("img", { name: "참고 이미지 b.png" });
      expect(log).toEqual(["source:a.png", "preview:a.png", "source:b.png"]);
      view.unmount();
      expect(log).toEqual(["source:a.png", "preview:a.png", "source:b.png", "preview:b.png"]);
    });

    it("사진 포즈: 같은 규칙으로 해제하고, 사람이 없어 실패해도 미리보기·비트맵을 해제한다", async () => {
      const log: string[] = [];
      const view = render(
        <MockLabProvider store={createMockLabStore()} catalog={catalog}>
          <VisionPanel deps={depsWithLog(log, fakeLoaders())} />
        </MockLabProvider>,
      );
      selectFile("포즈 사진 파일", "p1.png");
      await screen.findByRole("img", { name: "포즈 사진 p1.png" });
      expect(log).toEqual(["source:p1.png"]);
      selectFile("포즈 사진 파일", "p2.png");
      await screen.findByRole("img", { name: "포즈 사진 p2.png" });
      expect(log).toEqual(["source:p1.png", "preview:p1.png", "source:p2.png"]);
      view.unmount();
      expect(log).toEqual(["source:p1.png", "preview:p1.png", "source:p2.png", "preview:p2.png"]);

      const failLog: string[] = [];
      render(
        <MockLabProvider store={createMockLabStore()} catalog={catalog}>
          <VisionPanel deps={depsWithLog(failLog, fakeLoaders({ noPerson: true }))} />
        </MockLabProvider>,
      );
      selectFile("포즈 사진 파일", "none.png");
      await screen.findByRole("alert");
      expect([...failLog].sort()).toEqual(["preview:none.png", "source:none.png"]);
    });

    it("createBrowserVisionDeps.decodeImage는 비트맵 close·ObjectURL revoke 콜백을 돌려주고, 디코드 실패 시 곧바로 해제한다", async () => {
      const close = vi.fn();
      const bitmap = { width: 2, height: 2, close } as unknown as ImageBitmap;
      vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
      const revoked: string[] = [];
      // jsdom에는 URL.createObjectURL이 없다. 테스트가 끝나면 원래 상태(없음)로 되돌린다.
      const originals = (["createObjectURL", "revokeObjectURL"] as const).map((name) => [name, Object.getOwnPropertyDescriptor(URL, name)] as const);
      Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: () => "blob:one" });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: (url: string) => void revoked.push(url) });
      const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
      getContext.mockReturnValue({ drawImage: () => undefined, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) } as unknown as CanvasRenderingContext2D);
      try {
        const deps = createBrowserVisionDeps();
        const image = await deps.decodeImage(new File(["x"], "a.png", { type: "image/png" }));
        expect(image.previewUrl).toBe("blob:one");
        expect(close).not.toHaveBeenCalled();
        expect(revoked).toEqual([]);
        image.releaseSource?.();
        image.releaseSource?.();
        expect(close).toHaveBeenCalledTimes(2);
        image.releasePreview?.();
        expect(revoked).toEqual(["blob:one"]);

        // 2D 컨텍스트를 못 얻어 디코드가 실패하면 만들어 둔 비트맵·URL을 바로 해제한다(호출자는 DecodedImage를 받지 못한다)
        close.mockClear();
        revoked.length = 0;
        getContext.mockReturnValue(null);
        await expect(deps.decodeImage(new File(["x"], "b.png", { type: "image/png" }))).rejects.toMatchObject({ code: "vision-canvas-unavailable" });
        expect(close).toHaveBeenCalledTimes(1);
        expect(revoked).toEqual(["blob:one"]);
      } finally {
        for (const [name, descriptor] of originals) {
          if (descriptor) Object.defineProperty(URL, name, descriptor);
          else Reflect.deleteProperty(URL, name);
        }
      }
    });
  });
});
