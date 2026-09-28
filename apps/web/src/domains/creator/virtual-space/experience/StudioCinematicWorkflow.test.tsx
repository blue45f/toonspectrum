// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceEnvironmentPanel } from "../StudioVirtualSpaceEnvironmentPanel";
import { StudioVirtualSpacePlaceGallery } from "../StudioVirtualSpacePlaceGallery";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "../studio-virtual-space-environment-preference";
import { STUDIO_ATMOSPHERE_PRESETS } from "./studio-atmosphere-presets";

afterEach(cleanup);
describe("실제 공간 패널의 프리셋과 검색", () => {
  it.each(STUDIO_ATMOSPHERE_PRESETS)("$labelKo를 한 번의 환경 변경으로 적용한다", (preset) => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceEnvironmentPanel value={DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `${preset.labelKo} 적용` }));
    expect(onChange).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledWith(preset.value);
    view.rerender(<StudioVirtualSpaceEnvironmentPanel value={preset.value} onChange={onChange} />);
    expect(screen.getByRole("button", { name: `${preset.labelKo} 적용` }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain(preset.labelKo);
  });
  it("수동 환경 수정은 다른 설정을 유지하고 직접 설정으로 표시한다", () => {
    const value = { version: 1 as const, backdrop: "sky" as const, dayPhase: "day" as const, weather: "snow" as const };
    const onChange = vi.fn();
    render(<StudioVirtualSpaceEnvironmentPanel value={value} onChange={onChange} />);
    expect(screen.getByRole("status").textContent).toBe("직접 설정한 분위기");
    fireEvent.click(screen.getByRole("button", { name: "밤" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, dayPhase: "night" });
  });
  it("전각·공백을 정규화하고 분류와 결합하며 이동 없이 초기화한다", () => {
    const move = vi.fn();
    render(<StudioVirtualSpacePlaceGallery personal currentPlaceId="skyport" onSelectPlace={move} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "장소 검색" }), { target: { value: "ＳＴＯＲＹ   LAB" } });
    expect(screen.getByRole("heading", { name: "스토리 랩" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "스카이 포트" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^검수$/u }));
    expect(screen.getByRole("status").textContent).toContain("조건에 맞는 장소가 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "전체 장소 보기" }));
    expect(screen.getByRole("heading", { name: "스카이 포트" })).toBeTruthy();
    expect(move).not.toHaveBeenCalled();
  });
  it("프로젝트에서 개인 공간으로 전환해도 사라진 분류에 갇히지 않는다", () => {
    const move = vi.fn();
    const view = render(<StudioVirtualSpacePlaceGallery personal={false} currentPlaceId="skyport" onSelectPlace={move} />);
    fireEvent.click(screen.getByRole("button", { name: /^협업$/u }));
    expect(screen.getByRole("heading", { name: "팀 미팅 로프트" })).toBeTruthy();
    view.rerender(<StudioVirtualSpacePlaceGallery personal currentPlaceId="skyport" onSelectPlace={move} />);
    expect(screen.queryByRole("heading", { name: "팀 미팅 로프트" })).toBeNull();
    expect(screen.getByRole("button", { name: /^전체$/u }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "스카이 포트" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "장소 검색" }), { target: { value: "team meeting" } });
    expect(screen.getByRole("status").textContent).toContain("조건에 맞는 장소가 없습니다");
    expect(move).not.toHaveBeenCalled();
  });
});
