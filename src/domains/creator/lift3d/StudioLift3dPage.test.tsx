/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { discImage } from "./studio-lift3d.test-fixture";
import { StudioLift3dPage } from "./StudioLift3dPage";

const decodeStudioLift3dFile = vi.hoisted(() => vi.fn());

vi.mock("./studio-lift3d-image-decode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studio-lift3d-image-decode")>()),
  decodeStudioLift3dFile,
}));

beforeAll(() => {
  // jsdom 에는 object URL 이 없다. 미리보기 <img> 와 GLB 저장 경로가 둘 다 쓴다.
  URL.createObjectURL = vi.fn(() => "blob:studio-lift3d-test");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage(initialSubject: string | null = null) {
  return render(
    <MemoryRouter>
      <StudioLift3dPage initialSubject={initialSubject} />
    </MemoryRouter>,
  );
}

function downloadButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "GLB 파일로 저장" }) as HTMLButtonElement;
}

function pickFile(): void {
  const input = screen.getByLabelText("변환할 이미지 파일");
  const file = new File([new Uint8Array([1, 2, 3])], "주인공.png", { type: "image/png" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("StudioLift3dPage", () => {
  it("인앱 브라우저용 출구와 제목을 렌더링한다", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("2D → 3D 변환");
    expect(document.querySelector('[data-studio-route-exit="editor"]')).not.toBeNull();
    expect(document.querySelector('[data-studio-route-exit="site"]')).not.toBeNull();
  });

  it("주소의 프리셋을 초기 선택으로 존중한다", () => {
    renderPage("background");

    expect((screen.getByRole("radio", { name: /^배경/u }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /^캐릭터/u }) as HTMLInputElement).checked).toBe(false);
  });

  it("알 수 없는 프리셋은 캐릭터로 떨어진다", () => {
    renderPage("hologram");

    expect((screen.getByRole("radio", { name: /^캐릭터/u }) as HTMLInputElement).checked).toBe(true);
  });

  it("원화를 고르면 변환해 지표와 저장 버튼을 연다", async () => {
    const source = discImage(96);
    decodeStudioLift3dFile.mockResolvedValue({
      source,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      texture: { mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      fileName: "주인공",
      naturalWidth: 96,
      naturalHeight: 96,
    });
    renderPage();

    expect(downloadButton().disabled).toBe(true);

    pickFile();

    await waitFor(() => {
      expect(downloadButton().disabled).toBe(false);
    });
    expect(screen.getByText("닫힌 solid")).not.toBeNull();
    expect(screen.getByText("주인공 · 96×96px")).not.toBeNull();
  });

  it("디코드 실패 사유를 그대로 보여주고 변환을 열지 않는다", async () => {
    decodeStudioLift3dFile.mockRejectedValue(
      new Error("이미지를 읽지 못했습니다"),
    );
    renderPage();
    pickFile();

    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });
    expect(downloadButton().disabled).toBe(true);
  });

  it("피사체를 찾지 못하면 사유를 알리고 저장을 막는다", async () => {
    decodeStudioLift3dFile.mockResolvedValue({
      source: { width: 64, height: 64, pixels: new Uint8ClampedArray(64 * 64 * 4) },
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      texture: null,
      fileName: "빈-그림",
      naturalWidth: 64,
      naturalHeight: 64,
    });
    renderPage();
    pickFile();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("피사체를 찾지 못했습니다");
    });
    expect(downloadButton().disabled).toBe(true);
  });
});
