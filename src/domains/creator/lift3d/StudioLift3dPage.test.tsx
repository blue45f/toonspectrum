/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { discImage, verticalGradientImage } from "./studio-lift3d.test-fixture";
import { StudioLift3dPage } from "./StudioLift3dPage";

const decodeStudioLift3dFile = vi.hoisted(() => vi.fn());
const saveStudioLift3dToBg3dLibrary = vi.hoisted(() => vi.fn());

vi.mock("./studio-lift3d-image-decode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studio-lift3d-image-decode")>()),
  decodeStudioLift3dFile,
}));

// 모델 라이브러리는 OPFS·SQLite 그래프를 끌고 온다. 페이지가 그것을 **동적으로만** 부르는지가
// 여기서 확인하려는 계약이라, 모듈 자체를 대체한다.
vi.mock("./studio-lift3d-library-handoff", () => ({ saveStudioLift3dToBg3dLibrary }));

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

function libraryButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /배경 3D 모델로 등록|등록하는 중/u }) as HTMLButtonElement;
}

function decodedDisc() {
  return {
    source: discImage(96),
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/png" as const,
    texture: { mimeType: "image/png" as const, bytes: new Uint8Array([1, 2, 3]) },
    fileName: "주인공",
    naturalWidth: 96,
    naturalHeight: 96,
  };
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
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
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

  it("변환이 끝나면 라이브러리 등록 버튼이 열린다", async () => {
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    saveStudioLift3dToBg3dLibrary.mockResolvedValue({ ok: true, record: { id: "m1" } });
    renderPage();

    expect(libraryButton().disabled).toBe(true);
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });
  });

  it("등록에 성공하면 어디에 올라갔는지 알려준다", async () => {
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    saveStudioLift3dToBg3dLibrary.mockResolvedValue({ ok: true, record: { id: "m1" } });
    renderPage();
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });

    libraryButton().click();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("모델 목록에 등록");
    });
    expect(saveStudioLift3dToBg3dLibrary).toHaveBeenCalledTimes(1);
  });

  it("등록에 실패하면 라이브러리가 준 사유를 그대로 보여준다", async () => {
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    saveStudioLift3dToBg3dLibrary.mockResolvedValue({
      ok: false,
      detail: "3D 모델은 파일 하나당 최대 100MiB까지 등록할 수 있습니다.",
    });
    renderPage();
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });

    libraryButton().click();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("100MiB");
    });
  });

  it("배경 프리셋에는 시차 레이어 슬라이더가, 캐릭터에는 앞쪽 두께 슬라이더가 나온다", () => {
    renderPage("background");
    expect(screen.queryByLabelText(/시차 레이어/u)).not.toBeNull();
    expect(screen.queryByLabelText(/앞쪽 두께 비율/u)).toBeNull();

    cleanup();
    renderPage("character");
    expect(screen.queryByLabelText(/앞쪽 두께 비율/u)).not.toBeNull();
    expect(screen.queryByLabelText(/시차 레이어/u)).toBeNull();
  });

  it("시차 레이어 슬라이더가 실제로 결과를 바꾼다", async () => {
    // 이 슬라이더는 한 번 무동작이었다 — 값이 effect 의존성에는 있는데 요청 객체에는 빠져,
    // 끌 때마다 파이프라인만 다시 돌고 결과는 그대로였다.
    decodeStudioLift3dFile.mockResolvedValue({
      ...decodedDisc(),
      source: verticalGradientImage(96),
    });
    renderPage("background");
    pickFile();
    await waitFor(() => {
      expect(downloadButton().disabled).toBe(false);
    });
    expect(screen.queryByText("레이어")).toBeNull();

    const slider = screen.getByLabelText(/시차 레이어/u) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "4" } });

    // 슬라이더 표시에도 "4층" 이 나오므로 지표 타일(dt + dd) 안에서만 확인한다.
    await waitFor(() => {
      expect(screen.getByText("레이어").parentElement?.textContent).toContain("4층");
    });
  });

  it("고른 이용 권리를 등록 경로에 그대로 넘긴다", async () => {
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    saveStudioLift3dToBg3dLibrary.mockResolvedValue({ ok: true, record: { id: "m1" } });
    renderPage();
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });

    fireEvent.change(screen.getByLabelText("이용 권리"), { target: { value: "owned" } });
    libraryButton().click();

    await waitFor(() => {
      expect(saveStudioLift3dToBg3dLibrary).toHaveBeenCalledWith(
        expect.anything(),
        "owned",
      );
    });
  });

  it("등록 중에 설정을 바꾸면 어느 시점의 모델이 저장됐는지 밝힌다", async () => {
    // 등록은 비동기다. 그 사이에 사용자가 설정을 바꾸면 화면의 모델과 저장된 모델이 달라지는데,
    // 그때도 "등록했습니다" 라고만 하면 지금 보이는 모델이 올라간 줄로 믿게 된다.
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    let release: (value: unknown) => void = () => undefined;
    saveStudioLift3dToBg3dLibrary.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderPage("character");
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });

    libraryButton().click();
    // 등록이 끝나기 전에 두께를 바꿔 다른 결과를 만든다. 변환이 실제로 다시 돌아
    // 새 결과가 나올 때까지 기다린다(변환 중에는 저장 버튼이 잠긴다).
    fireEvent.change(screen.getByLabelText(/앞쪽 두께 비율/u), { target: { value: "0.8" } });
    await waitFor(() => {
      expect(downloadButton().disabled).toBe(true);
    });
    await waitFor(() => {
      expect(downloadButton().disabled).toBe(false);
    });
    release({ ok: true, record: { id: "m1" } });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("누른 시점의 모델");
    });
  });

  it("등록 중에 이용 권리를 바꾸면 어느 표기로 저장됐는지 밝힌다", async () => {
    // 모델은 그대로인데 표기만 바뀌는 경우가 더 위험하다. 화면에는 "공개 이용" 이 떠 있는데
    // 라이브러리에는 "확인 전" 로 박힌 모델이 남고, 무자격 성공 문구가 그 어긋남을 덮는다.
    decodeStudioLift3dFile.mockResolvedValue(decodedDisc());
    let release: (value: unknown) => void = () => undefined;
    saveStudioLift3dToBg3dLibrary.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderPage("character");
    pickFile();
    await waitFor(() => {
      expect(libraryButton().disabled).toBe(false);
    });

    libraryButton().click();
    fireEvent.change(screen.getByLabelText("이용 권리"), { target: { value: "public-domain" } });
    release({ ok: true, record: { id: "m1" } });

    await waitFor(() => {
      const notice = screen.getByRole("status").textContent ?? "";
      expect(notice).toContain("누른 시점의 모델");
      // 저장된 표기는 클릭 시점의 기본값이다. 화면의 새 표기로 말하면 안 된다.
      expect(notice).toContain("확인 전");
      expect(notice).not.toContain("공개 이용(퍼블릭 도메인)");
    });
    expect(saveStudioLift3dToBg3dLibrary).toHaveBeenCalledWith(expect.anything(), "unknown");
  });

  it("라이선스 이름을 받지 않으므로 구매·허가 선택지는 내주지 않는다", () => {
    renderPage();
    const options = Array.from(
      (screen.getByLabelText("이용 권리") as HTMLSelectElement).options,
      (option) => option.value,
    );

    expect(options).toEqual(["unknown", "owned", "public-domain"]);
    expect(options).not.toContain("licensed");
  });
});
