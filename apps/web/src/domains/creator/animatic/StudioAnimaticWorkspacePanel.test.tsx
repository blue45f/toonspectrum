// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportStudioAnimaticVideo } from "./studio-animatic-video-export";
import { createStudioAnimaticWorkspace } from "./studio-animatic-workspace";
import { StudioAnimaticWorkspacePanel } from "./StudioAnimaticWorkspacePanel";

vi.mock("./studio-animatic-video-export", () => ({ exportStudioAnimaticVideo: vi.fn() }));
vi.mock("./studio-animatic-workspace-persistence", () => ({ createStudioAnimaticWorkspaceRepository: () => ({}) }));
vi.mock("./use-studio-animatic-media", () => ({
  useStudioAnimaticMedia: () => ({ images: new Map(), audio: new Map(), busy: false, error: null }),
  decodeStudioAnimaticAudio: vi.fn(),
}));
vi.mock("./StudioAnimaticCanvas", () => ({ StudioAnimaticCanvas: () => <div /> }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

function renderWorkspace() {
  const pages = [{ id: "page-1", name: "도입", canvasH: 1080 }];
  const workspace = createStudioAnimaticWorkspace(pages, "work-1");
  return render(<StudioAnimaticWorkspacePanel workScope="work-1" pages={pages} workspace={workspace}
    persistenceStatus={{ busy: false, error: null }} onHydrate={vi.fn()} onCommit={() => true}
    capturePages={vi.fn()} />);
}

describe("storyboard video preparation cancellation", () => {
  it("exposes cancel before the encoder reports progress and aborts pending audio preparation", async () => {
    let requestedSignal: AbortSignal | undefined;
    vi.mocked(exportStudioAnimaticVideo).mockImplementation(({ signal }) => {
      requestedSignal = signal;
      // AudioContext.resume may wait for permission indefinitely, before the first onProgress.
      return new Promise<Blob>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("내보내기를 취소했습니다.", "AbortError")), { once: true });
      });
    });
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "오디오 포함 영상 내보내기" }));
    await waitFor(() => expect(exportStudioAnimaticVideo).toHaveBeenCalledOnce());
    const cancel = screen.getByRole("button", { name: "영상 내보내기 취소" });
    expect(screen.getByRole("progressbar", { name: "스토리보드 작업 진행률" }).getAttribute("value")).toBe("0");
    fireEvent.click(cancel);

    await waitFor(() => expect(requestedSignal?.aborted).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "영상 내보내기 취소" })).toBeNull());
    expect((screen.getByRole("button", { name: "오디오 포함 영상 내보내기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears the initial preparation progress and permits retry after an early encoder rejection", async () => {
    vi.mocked(exportStudioAnimaticVideo).mockRejectedValueOnce(new Error("codec unavailable"));
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "오디오 포함 영상 내보내기" }));

    await waitFor(() => expect(screen.getByText("codec unavailable")).toBeTruthy());
    expect(screen.queryByRole("progressbar", { name: "스토리보드 작업 진행률" })).toBeNull();
    expect(screen.queryByRole("button", { name: "영상 내보내기 취소" })).toBeNull();
    expect((screen.getByRole("button", { name: "오디오 포함 영상 내보내기" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
