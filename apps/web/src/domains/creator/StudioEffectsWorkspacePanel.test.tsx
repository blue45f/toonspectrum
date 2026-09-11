// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioEffectsWorkspacePanel } from "./StudioEffectsWorkspacePanel";

const EMPTY = { version: 1 as const, entries: [] };

afterEach(() => cleanup());

describe("StudioEffectsWorkspacePanel", () => {
  it("renders featured production recipes and an honest relative-cost diagnostic", () => {
    render(<StudioEffectsWorkspacePanel stack={EMPTY} onChange={vi.fn()} />);

    expect(screen.getByText("웹툰 레시피 · 렌더 진단")).not.toBeNull();
    expect(screen.getByText("스캔 원고 복원")).not.toBeNull();
    expect(screen.getByText("속도·충격")).not.toBeNull();
    expect(screen.getByText(/부하 점수는 기기 시간이 아닌 상대적 휴리스틱/u)).not.toBeNull();
    expect(screen.getByRole("button", { name: /전체 15개 레시피 보기/u })).not.toBeNull();
  });

  it("applies a featured recipe to the canonical adjustment stack", () => {
    const onChange = vi.fn();
    render(<StudioEffectsWorkspacePanel stack={EMPTY} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", {
      name: "또렷한 먹선 레시피 현재 스택에 추가",
    }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0];
    expect(next.entries.map((entry: { engine: string }) => entry.engine)).toEqual([
      "levels",
      "difference-of-gaussians",
      "smart-sharpen",
    ]);
  });

  it("makes replacement mode explicit and removes the previous stack only after recipe apply", () => {
    const onChange = vi.fn();
    render(
      <StudioEffectsWorkspacePanel
        stack={{
          version: 1,
          entries: [{ id: "old", engine: "invert", enabled: true, params: {} }],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "현재 스택 교체" }));
    fireEvent.click(screen.getByRole("button", {
      name: "흑백 스크린톤 레시피 현재 스택 교체",
    }));

    const next = onChange.mock.calls[0]?.[0];
    expect(next.entries.some((entry: { id: string }) => entry.id === "old")).toBe(false);
    expect(next.entries.map((entry: { engine: string }) => entry.engine)).toEqual([
      "grayscale",
      "levels",
      "color-halftone",
    ]);
  });

  it("requires an explicit second action before clearing every effect", () => {
    const onChange = vi.fn();
    render(
      <StudioEffectsWorkspacePanel
        stack={{
          version: 1,
          entries: [{ id: "active", engine: "invert", enabled: true, params: {} }],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 효과 제거" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "전체 효과 제거 확인" })).not.toBeNull();
    expect(screen.getByText(/같은 버튼을 한 번 더 누르세요/u)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "전체 효과 제거 확인" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual({ version: 1, entries: [] });
  });

  it("filters by production intent and supports no-result recovery", () => {
    render(<StudioEffectsWorkspacePanel stack={EMPTY} onChange={vi.fn()} />);
    const search = screen.getByRole("searchbox", { name: "효과 레시피 검색" });

    fireEvent.change(search, { target: { value: "glitch" } });
    expect(screen.getByText("디지털 글리치")).not.toBeNull();
    expect(screen.queryByText("스캔 원고 복원")).toBeNull();

    fireEvent.change(search, { target: { value: "존재하지않는효과" } });
    expect(screen.getByText("일치하는 레시피가 없습니다")).not.toBeNull();
  });
});
