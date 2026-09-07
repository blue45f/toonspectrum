// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserCompatModal } from "./browser-compat-modal";

vi.mock("../compat/browser-check", () => ({
  getBrowserInfo: () => ({ name: "Test Browser", version: "1", os: "Test OS" }),
  checkBrowserCompatibility: () => ({ missingFeatures: [] }),
}));

const classTokens = (element: HTMLElement) => element.className.split(/\s+/);

describe("BrowserCompatModal touch targets", () => {
  afterEach(() => cleanup());

  it("keeps every visible modal action at least 44px tall", () => {
    render(<BrowserCompatModal isOpen onClose={vi.fn()} />);

    const closeButton = screen.getByRole("button", { name: "닫기" });
    expect(classTokens(closeButton)).toContain("h-11");
    expect(classTokens(closeButton)).toContain("w-11");

    for (const name of ["접속 주소 복사", "새로고침", "호환 모드로 계속하기"]) {
      const button = screen.getByRole("button", { name });
      expect(classTokens(button)).toContain("min-h-11");
      expect(classTokens(button)).not.toContain("h-10");
    }
  });
});
