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
  StudioScene3dArtifactPreview: () => <div>가공 결과 렌더링</div>,
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
