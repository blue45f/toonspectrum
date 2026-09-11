// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioMarketplaceSellerPanel } from "./StudioMarketplaceSellerPanel";

const DIGEST = new Uint8Array(32).fill(0xab).buffer;

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      subtle: {
        digest: vi.fn().mockResolvedValue(DIGEST),
      },
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioMarketplaceSellerPanel", () => {
  it("persists a real draft and never presents a remote upload as complete", async () => {
    render(<StudioMarketplaceSellerPanel sellerId="seller-1" locale="ko" />);

    fireEvent.change(screen.getByLabelText("에셋 이름"), {
      target: { value: "웹툰 잉크 브러시" },
    });
    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "필압과 기울기를 지원하는 전문 선화 브러시입니다." },
    });
    fireEvent.change(screen.getByLabelText("기술 품질 점수"), {
      target: { value: "94" },
    });
    fireEvent.click(screen.getByLabelText(/참조 원본과 포함 파일의 판매 권리/u));

    await waitFor(() => {
      const raw = window.localStorage.getItem(
        "toonspectrum:studio-marketplace-submission:v1:seller-1",
      );
      expect(raw).toContain("웹툰 잉크 브러시");
      expect(raw).toContain('"qualityScore":94');
    });
    expect(document.body.textContent).not.toMatch(/업로드 완료|판매 완료|공개 완료/u);
  });

  it("hashes selected product and preview files before review", async () => {
    render(<StudioMarketplaceSellerPanel sellerId="seller-files" locale="ko" />);

    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const product = new File(["brush-data"], "ink.toon-brush", {
      type: "application/octet-stream",
    });
    const preview = new File(["preview-data"], "preview.png", {
      type: "image/png",
    });
    fireEvent.change(inputs[0]!, { target: { files: [product] } });
    fireEvent.change(inputs[1]!, { target: { files: [preview] } });

    await waitFor(() => {
      expect(globalThis.crypto.subtle.digest).toHaveBeenCalledTimes(2);
      const raw = window.localStorage.getItem(
        "toonspectrum:studio-marketplace-submission:v1:seller-files",
      );
      expect(raw).toContain("primary/ink.toon-brush");
      expect(raw).toContain("preview/preview.png");
      expect(raw).toContain(`sha256:${"ab".repeat(32)}`);
    });
  });

  it("enables a review request only after required quality and rights checks", async () => {
    render(<StudioMarketplaceSellerPanel sellerId="seller-ready" locale="ko" />);

    fireEvent.change(screen.getByLabelText("에셋 이름"), {
      target: { value: "웹툰 잉크 브러시" },
    });
    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "필압과 기울기를 지원하는 전문 선화 브러시입니다." },
    });
    fireEvent.change(screen.getByLabelText("기술 품질 점수"), {
      target: { value: "94" },
    });
    fireEvent.click(screen.getByLabelText(/참조 원본과 포함 파일의 판매 권리/u));

    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(inputs[0]!, {
      target: { files: [new File(["brush"], "ink.toon-brush")] },
    });
    fireEvent.change(inputs[1]!, {
      target: { files: [new File(["preview"], "preview.png")] },
    });

    const submit = await screen.findByRole("button", { name: "심사 요청 준비" });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText("심사 중")).toBeTruthy();
      expect(document.body.textContent).toContain("서버 연결 시 안전하게 제출");
    });
  });
});
