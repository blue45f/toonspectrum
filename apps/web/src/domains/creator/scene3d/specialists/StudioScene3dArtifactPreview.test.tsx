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
import { StudioScene3dArtifactPreview } from "./StudioScene3dArtifactPreview";
import { createArtifactReviewRuntime } from "./artifact-review-runtime";
import type {
  ArtifactReviewControls,
  ArtifactReviewSource,
} from "./artifact-review-contract";
import type { SpecialistArtifact } from "./specialist-contract";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));
vi.mock("./artifact-review-runtime", () => ({
  createArtifactReviewRuntime: vi.fn(),
}));
const stats = {
  triangles: 12,
  vertices: 24,
  nodes: 1,
  animations: 0,
  animationKeys: 0,
  tangentPrimitives: 0,
};
const artifact: SpecialistArtifact = {
  name: "lod-0.glb",
  mime: "model/gltf-binary",
  bytes: new Uint8Array(32),
  sha256: "sha256:" + "a".repeat(64),
  stats,
};
const source: ArtifactReviewSource = {
  label: "original.glb",
  bytes: new Uint8Array(64),
  sha256: "sha256:" + "b".repeat(64),
  stats,
};
const session = (): ArtifactReviewControls => ({
  fit: vi.fn(),
  zoom: vi.fn(),
  orient: vi.fn(),
  setMode: vi.fn(),
  setDivider: vi.fn(),
  setWireframe: vi.fn(),
  dispose: vi.fn(),
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
async function ready() {
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "화면에 맞춤" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
}
describe("artist-facing source and derivative review", () => {
  it("loads the original only on explicit comparison and uses the same session for view/divider/wireframe changes", async () => {
    const sessions: ArtifactReviewControls[] = [];
    vi.mocked(createArtifactReviewRuntime).mockImplementation(async () => {
      const s = session();
      sessions.push(s);
      return s;
    });
    const ui = render(
      <StudioScene3dArtifactPreview artifact={artifact} source={source} />,
    );
    await ready();
    expect(
      vi.mocked(createArtifactReviewRuntime).mock.calls[0]![0].source,
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "원본과 비교" }));
    await ready();
    expect(
      vi.mocked(createArtifactReviewRuntime).mock.calls[1]![0].source,
    ).toBe(source);
    expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "원본만" }));
    expect(sessions[1]!.setMode).toHaveBeenLastCalledWith("source");
    fireEvent.click(screen.getByRole("button", { name: "분할 비교" }));
    fireEvent.change(screen.getByRole("slider", { name: "비교 분할 위치" }), {
      target: { value: "25" },
    });
    expect(sessions[1]!.setDivider).toHaveBeenLastCalledWith(0.25);
    fireEvent.click(screen.getByRole("button", { name: "와이어프레임" }));
    expect(sessions[1]!.setWireframe).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "정면" }));
    expect(sessions[1]!.orient).toHaveBeenLastCalledWith("front");
    expect(createArtifactReviewRuntime).toHaveBeenCalledTimes(2);
    ui.unmount();
    expect(sessions[1]!.dispose).toHaveBeenCalledOnce();
  });
  it("preserves the common camera while switching LODs without reusing the old derivative", async () => {
    const frame = {
      key: source.sha256,
      position: [2, 3, 4] as const,
      target: [0, 0, 0] as const,
      up: [0, 1, 0] as const,
    };
    vi.mocked(createArtifactReviewRuntime).mockImplementation(
      async (options) => {
        options.onFrame?.(frame);
        return session();
      },
    );
    const ui = render(
      <StudioScene3dArtifactPreview artifact={artifact} source={source} />,
    );
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "원본과 비교" }));
    await ready();
    const changed = {
      ...artifact,
      name: "lod-2.glb",
      sha256: "sha256:" + "c".repeat(64),
    };
    ui.rerender(
      <StudioScene3dArtifactPreview artifact={changed} source={source} />,
    );
    await ready();
    const last = vi.mocked(createArtifactReviewRuntime).mock.calls.at(-1)![0];
    expect(last.restore).toEqual(frame);
    expect(last.artifact).toBe(changed);
    expect(last.source).toBe(source);
  });
  it("locks and disposes a preview while the editor is disabled, then recreates it on explicit availability", async () => {
    const s = session();
    vi.mocked(createArtifactReviewRuntime).mockResolvedValue(s);
    const ui = render(
      <StudioScene3dArtifactPreview artifact={artifact} source={source} />,
    );
    await ready();
    ui.rerender(
      <StudioScene3dArtifactPreview
        artifact={artifact}
        source={source}
        active={false}
      />,
    );
    expect(s.dispose).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole("button", { name: "원본과 비교" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    ui.rerender(
      <StudioScene3dArtifactPreview artifact={artifact} source={source} />,
    );
    await ready();
    expect(createArtifactReviewRuntime).toHaveBeenCalledTimes(2);
  });
  it("reports setup and runtime errors without automatic retry and supports a user-requested retry", async () => {
    const s = session();
    vi.mocked(createArtifactReviewRuntime)
      .mockRejectedValueOnce(new Error("unsafe model"))
      .mockResolvedValue(s);
    render(<StudioScene3dArtifactPreview artifact={artifact} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "미리보기 다시 시도" }),
    );
    await ready();
    expect(createArtifactReviewRuntime).toHaveBeenCalledTimes(2);
    const callback = vi.mocked(createArtifactReviewRuntime).mock.calls[1]![0]
      .onError!;
    act(() => callback());
    expect(
      (screen.getByRole("button", { name: "화면에 맞춤" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createArtifactReviewRuntime).toHaveBeenCalledTimes(2);
  });
});
