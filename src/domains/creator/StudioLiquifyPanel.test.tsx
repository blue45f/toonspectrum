// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLiquifyPanel, type StudioLiquifyPanelProps } from "./StudioLiquifyPanel";

function props(overrides: Partial<StudioLiquifyPanelProps> = {}): StudioLiquifyPanelProps {
  return {
    active: false,
    radius: 80,
    strength: 50,
    onToggleActive: vi.fn(),
    onRadiusChange: vi.fn(),
    onStrengthChange: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("StudioLiquifyPanel", () => {
  it("기존 호출부는 Push 기본 모드와 설명을 유지하며 미연결 모드 선택기를 숨긴다", () => {
    render(<StudioLiquifyPanel {...props()} />);
    expect(screen.getByRole("heading", { name: "리퀴파이 · 밀기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "밀어서 왜곡하기 켜기" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "리퀴파이 왜곡 방식" })).toBeNull();
  });

  it("연결된 모드 선택기는 다섯 모드를 노출하고 한 번의 클릭으로 정확한 모드를 전달한다", () => {
    const onModeChange = vi.fn();
    render(<StudioLiquifyPanel {...props({ mode: "pinch", onModeChange })} />);

    const group = screen.getByRole("group", { name: "왜곡 방식" });
    expect(group.querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "오므리기" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "반시계 회전" }));
    expect(onModeChange).toHaveBeenCalledOnce();
    expect(onModeChange).toHaveBeenCalledWith("twirl-counterclockwise");
  });

  it("현재 모드에 맞는 동작·상태 문구를 제공하고 busy 동안 조작을 잠근다", () => {
    render(<StudioLiquifyPanel {...props({ active: true, busy: true, mode: "bloat", onModeChange: vi.fn() })} />);
    expect(screen.getByRole("heading", { name: "리퀴파이 · 부풀리기" })).toBeTruthy();
    expect(screen.getByText("부풀리기 왜곡을 적용하는 중입니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "바깥으로 부풀리기 끄기" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "밀기" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("slider", { name: /브러시 크기/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("slider", { name: /강도/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it("비정상 런타임 mode 값은 안전하게 Push로 표현한다", () => {
    render(<StudioLiquifyPanel {...props({ mode: "corrupt" as StudioLiquifyPanelProps["mode"] })} />);
    expect(screen.getByRole("heading", { name: "리퀴파이 · 밀기" })).toBeTruthy();
  });
});
