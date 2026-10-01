// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrushLabApp } from "./BrushLabApp";

afterEach(cleanup);

describe("BrushLabApp", () => {
  it("실험 앱 셸을 렌더링한다", () => {
    render(<BrushLabApp />);
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio Brush Lab" })).toBeTruthy();
    expect(screen.getByText("실험 앱 · 배포 대상 아님")).toBeTruthy();
  });
});
