// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceAppStore } from "./StudioVirtualSpaceAppStore";

afterEach(cleanup);

describe("가상공간 앱 스토어 UI", () => {
  it("앱 목록을 보여주고 상세를 열어 설치한다", () => {
    const onInstalledChange = vi.fn();
    render(<StudioVirtualSpaceAppStore onInstalledChange={onInstalledChange} />);

    expect(screen.getByText("콘티 템플릿 팩")).toBeTruthy();
    expect(screen.getByText("작화 퀴즈")).toBeTruthy();
    expect(screen.getByText("포즈 챌린지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /작화 퀴즈/ }));
    expect(screen.getByText("작화 기초 객관식 퀴즈를 출제하고 바로 채점합니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "설치" }));
    expect(onInstalledChange).toHaveBeenCalledWith(["drawing-quiz"]);
    expect(screen.getByText("설치됨")).toBeTruthy();
  });

  it("설치된 앱을 제거한다", () => {
    const onInstalledChange = vi.fn();
    render(<StudioVirtualSpaceAppStore installedAppIds={["pose-challenge"]} onInstalledChange={onInstalledChange} />);

    fireEvent.click(screen.getByRole("button", { name: /포즈 챌린지/ }));
    fireEvent.click(screen.getByRole("button", { name: "제거" }));
    expect(onInstalledChange).toHaveBeenCalledWith([]);
  });

  it("목록으로 돌아가기를 제공한다", () => {
    render(<StudioVirtualSpaceAppStore />);
    fireEvent.click(screen.getByRole("button", { name: /콘티 템플릿 팩/ }));
    expect(screen.queryByText("포즈 챌린지")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(screen.getByText("포즈 챌린지")).toBeTruthy();
  });
});
