// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserReadinessDiagnostics } from "./BrowserReadinessDiagnostics";

const writeText = vi.fn(async (_value: string) => undefined);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {},
  });
  writeText.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BrowserReadinessDiagnostics", () => {
  it("checks browser capabilities locally and copies a non-content report", async () => {
    render(
      <MemoryRouter>
        <BrowserReadinessDiagnostics />
      </MemoryRouter>,
    );

    expect(await screen.findByText("WebGL 사용 가능")).toBeTruthy();
    expect(screen.getByText("WebGPU 감지")).toBeTruthy();
    expect(screen.getByText("사용 가능")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "진단 복사" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "복사됨" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain("ToonStudio browser diagnostics");
    expect(writeText.mock.calls[0]?.[0]).toContain("webgl=WebGL 사용 가능");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("project");
  });
});
