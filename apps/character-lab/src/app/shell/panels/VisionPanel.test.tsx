// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LEFT_FINGER_BONE_NAMES, RIGHT_FINGER_BONE_NAMES, createEmptyRaster, createPresetCatalog, failVisible } from "../../../contracts";
import { fistHandLandmarks, tPoseBody, toImageLandmarks, toWorldLandmarks } from "../../../domains/vision/landmark-fixtures";
import { toEmbedding } from "../../../domains/vision/similarity";
import { createMockLabStore, MockLabProvider } from "../../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../../testing/recipe-fixtures";

import { VisionPanel } from "./VisionPanel";

import type { DecodedImage, VisionPanelDeps } from "./VisionPanel";
import type { CapturedRaster, EmbedderPort, LabCommand, ThumbnailEntry } from "../../../contracts";
import type { HandDetectorPort, LoadedModel, PoseDetectorPort, VisionLoaders, VisionModelKey } from "../../../domains/vision/vision-ports";

interface TaggedImage {
  readonly tag: number;
}

function tagged(tag: number): ImageData {
  return { tag } as unknown as ImageData;
}

function loadedModel<Port>(key: VisionModelKey, port: Port): LoadedModel<Port> {
  return { key, port, observedSha256: "ab".repeat(32), pinned: key === "imageEmbedder", bytes: 10, license: "Apache-2.0", delegate: "CPU", dispose: () => undefined };
}

function fakeLoaders(options: { readonly failEmbedder?: boolean; readonly noPerson?: boolean; readonly calls?: string[] } = {}): VisionLoaders {
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
      return loadedModel("imageEmbedder", embedder);
    },
    poseLandmarker: async () => {
      options.calls?.push("poseLandmarker");
      return loadedModel("poseLandmarker", poseDetector);
    },
    handLandmarker: async () => {
      options.calls?.push("handLandmarker");
      return loadedModel("handLandmarker", handDetector);
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

afterEach(cleanup);

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
});
