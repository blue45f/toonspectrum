import type { Scene3dInplaceToolsBridge, Scene3dSelectedAssetInput } from "../integration/scene3d-inplace-contract";
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioScene3dAssetToolsPanel } from "./StudioScene3dAssetToolsPanel";
import { runScene3dSpecialistInWorker } from "./specialist-client";
import type { SpecialistResult } from "./specialist-contract";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));
vi.mock("./specialist-client", () => ({
  runScene3dSpecialistInWorker: vi.fn(),
}));
vi.mock("./StudioScene3dArtifactPreview", () => ({
  StudioScene3dArtifactPreview: ({source}: {source?: {sha256:string;label:string;bytes:Uint8Array}}) =>
    <div>가공 결과 렌더링{source && <span data-testid="review-source">{source.label} · {source.sha256} · {source.bytes.length}</span>}</div>,
}));
const createUrl = vi.fn(() => "blob:fixture");
const revokeUrl = vi.fn();
function file(
  name = "source.glb",
  buffer = Promise.resolve(new ArrayBuffer(32)),
) {
  const value = new File([new Uint8Array(32)], name, {
    type: "model/gltf-binary",
  });
  Object.defineProperty(value, "arrayBuffer", { value: () => buffer });
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
const result: SpecialistResult = {
  version: 1,
  sourceSha256: "sha256:" + "a".repeat(64),
  operation: "compress",
  before: {
    triangles: 12,
    vertices: 24,
    nodes: 1,
    animations: 0,
    animationKeys: 0,
    tangentPrimitives: 0,
  },
  artifacts: [
    {
      name: "compress.glb",
      mime: "model/gltf-binary",
      bytes: new Uint8Array(32),
      sha256: "sha256:" + "b".repeat(64),
    },
  ],
  warnings: [],
  provenance: {},
};
async function load(value = file()) {
  fireEvent.change(screen.getByLabelText("원본 GLB"), {
    target: { files: [value] },
  });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Meshopt 압축",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", {
    createObjectURL: createUrl,
    revokeObjectURL: revokeUrl,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("artist-facing specialist tools", () => {
  it("requires an explicit local source, executes the worker and releases download URLs", async () => {
    vi.mocked(runScene3dSpecialistInWorker).mockResolvedValue(result);
    const view = render(<StudioScene3dAssetToolsPanel />);
    expect(
      (
        screen.getByRole("button", {
          name: "Meshopt 압축",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
    expect(
      await screen.findByRole("link", { name: "compress.glb" }),
    ).toBeDefined();
    expect(await screen.findByText("가공 결과 렌더링")).toBeDefined();
    expect(runScene3dSpecialistInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { kind: "compress" },
        source: expect.any(ArrayBuffer),
      }),
      expect.any(AbortSignal),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    view.unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:fixture");
  });
  it("cancels an active worker and restores usable controls", async () => {
    vi.mocked(runScene3dSpecialistInWorker).mockImplementation(
      (_request, signal) =>
        new Promise((_resolve, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          ),
        ),
    );
    render(<StudioScene3dAssetToolsPanel />);
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
    const signal = vi.mocked(runScene3dSpecialistInWorker).mock.calls[0]![1]!;
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(signal.aborted).toBe(true);
    expect((await screen.findByRole("alert")).textContent).toContain("취소");
    expect(
      (
        screen.getByRole("button", {
          name: "Meshopt 압축",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("aborts on unmount and ignores a stale successful worker response", async () => {
    const pending = deferred<SpecialistResult>();
    vi.mocked(runScene3dSpecialistInWorker).mockReturnValue(pending.promise);
    const view = render(<StudioScene3dAssetToolsPanel />);
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
    const signal = vi.mocked(runScene3dSpecialistInWorker).mock.calls[0]![1]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(result));
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("keeps a newer selected file when a cancelled file read completes late", async () => {
    const old = deferred<ArrayBuffer>();
    render(<StudioScene3dAssetToolsPanel />);
    fireEvent.change(screen.getByLabelText("원본 GLB"), {
      target: { files: [file("old.glb", old.promise)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await load(file("new.glb"));
    await act(async () => old.resolve(new ArrayBuffer(32)));
    expect(screen.getByText("new.glb")).toBeDefined();
    expect(screen.queryByText("old.glb")).toBeNull();
  });
  it("aborts processing when the editor locks the parent tools", async () => {
    vi.mocked(runScene3dSpecialistInWorker).mockImplementation(
      (_request, signal) =>
        new Promise((_resolve, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          ),
        ),
    );
    const view = render(<StudioScene3dAssetToolsPanel />);
    await load();
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
    const signal = vi.mocked(runScene3dSpecialistInWorker).mock.calls[0]![1]!;
    view.rerender(<StudioScene3dAssetToolsPanel disabled />);
    await waitFor(() => expect(signal.aborted).toBe(true));
  });
});


function inplaceFixture() {
  const input: Scene3dSelectedAssetInput = { bindingId: "input-1", entityId: "selected-object", label: "선택한 의자", source: new ArrayBuffer(32), sourceSha256: result.sourceSha256 };
  const bridge: Scene3dInplaceToolsBridge = {
    describeSelection: () => ({ available: true, label: input.label, reason: null }),
    captureSelection: vi.fn(async () => input),
    apply: vi.fn(async () => ({ status: "applied" as const, entityId: input.entityId, sourceSha256: input.sourceSha256, derivativeSha256: result.artifacts[0]!.sha256, commandId: "command-1" })),
  };
  return { input, bridge };
}
async function runSelected(bridge: Scene3dInplaceToolsBridge) {
  vi.mocked(runScene3dSpecialistInWorker).mockResolvedValue(result);
  render(<StudioScene3dAssetToolsPanel inplaceTools={bridge} />);
  fireEvent.click(screen.getByRole("button", { name: "선택 모델에서 원본 가져오기" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Meshopt 압축" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
  return screen.findByRole("button", { name: "compress.glb 선택 객체에 적용" });
}
describe("selected object processing UI", () => {
  it("processes the selected source and applies the reviewed artifact without file input/download", async () => {
    const f = inplaceFixture(); const apply = await runSelected(f.bridge);
    expect(f.bridge.captureSelection).toHaveBeenCalledOnce();
    expect(runScene3dSpecialistInWorker).toHaveBeenCalledWith(expect.objectContaining({ source: f.input.source }), expect.any(AbortSignal), expect.objectContaining({ onProgress: expect.any(Function) }));
    fireEvent.click(apply);
    await screen.findByText(/선택 객체에 적용했습니다/);
    expect(f.bridge.apply).toHaveBeenCalledExactlyOnceWith(f.input, result, result.artifacts[0], expect.any(AbortSignal));
    expect((apply as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows stale rejection instead of reporting an application that never happened", async () => {
    const f = inplaceFixture(); vi.mocked(f.bridge.apply).mockRejectedValueOnce(new Error("장면이 변경되었습니다"));
    fireEvent.click(await runSelected(f.bridge));
    expect((await screen.findByRole("alert")).textContent).toContain("장면이 변경되었습니다");
    expect(screen.queryByText(/선택 객체에 적용했습니다/)).toBeNull();
  });
  it("drops scene binding when an unrelated local file becomes the source", async () => {
    const f = inplaceFixture(); await runSelected(f.bridge);
    await load(file("unrelated.glb"));
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" })); await screen.findByRole("link", { name: "compress.glb" });
    expect(screen.queryByRole("button", { name: "compress.glb 선택 객체에 적용" })).toBeNull(); expect(f.bridge.apply).not.toHaveBeenCalled();
  });
  it("keeps the standalone file tool usable without any scene bridge", async () => {
    vi.mocked(runScene3dSpecialistInWorker).mockResolvedValue(result); render(<StudioScene3dAssetToolsPanel />); await load();
    fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" })); await screen.findByRole("link", { name: "compress.glb" });
    expect(screen.queryByRole("button", { name: "선택 모델에서 원본 가져오기" })).toBeNull(); expect(screen.queryByRole("button", { name: "compress.glb 선택 객체에 적용" })).toBeNull();
  });
});


it("shows real queue/stage updates, without invented percentages or stale post-cancel progress", async () => {
  vi.mocked(runScene3dSpecialistInWorker).mockImplementation((_request, signal, options) => {
    options?.onProgress?.({ phase: "queued", queuePosition: 2 });
    return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  });
  render(<StudioScene3dAssetToolsPanel />); await load();
  fireEvent.click(screen.getByRole("button", { name: "Meshopt 압축" }));
  expect(screen.getByText(/대기 순서 2/)).toBeDefined();
  const observer = vi.mocked(runScene3dSpecialistInWorker).mock.calls[0]![2]!.onProgress!;
  act(() => observer({ phase: "decoding" }));
  expect(screen.getByText("원본 검사·모델 디코딩 중")).toBeDefined();
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  await screen.findByRole("alert");
  act(() => observer({ phase: "processing" }));
  expect(screen.queryByText("선택한 가공·인코딩 작업 실행 중")).toBeNull();
});


it("passes the completed job's original input and hash to non-destructive comparison",async()=>{
  vi.mocked(runScene3dSpecialistInWorker).mockResolvedValue(result);
  render(<StudioScene3dAssetToolsPanel/>);await load(file("input-for-review.glb"));fireEvent.click(screen.getByRole("button",{name:"Meshopt 압축"}));
  const source=await screen.findByTestId("review-source");expect(source.textContent).toContain("input-for-review.glb");expect(source.textContent).toContain(result.sourceSha256);expect(source.textContent).toContain("32");
  await load(file("different.glb"));expect(screen.queryByTestId("review-source")).toBeNull();
});
