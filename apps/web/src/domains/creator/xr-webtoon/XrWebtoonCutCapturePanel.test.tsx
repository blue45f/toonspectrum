// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonCutCapturePanel } from "./XrWebtoonCutCapturePanel";
import type { XrCutCaptureJob } from "./xr-webtoon-cut-capture";

afterEach(() => {
  cleanup();
});

describe("XrWebtoonCutCapturePanel", () => {
  it("장면이 없으면 빈 상태 다음 행동 안내를 보여준다", () => {
    render(<XrWebtoonCutCapturePanel onCapture={vi.fn()} />);
    expect(screen.getByText(/3D 장면이 아직 없어요/)).toBeTruthy();
  });

  it("화면비 버튼을 선택하면 aria-pressed가 바뀐다", () => {
    render(<XrWebtoonCutCapturePanel sceneName="거리" onCapture={vi.fn()} />);
    const ratio916 = screen.getByRole("button", { name: "9:16" });
    expect(ratio916.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ratio916);
    expect(ratio916.getAttribute("aria-pressed")).toBe("true");
  });

  it("'웹툰 컷으로 만들기'를 누르면 현재 job으로 onCapture가 호출된다", () => {
    const onCapture = vi.fn();
    render(<XrWebtoonCutCapturePanel sceneName="거리" onCapture={onCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "9:16" }));
    fireEvent.click(screen.getByRole("button", { name: "웹툰 컷으로 만들기" }));
    expect(onCapture).toHaveBeenCalledTimes(1);
    const job = onCapture.mock.calls[0]?.[0] as XrCutCaptureJob;
    expect(job.kind).toBe("toonstudio.xr-cut-capture-job");
    expect(job.aspect.id).toBe("cut-9-16");
    expect(job.widthPx).toBe(450);
    expect(job.heightPx).toBe(800);
    expect(job.style.toonShading).toBe(true);
  });

  it("고급 설정은 접혀 있고 하프톤을 켤 수 있다", () => {
    const onCapture = vi.fn();
    render(<XrWebtoonCutCapturePanel sceneName="거리" onCapture={onCapture} />);
    const details = document.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByLabelText("하프톤 그라데이션"));
    fireEvent.click(screen.getByRole("button", { name: "웹툰 컷으로 만들기" }));
    const job = onCapture.mock.calls[0]?.[0] as XrCutCaptureJob;
    expect(job.style.halftone).toBe(true);
  });

  it("출력 파일명이 화면에 표시된다", () => {
    render(<XrWebtoonCutCapturePanel sceneName="거리" onCapture={vi.fn()} />);
    // 기본: cut-4-5, 긴 변 800 → 640×800
    expect(screen.getByText(/toonstudio-cut-cut-4-5-640x800\.png/)).toBeTruthy();
  });

  it("onCapture가 없으면 버튼이 비활성화된다", () => {
    render(<XrWebtoonCutCapturePanel sceneName="거리" />);
    expect(
      (screen.getByRole("button", { name: "웹툰 컷으로 만들기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
