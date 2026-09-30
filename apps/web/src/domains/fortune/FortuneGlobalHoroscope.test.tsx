// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FortuneGlobalHoroscope } from "./FortuneGlobalHoroscope";

const okPayload = {
  data: {
    date: "2026-09-30",
    period: "daily",
    sign: "aries",
    horoscope: "Today brings clarity and renewed energy. Trust your instincts.",
  },
};

describe("FortuneGlobalHoroscope", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => okPayload,
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("API 성공 시 글로벌 운세 요약을 보여준다", async () => {
    render(<FortuneGlobalHoroscope signId="aries" signKo="양자리" />);
    await waitFor(() => {
      expect(screen.getByText(/글로벌 점성술/)).toBeTruthy();
    });
    expect(screen.getByText(/양자리/)).toBeTruthy();
  });

  it("API 실패 시 아무것도 렌더하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const { container } = render(<FortuneGlobalHoroscope signId="aries" signKo="양자리" />);
    await waitFor(
      () => {
        expect(container.innerHTML).toBe("");
      },
      { timeout: 10000 }
    );
  });

  it("원문 보기 토글로 영문 원문을 펼친다", async () => {
    const { getByRole } = render(<FortuneGlobalHoroscope signId="aries" signKo="양자리" />);
    await waitFor(() => {
      expect(screen.getByText(/글로벌 점성술/)).toBeTruthy();
    });
    const toggle = getByRole("button", { name: /영문 원문 보기/ });
    fireEvent.click(toggle);
    expect(screen.getByText(/Today brings clarity/)).toBeTruthy();
  });
});
