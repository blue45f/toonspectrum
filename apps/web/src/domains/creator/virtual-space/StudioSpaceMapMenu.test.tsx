// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_VIRTUAL_SPACE_ZONES } from "./studio-virtual-space-model";
import { StudioSpaceMapMenu } from "./StudioSpaceMapMenu";

afterEach(cleanup);

// 첫 렌더에서 i18n 런타임 초기화가 느릴 수 있어 여유를 둔다.
vi.setConfig({ testTimeout: 30000 });

function renderMenu(overrides: Partial<Parameters<typeof StudioSpaceMapMenu>[0]> = {}) {
  const onTravel = vi.fn();
  const onOpenDestination = vi.fn();
  render(
    <StudioSpaceMapMenu
      onTravel={onTravel}
      onOpenDestination={onOpenDestination}
      {...overrides}
    />,
  );
  return { onTravel, onOpenDestination };
}

describe("StudioSpaceMapMenu", () => {
  it("내장 14개 공간 카드를 모두 렌더한다", () => {
    renderMenu();
    const cards = screen.getAllByRole("button", { name: /로 이동/ });
    expect(cards).toHaveLength(STUDIO_VIRTUAL_SPACE_ZONES.length);
    expect(screen.getByRole("heading", { name: "드로잉 아틀리에" })).not.toBeNull();
  });

  it("카드 클릭 시 onTravel에 공간 id를 전달한다", () => {
    const { onTravel } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "카페 라운지로 이동" }));
    expect(onTravel).toHaveBeenCalledTimes(1);
    expect(onTravel).toHaveBeenCalledWith("lounge");
  });

  it("현재 위치 공간에 뱃지를 표시한다", () => {
    renderMenu({ currentZoneId: "drawing" });
    expect(screen.getByText("현재 위치")).not.toBeNull();
    const card = screen
      .getByRole("button", { name: "드로잉 아틀리에로 이동 (현재 위치)" })
      .closest("article");
    expect(card?.getAttribute("data-current")).toBe("true");
  });

  it("공간별 인원 수를 집계해 표시한다", () => {
    // drawing 존 안에 2명, lobby 존 안에 1명
    renderMenu({
      peers: [
        { x: 400, y: 400 },
        { x: 500, y: 450 },
        { x: 700, y: 870 },
      ],
    });
    expect(screen.getAllByText("2명")).toHaveLength(1);
    expect(screen.getAllByText("1명")).toHaveLength(1);
  });

  it("날씨가 있으면 날씨 칩과 카드 오버레이를 렌더한다", () => {
    const { container } = render(
      <StudioSpaceMapMenu onTravel={vi.fn()} weather="rain" />,
    );
    expect(screen.getByText("바깥 날씨 · 비")).not.toBeNull();
    const overlays = container.querySelectorAll('.studio-space-map-weather[data-effect="rain"]');
    expect(overlays.length).toBe(STUDIO_VIRTUAL_SPACE_ZONES.length);
  });

  it("날씨가 없으면 오버레이를 렌더하지 않는다", () => {
    const { container } = render(<StudioSpaceMapMenu onTravel={vi.fn()} />);
    expect(container.querySelectorAll(".studio-space-map-weather")).toHaveLength(0);
  });

  it("목적지가 있는 공간은 도구 열기 버튼을 보여준다", () => {
    const { onOpenDestination } = renderMenu();
    // drawing 존 카드 안의 도구 버튼을 찾아 클릭 (destination은 "canvas")
    const drawingTravel = screen.getByRole("button", { name: "드로잉 아틀리에로 이동" });
    const drawingCard = drawingTravel.closest("article");
    const toolButton = drawingCard?.querySelector<HTMLButtonElement>(".studio-space-map-tool");
    expect(toolButton).not.toBeNull();
    fireEvent.click(toolButton!);
    expect(onOpenDestination).toHaveBeenCalledTimes(1);
    expect(onOpenDestination.mock.calls[0]![0]).toBe("canvas");
    expect(onOpenDestination.mock.calls[0]![1]).toBe("drawing");
  });

  it("onOpenDestination이 없으면 도구 버튼을 숨긴다", () => {
    render(<StudioSpaceMapMenu onTravel={vi.fn()} onOpenDestination={undefined} />);
    expect(screen.queryByRole("button", { name: /도구 바로 열기/ })).toBeNull();
  });

  it("reducedMotion이면 reduced-motion 클래스가 붙는다", () => {
    const { container } = render(<StudioSpaceMapMenu onTravel={vi.fn()} reducedMotion />);
    expect(
      container.querySelector(".studio-space-map--reduced-motion"),
    ).not.toBeNull();
  });

  it("키보드로 카드에 포커스하고 Enter로 이동한다", () => {
    const { onTravel } = renderMenu();
    const button = screen.getByRole("button", { name: "팀 회의실로 이동" });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onTravel).toHaveBeenCalledWith("meeting");
  });

  it("상주 NPC 4종을 이름·역할 칩으로 보여준다", () => {
    renderMenu();
    const strip = screen.getByLabelText("지금 공간에 있는 NPC");
    expect(strip).not.toBeNull();
    expect(strip.textContent).toContain("모아");
    expect(strip.textContent).toContain("린");
    expect(strip.textContent).toContain("하루");
    expect(strip.textContent).toContain("윤");
    expect(strip.textContent).toContain("바리스타");
  });

  it("npcs가 빈 배열이면 NPC 스트립을 숨긴다", () => {
    render(<StudioSpaceMapMenu onTravel={vi.fn()} npcs={[]} />);
    expect(screen.queryByLabelText("지금 공간에 있는 NPC")).toBeNull();
  });
});
