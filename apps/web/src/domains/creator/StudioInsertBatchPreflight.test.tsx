// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioInsertBatchPreflight } from "./StudioInsertBatchPreflight";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

const mocks = vi.hoisted(() => ({
  loadImageFileForCanvas: vi.fn(),
}));

vi.mock("./canvas/studio-canvas-image-io", () => ({
  STUDIO_CANVAS_IMAGE_ACCEPT: "image/*",
  loadImageFileForCanvas: mocks.loadImageFileForCanvas,
}));

function createToolBelt(
  overrides: Partial<StudioToolBeltContentProps> = {},
): {
  readonly toolBelt: StudioToolBeltContentProps;
  readonly addRenderedImage: ReturnType<typeof vi.fn>;
} {
  const addRenderedImage = vi.fn(() => true);
  const toolBelt = {
    activeSurfaceReviewLocked: false,
    canvasH: 1_600,
    selected: null,
    stableHandlers: {
      addRenderedImage,
    },
    ...overrides,
  } as unknown as StudioToolBeltContentProps;
  return { toolBelt, addRenderedImage };
}

function uploadInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("여러 이미지 파일 입력을 찾지 못했습니다.");
  }
  return input;
}

async function stageFiles(
  container: HTMLElement,
  files: readonly File[],
): Promise<void> {
  fireEvent.change(uploadInput(container), {
    target: { files },
  });
  await waitFor(() => {
    expect(
      screen.getByText(new RegExp(`${files.length}개 준비 완료`, "u")),
    ).toBeTruthy();
  });
}

afterEach(cleanup);

beforeEach(() => {
  mocks.loadImageFileForCanvas.mockReset();
  mocks.loadImageFileForCanvas.mockImplementation(async (file: File) => ({
    src: `data:image/png;base64,${file.name}`,
    width: file.name.includes("wide") ? 800 : 320,
    height: file.name.includes("wide") ? 400 : 640,
    isAnimatedGif: file.type === "image/gif",
  }));
});

describe("StudioInsertBatchPreflight", () => {
  it("stages multiple files without mutating the canvas, then inserts deterministic placements", async () => {
    const { toolBelt, addRenderedImage } = createToolBelt();
    const view = render(<StudioInsertBatchPreflight toolBelt={toolBelt} />);

    fireEvent.click(
      screen.getByRole("button", { name: /여러 이미지 한 번에 배치/u }),
    );
    const wide = new File(["wide"], "wide.png", {
      type: "image/png",
      lastModified: 1,
    });
    const portrait = new File(["portrait"], "portrait.png", {
      type: "image/png",
      lastModified: 2,
    });
    await stageFiles(view.container, [wide, portrait]);

    expect(addRenderedImage).not.toHaveBeenCalled();
    expect(
      screen.getByRole("img", {
        name: /2개 이미지의 균형 그리드 배치 미리보기/u,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "portrait.png 위로 이동" }),
    );
    const insertButton = screen.getByRole("button", {
      name: "준비된 이미지 2개 삽입",
    });
    expect((insertButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "준비된 이미지 2개 삽입" }),
    );

    await waitFor(() => expect(addRenderedImage).toHaveBeenCalledTimes(2));
    const first = addRenderedImage.mock.calls[0];
    const second = addRenderedImage.mock.calls[1];
    expect(first?.slice(0, 3)).toEqual([
      "data:image/png;base64,portrait.png",
      320,
      640,
    ]);
    expect(second?.slice(0, 3)).toEqual([
      "data:image/png;base64,wide.png",
      800,
      400,
    ]);
    expect(first?.[5]).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
    expect(second?.[5]).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
    expect(
      await screen.findByText(/2개 이미지를 균형 그리드로 삽입했습니다/u),
    ).toBeTruthy();
    const emptyInsertButton = screen.getByRole("button", {
      name: "준비된 이미지 0개 삽입",
    });
    expect((emptyInsertButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("supports drag-and-drop and clipboard image staging through the same safe loader", async () => {
    const { toolBelt } = createToolBelt();
    const view = render(<StudioInsertBatchPreflight toolBelt={toolBelt} />);
    const section = view.container.querySelector("section");
    if (!(section instanceof HTMLElement)) {
      throw new Error("여러 이미지 배치 구역을 찾지 못했습니다.");
    }

    const dropped = new File(["drop"], "drop.png", {
      type: "image/png",
      lastModified: 3,
    });
    fireEvent.drop(section, {
      dataTransfer: {
        files: [dropped],
        types: ["Files"],
      },
    });
    await waitFor(() =>
      expect(mocks.loadImageFileForCanvas).toHaveBeenCalledWith(dropped),
    );

    const pasted = new File(["paste"], "paste.png", {
      type: "image/png",
      lastModified: 4,
    });
    fireEvent.paste(section, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => pasted,
          },
        ],
      },
    });
    await waitFor(() =>
      expect(mocks.loadImageFileForCanvas).toHaveBeenCalledWith(pasted),
    );
    expect(
      await screen.findByText(/2개 준비 완료/u),
    ).toBeTruthy();
  });

  it("keeps review-locked pages read-only after preflight", async () => {
    const { toolBelt, addRenderedImage } = createToolBelt({
      activeSurfaceReviewLocked: true,
    });
    const view = render(<StudioInsertBatchPreflight toolBelt={toolBelt} />);
    fireEvent.click(
      screen.getByRole("button", { name: /여러 이미지 한 번에 배치/u }),
    );
    await stageFiles(view.container, [
      new File(["locked"], "locked.png", {
        type: "image/png",
        lastModified: 5,
      }),
    ]);

    expect(screen.getByText(/검토 잠금 상태/u)).toBeTruthy();
    const lockedInsertButton = screen.getByRole("button", {
      name: "준비된 이미지 1개 삽입",
    });
    expect((lockedInsertButton as HTMLButtonElement).disabled).toBe(true);
    expect(addRenderedImage).not.toHaveBeenCalled();
  });

  it("surfaces duplicate and decode failures without discarding ready files", async () => {
    mocks.loadImageFileForCanvas.mockImplementation(async (file: File) => {
      if (file.name === "broken.png") {
        throw new Error("이미지 헤더가 손상되었습니다.");
      }
      return {
        src: "data:image/png;base64,ready",
        width: 200,
        height: 100,
        isAnimatedGif: false,
      };
    });
    const { toolBelt } = createToolBelt();
    const view = render(<StudioInsertBatchPreflight toolBelt={toolBelt} />);
    fireEvent.click(
      screen.getByRole("button", { name: /여러 이미지 한 번에 배치/u }),
    );
    const ready = new File(["ready"], "ready.png", {
      type: "image/png",
      lastModified: 6,
    });
    const broken = new File(["broken"], "broken.png", {
      type: "image/png",
      lastModified: 7,
    });
    fireEvent.change(uploadInput(view.container), {
      target: { files: [ready, ready, broken] },
    });

    expect(
      await screen.findByText(/동일한 파일/u),
    ).toBeTruthy();
    expect(
      await screen.findByText("이미지 헤더가 손상되었습니다."),
    ).toBeTruthy();
    const list = screen.getByRole("list");
    expect(within(list).getByText("ready.png")).toBeTruthy();
    expect(within(list).getByText("broken.png")).toBeTruthy();
    const readyInsertButton = screen.getByRole("button", {
      name: "준비된 이미지 1개 삽입",
    });
    expect((readyInsertButton as HTMLButtonElement).disabled).toBe(false);
  });
});
