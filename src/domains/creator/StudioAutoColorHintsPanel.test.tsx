// @vitest-environment jsdom
// Interactive presentation tests for the thin auto-color hints product panel.
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  planStudioAutoColorHints,
  type StudioAutoColorHintRequest,
} from "./studio-auto-color-hints";
import {
  createStudioAutoColorHintsDemoRequest,
  summarizeStudioAutoColorHintPlan,
} from "./studio-auto-color-hints-summary";
import { StudioAutoColorHintsPanel } from "./StudioAutoColorHintsPanel";

afterEach(() => {
  cleanup();
});

describe("StudioAutoColorHintsPanel presentation", () => {
  it("explains plan-only safety and never claims silent pixel overwrite", () => {
    render(<StudioAutoColorHintsPanel />);

    expect(screen.getByTestId("studio-auto-color-hints-panel")).toBeTruthy();
    expect(
      screen.getByTestId("studio-auto-color-hints-panel").getAttribute(
        "data-studio-auto-color-hints-panel",
      ),
    ).toBe("true");
    expect(screen.getByRole("heading", { name: "자동 채색 힌트" })).toBeTruthy();
    expect(screen.getByText(/픽셀을 조용히 덮어쓰지 않습니다/)).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "계획 전용 — 픽셀 자동 적용 없음" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "힌트 계획 실행" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("자동으로 픽셀을 덮어씁니다");
  });

  it("runs the pure planner on the demo fixture and shows Korean summary metrics", async () => {
    const onPlan = vi.fn();
    render(<StudioAutoColorHintsPanel onPlan={onPlan} />);

    fireEvent.click(screen.getByRole("button", { name: "힌트 계획 실행" }));

    await waitFor(() => {
      expect(screen.getByText(/힌트 계획 준비됨|힌트 계획 차단/)).toBeTruthy();
    });

    expect(onPlan).toHaveBeenCalledTimes(1);
    const plan = onPlan.mock.calls[0]?.[0];
    const summary = summarizeStudioAutoColorHintPlan(plan);
    expect(screen.getByText("영역").parentElement?.textContent).toContain(
      String(summary.regionCount),
    );
    expect(screen.getByText("제안 연산").parentElement?.textContent).toContain(
      String(summary.operationCount),
    );
    expect(screen.getByText("충돌").parentElement?.textContent).toContain(
      String(summary.conflictCount),
    );
    expect(screen.getByText("권장 시드").parentElement?.textContent).toContain(
      String(summary.recommendationCount),
    );
    expect(screen.getByText(/데모 선화로 계산했습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "계획 복사" })).toBeTruthy();
  });

  it("accepts a parent request and custom onRun without rewriting pixels", async () => {
    const request = createStudioAutoColorHintsDemoRequest();
    const customPlan = planStudioAutoColorHints(request);
    const onRun = vi.fn(async (_req: StudioAutoColorHintRequest) => customPlan);

    render(<StudioAutoColorHintsPanel request={request} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "힌트 계획 실행" }));

    await waitFor(() => {
      expect(onRun).toHaveBeenCalledTimes(1);
    });
    expect(onRun.mock.calls[0]?.[0]).toBe(request);
    await waitFor(() => {
      expect(screen.getByText(/힌트 계획 준비됨/)).toBeTruthy();
    });
    expect(screen.queryByText(/데모 선화로 계산했습니다/)).toBeNull();
    expect(screen.getByRole("button", { name: "계획 복사" })).toBeTruthy();
  });

  it("surfaces planner errors without applying any fill", async () => {
    render(
      <StudioAutoColorHintsPanel
        onRun={() => {
          throw new Error("예산 초과 테스트");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "힌트 계획 실행" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("예산 초과 테스트");
    });
    expect(screen.queryByRole("button", { name: "계획 복사" })).toBeNull();
  });
});

describe("StudioAutoColorHintsPanel module boundary", () => {
  it("stays a leaf: no StudioPage / document mutation imports", () => {
    // jsdom env: prefer dirname over `new URL(..., import.meta.url)` (scheme can be non-file).
    const source = readFileSync(
      path.join(import.meta.dirname, "StudioAutoColorHintsPanel.tsx"),
      "utf8"
    );
    expect(source).not.toContain("./StudioPage");
    expect(source).not.toContain("./StudioInspectorAside");
    expect(source).not.toContain("patchEl");
    expect(source).not.toContain("setPages");
    expect(source).toContain("planStudioAutoColorHints");
    expect(source).toContain("summarizeStudioAutoColorHintPlan");
    // Apply is deferred — no advanced fill apply hooks in this thin glue.
    expect(source).not.toContain("applyAdvancedFill");
    expect(source).not.toContain("runStudioAdvancedFill");
  });

  it("exports pure demo + summary entry points used by the panel", () => {
    expect(typeof createStudioAutoColorHintsDemoRequest).toBe("function");
    expect(typeof summarizeStudioAutoColorHintPlan).toBe("function");
    expect(typeof planStudioAutoColorHints).toBe("function");
    expect(typeof StudioAutoColorHintsPanel).toBe("function");
  });
});
