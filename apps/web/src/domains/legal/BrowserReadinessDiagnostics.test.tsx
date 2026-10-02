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
  // jsdom에는 서비스 워커 API가 없으므로 지원되는 브라우저를 흉내 내 개수를 고정한다.
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {},
  });
  writeText.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("BrowserReadinessDiagnostics", () => {
  it("checks browser capabilities locally and copies a non-content report", async () => {
    render(
      <MemoryRouter>
        <BrowserReadinessDiagnostics />
      </MemoryRouter>,
    );

    // 도움말 읽기를 방해하지 않도록 접어 두되, 접힌 제목 줄에 정상 개수를 보여 준다.
    const details = document.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(await screen.findByText("정상 6/6")).toBeTruthy();
    details.open = true;

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

  it("flags a blocked capability in the folded summary so problems are visible without opening it", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(
      <MemoryRouter>
        <BrowserReadinessDiagnostics />
      </MemoryRouter>,
    );
    expect(await screen.findByText("정상 5/6")).toBeTruthy();
    expect(screen.getByText("지원 확인 필요")).toBeTruthy();
  });
});
