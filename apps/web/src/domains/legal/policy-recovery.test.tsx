// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrivacyPage, TermsPage } from "./PolicyPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("first-party legal policy availability", () => {
  it.each([
    ["개인정보처리방침", PrivacyPage, "4. 기기 내 AI 기능과 MediaPipe"],
    ["이용약관", TermsPage, "제1조 (목적)"],
  ] as const)(
    "%s remains readable without API or external publication access",
    (title, Page, expectedBody) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      render(<Page />);

      expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
      expect(screen.getByText(expectedBody)).toBeTruthy();
      expect(screen.getByText("툰스펙트럼 게시 정책")).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("TermsDesk");
      expect(document.body.innerHTML).not.toContain("vercel.app");
    },
  );
});
