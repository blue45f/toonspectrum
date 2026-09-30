// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonStudioHost, type XrStudioHostDeps } from "./XrWebtoonStudioHost";
import type {
  StudioWebXrSessionController,
  StudioWebXrSupportSnapshot,
} from "../studio-webxr-session";
import type { XrPresenterHandle } from "./xr-webtoon-presenter";

const supportSnapshot: StudioWebXrSupportSnapshot = {
  kind: "toonstudio.studio-webxr-support",
  version: 1,
  secureContext: true,
  immersiveAr: "supported",
  immersiveVr: "supported",
};

function makeStubs() {
  let stateListener: ((state: { status: string; mode?: string }) => void) | null = null;
  const controller: StudioWebXrSessionController = {
    state: { status: "idle" },
    activeSession: null,
    requiresRendererRecreation: false,
    inspectSupport: vi.fn(async () => supportSnapshot),
    start: vi.fn(async (mode: "immersive-ar" | "immersive-vr") => {
      stateListener?.({ status: "presenting", mode });
      return {} as XRSession;
    }),
    end: vi.fn(async () => {
      stateListener?.({ status: "idle" });
    }),
    dispose: vi.fn(async () => undefined),
  };
  const createController = vi.fn(
    (options: {
      onStateChange?: (state: { status: string; mode?: string }) => void;
    }) => {
      stateListener = options.onStateChange ?? null;
      return controller;
    },
  );
  const presenter: XrPresenterHandle = {
    port: {
      get enabled() {
        return false;
      },
      set enabled(_value: boolean) {
        /* stub */
      },
      get isPresenting() {
        return false;
      },
      setReferenceSpaceType() {
        /* stub */
      },
      setSession() {
        return Promise.resolve();
      },
      getSession() {
        return null;
      },
    },
    applyVrmStaging: vi.fn(),
    captureCut: vi.fn(async () => "data:image/png;base64,AAA"),
    dispose: vi.fn(),
  };
  const deps: XrStudioHostDeps = {
    loadSessionRuntime: async () => ({
      createStudioWebXrSessionController: createController as unknown as (
        options: import("../studio-webxr-session").CreateStudioWebXrSessionControllerOptions,
      ) => import("../studio-webxr-session").StudioWebXrSessionController,
      studioWebXrSessionErrorMessage: (code: string) => `ERR:${code}`,
    }),
    createPresenter: vi.fn(async () => presenter),
  };
  return { controller, createController, presenter, deps };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("XrWebtoonStudioHost", () => {
  it("마운트 시 WebXR 지원을 프로브하고 프리젠터는 아직 만들지 않는다", async () => {
    const { createController, deps } = makeStubs();
    render(<XrWebtoonStudioHost deps={deps} />);
    await waitFor(() => expect(createController).toHaveBeenCalled());
    expect(deps.createPresenter).not.toHaveBeenCalled();
    expect(screen.getByText("XR 웹툰 스튜디오")).toBeTruthy();
  });

  it("AR 시작 버튼을 누르면 세션이 시작되고 종료할 수 있다", async () => {
    const { controller, presenter, deps } = makeStubs();
    render(<XrWebtoonStudioHost deps={deps} />);
    fireEvent.click(screen.getByRole("tab", { name: /AR 프리뷰/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "AR로 캐릭터 보기" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "AR로 캐릭터 보기" }));
    await waitFor(() => expect(controller.start).toHaveBeenCalledWith("immersive-ar"));
    expect(deps.createPresenter).toHaveBeenCalledTimes(1);
    expect(presenter.captureCut).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("AR 실행 중")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "AR 종료하기" }));
    await waitFor(() => expect(controller.end).toHaveBeenCalled());
  });

  it("세션 시작이 실패하면 오류를 role=alert로 알린다", async () => {
    const stubs = makeStubs();
    stubs.controller.start = vi.fn(async () => {
      throw new Error("boom");
    });
    render(<XrWebtoonStudioHost deps={stubs.deps} />);
    fireEvent.click(screen.getByRole("tab", { name: /AR 프리뷰/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "AR로 캐릭터 보기" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "AR로 캐릭터 보기" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });

  it("3D→컷 탭에서 캡처하면 PNG 다운로드를 트리거한다", async () => {
    const { presenter, deps } = makeStubs();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<XrWebtoonStudioHost deps={deps} />);
    fireEvent.click(screen.getByRole("tab", { name: /3D→컷/ }));
    fireEvent.click(screen.getByRole("button", { name: "웹툰 컷으로 만들기" }));
    await waitFor(() => expect(presenter.captureCut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/렌더가 끝났습니다/)).toBeTruthy(),
    );
    const anchor = document.querySelector("a[download]") as HTMLAnchorElement | null;
    expect(clickSpy).toHaveBeenCalled();
    expect(anchor).toBeNull(); // 사용 후 제거됨
  });

  it("VRM 탭에서 배치하면 프리젠터 캐릭터에 반영된다", async () => {
    const { presenter, deps } = makeStubs();
    render(<XrWebtoonStudioHost deps={deps} />);
    fireEvent.click(screen.getByRole("tab", { name: /VRM 배치/ }));
    fireEvent.click(screen.getByRole("button", { name: "컷에 캐릭터 배치" }));
    await waitFor(() => expect(presenter.applyVrmStaging).toHaveBeenCalledTimes(1));
    const spec = (presenter.applyVrmStaging as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(spec.kind).toBe("toonstudio.xr-vrm-staging");
  });
});
