// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceMinimap, type StudioMinimapPeer } from "./StudioVirtualSpaceMinimap";
import {
  clampToWorld,
  createMinimapViewport,
  minimapToWorld,
  type StudioMinimapScreen,
  type StudioMinimapZone,
} from "./studio-virtual-space-minimap";

afterEach(cleanup);

const zones: readonly StudioMinimapZone[] = [
  { id: "meeting", labelKo: "팀 회의실", labelEn: "Team Meeting Rooms", x: 950, y: 590, width: 290, height: 260, kind: "private" },
  { id: "live", labelKo: "크리에이터 플라자", labelEn: "Creator Plaza", x: 640, y: 590, width: 280, height: 220, kind: "spotlight" },
  { id: "drawing", labelKo: "드로잉 아틀리에", labelEn: "Drawing Atelier", x: 340, y: 300, width: 290, height: 230, kind: "silent" },
  { id: "lobby", labelKo: "스튜디오 로비", labelEn: "Studio Lobby", x: 640, y: 840, width: 280, height: 100, kind: "public" },
];

const screens: readonly StudioMinimapScreen[] = [
  { id: "review-screen", x: 700, y: 330, width: 120, height: 24 },
];

const peers: readonly StudioMinimapPeer[] = [
  { id: "peer-1", name: "밍", x: 400, y: 400 },
  { id: "self", name: "나", x: 700, y: 870 },
];

function renderMinimap(onTeleport = vi.fn()) {
  render(
    <StudioVirtualSpaceMinimap
      worldWidth={1280}
      worldHeight={960}
      zones={zones}
      screens={screens}
      peers={peers}
      selfId="self"
      onTeleport={onTeleport}
    />,
  );
  return onTeleport;
}

describe("StudioVirtualSpaceMinimap", () => {
  it("구역·스크린·아바타를 축소 렌더한다", () => {
    renderMinimap();
    expect(screen.getByLabelText("미니맵")).not.toBeNull();
    // 구역 4개 + 스크린 1개 + 아바타 2개 + 목적지 마커 없음
    const svg = screen.getByLabelText("공간 미니맵. 텔레포트 목적지 선택.");
    expect(svg.querySelectorAll("polygon")).toHaveLength(4);
    expect(svg.querySelectorAll("rect")).toHaveLength(1);
    expect(svg.querySelectorAll("circle")).toHaveLength(2);
    const zoneTitles = [...svg.querySelectorAll("polygon title")].map((node) => node.textContent);
    expect(zoneTitles).toContain("팀 회의실");
  });

  it("범례에 네 가지 구역 종류를 한글로 표시한다", () => {
    renderMinimap();
    const legend = screen.getByLabelText("구역 범례");
    const text = legend.textContent ?? "";
    for (const label of ["퍼블릭", "프라이빗", "사일런트", "스포트라이트"]) {
      expect(text).toContain(label);
    }
  });

  it("클릭한 지점을 월드 좌표로 바꿔 onTeleport을 호출한다", () => {
    const onTeleport = renderMinimap();
    const svg = screen.getByLabelText("공간 미니맵. 텔레포트 목적지 선택.");
    // jsdom의 getBoundingClientRect는 0이므로 client 좌표가 미니맵 좌표가 된다
    fireEvent.click(svg, { clientX: 100, clientY: 100 });
    const viewport = createMinimapViewport(1280, 960, 260, 200);
    const expected = clampToWorld(viewport, minimapToWorld(viewport, { x: 100, y: 100 }));
    expect(onTeleport).toHaveBeenCalledTimes(1);
    expect(onTeleport).toHaveBeenCalledWith(expected.x, expected.y);
  });

  it("키보드로 목적지를 정하고 Enter를 누르면 텔레포트한다", () => {
    const onTeleport = renderMinimap();
    const svg = screen.getByLabelText("공간 미니맵. 텔레포트 목적지 선택.");
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(onTeleport).toHaveBeenCalledTimes(1);
    const [x, y] = onTeleport.mock.calls[0] as [number, number];
    // 중심(640, 480)에서 오른쪽으로 40px 이동
    expect(x).toBeCloseTo(680, 1);
    expect(y).toBeCloseTo(480, 1);
  });

  it("클릭 후 목적지 마커를 표시한다", () => {
    renderMinimap();
    const svg = screen.getByLabelText("공간 미니맵. 텔레포트 목적지 선택.");
    fireEvent.click(svg, { clientX: 100, clientY: 100 });
    const markerTitles = [...svg.querySelectorAll("circle title")].map((node) => node.textContent);
    expect(markerTitles).toContain("텔레포트 목적지");
  });
});
