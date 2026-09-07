// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { StudioBg3dTurntableController } from "./StudioBg3dTurntableController";

describe("StudioBg3dTurntableController", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggles rotation state on button click", () => {
    const handleToggle = vi.fn();
    render(<StudioBg3dTurntableController onToggleRotation={handleToggle} />);

    const btn = screen.getByText("턴테이블 회전");
    fireEvent.click(btn);

    expect(handleToggle).toHaveBeenCalledWith(true);
    expect(screen.getByText("턴테이블 정지")).toBeDefined();
  });

  it("handles direction toggle", () => {
    const handleSpeed = vi.fn();
    render(<StudioBg3dTurntableController onSpeedChange={handleSpeed} />);

    const dirBtn = screen.getByTitle("회전 방향 전환");
    fireEvent.click(dirBtn);

    expect(handleSpeed).toHaveBeenCalledWith(-2.0);
  });

  it("uses the current parent rotation state after a pause or replacement", () => {
    const toggle = vi.fn();
    const view = render(<StudioBg3dTurntableController isRotating onToggleRotation={toggle} />);
    view.rerender(<StudioBg3dTurntableController isRotating={false} onToggleRotation={toggle} />);
    fireEvent.click(screen.getByRole("button", { name: "턴테이블 회전" }));
    expect(toggle).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "턴테이블 회전" }).getAttribute("aria-pressed")).toBe("false");
    view.rerender(<StudioBg3dTurntableController isRotating onToggleRotation={toggle} />);
    fireEvent.click(screen.getByRole("button", { name: "턴테이블 정지" }));
    expect(toggle).toHaveBeenLastCalledWith(false);
  });

  it("keeps speed and direction consistent across changes", () => {
    const speed = vi.fn();
    render(<StudioBg3dTurntableController onSpeedChange={speed} />);
    const slider = screen.getByRole("slider", { name: "턴테이블 회전 속도" });
    fireEvent.change(slider, { target: { value: "4" } });
    expect(speed).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "회전 방향 전환" }));
    expect(speed).toHaveBeenLastCalledWith(-4);
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(speed).toHaveBeenLastCalledWith(-0.5);
    expect(slider.getAttribute("aria-valuetext")).toBe("0.5 RPM");
    fireEvent.click(screen.getByRole("button", { name: "회전 방향 전환" }));
    expect(speed).toHaveBeenLastCalledWith(0.5);
  });

  it("disables every adjustment while the scene is locked", () => {
    const toggle = vi.fn();
    const speed = vi.fn();
    render(<StudioBg3dTurntableController disabled onToggleRotation={toggle} onSpeedChange={speed} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
    }
    expect(screen.getByRole("slider", { name: "턴테이블 회전 속도" }).hasAttribute("disabled")).toBe(true);
    expect(toggle).not.toHaveBeenCalled();
    expect(speed).not.toHaveBeenCalled();
  });

  it("restores the parent's speed and direction when a temporary scene mode remounts it", () => {
    const speed = vi.fn();
    const view = render(<StudioBg3dTurntableController isRotating speedRpm={-8} onSpeedChange={speed} />);
    view.unmount();
    render(<StudioBg3dTurntableController isRotating speedRpm={-8} onSpeedChange={speed} />);
    const slider = screen.getByRole("slider", { name: "턴테이블 회전 속도" });
    expect(slider.getAttribute("aria-valuetext")).toBe("8.0 RPM");
    expect(screen.getByRole("button", { name: "회전 방향 전환" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "회전 방향 전환" }));
    expect(speed).toHaveBeenLastCalledWith(8);
    expect(screen.getByRole("button", { name: "턴테이블 정지" }).getAttribute("aria-pressed")).toBe("true");
  });
});
