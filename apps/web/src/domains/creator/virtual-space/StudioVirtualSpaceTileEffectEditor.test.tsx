// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceTileEffectEditor } from "./StudioVirtualSpaceTileEffectEditor";
import { createTileEffect } from "./studio-virtual-space-tile-effects";

afterEach(cleanup);

function portalEffect() {
  const result = createTileEffect({
    kind: "portal", id: "portal-existing", tileX: 8, tileY: 8,
    destinationRoom: "recording-booth", destinationTileX: 6, destinationTileY: 4,
  });
  if (!result.ok) throw new Error("fixture 생성 실패");
  return result.effect;
}

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("타일 이펙트 에디터", () => {
  it("이펙트 종류를 고르고 포털을 추가하면 onChange로 살균된 정의가 전달된다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "이펙트 종류" }), { target: { value: "portal" } });
    fill(screen.getByLabelText("표시 이름 (선택)"), "콘티룸 출구");
    fill(screen.getByLabelText("목적지 구역(방) ID"), " recording-booth ");
    fill(screen.getByLabelText("타일 X"), "8");
    fill(screen.getByLabelText("타일 Y"), "8");
    fill(screen.getByLabelText("목적지 타일 X"), "6");
    fill(screen.getByLabelText("목적지 타일 Y"), "4");
    fireEvent.click(screen.getByRole("button", { name: "이펙트 추가" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0]?.[0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      kind: "portal", name: "콘티룸 출구", tileX: 8, tileY: 8,
      destinationRoom: "recording-booth", destinationTileX: 6, destinationTileY: 4,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("URL 없이 유튜브 이펙트를 추가하면 오류를 보여주고 추가하지 않는다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "이펙트 종류" }), { target: { value: "youtube" } });
    fireEvent.click(screen.getByRole("button", { name: "이펙트 추가" }));
    expect(onChange).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("URL을 입력해 주세요.");
  });

  it("BGM 이펙트는 반경·볼륨과 함께 추가된다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "이펙트 종류" }), { target: { value: "bgm" } });
    fill(screen.getByLabelText("URL"), "/assets/virtual-studio/ambient-audio/gentle-window-rain.ogg");
    fill(screen.getByLabelText("재생 반경 (타일)"), "5");
    fill(screen.getByLabelText("볼륨 (0–1)"), "0.8");
    fireEvent.click(screen.getByRole("button", { name: "이펙트 추가" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0]?.[0];
    expect(added[0]).toMatchObject({ kind: "bgm", radius: 5, volume: 0.8 });
  });

  it("구역 태그를 고르고 지정 영역을 추가한다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "이펙트 종류" }), { target: { value: "zone" } });
    fireEvent.change(screen.getByRole("combobox", { name: "구역 태그" }), { target: { value: "silent" } });
    fill(screen.getByLabelText("가로 (타일)"), "3");
    fill(screen.getByLabelText("세로 (타일)"), "2");
    fireEvent.click(screen.getByRole("button", { name: "이펙트 추가" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0]?.[0];
    expect(added[0]).toMatchObject({ kind: "zone", zoneTag: "silent", width: 3, height: 2 });
  });

  it("프리셋 버튼으로 콘티룸↔녹음부스 양방향 포털 쌍을 추가한다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "콘티룸 ↔ 녹음부스 포털 쌍 추가" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const added = onChange.mock.calls[0]?.[0];
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ kind: "portal", destinationRoom: "recording-booth" });
    expect(added[1]).toMatchObject({ kind: "portal", destinationRoom: "conti-room" });
    expect(added[0].id).not.toBe(added[1].id);
  });

  it("배치 목록에서 이펙트를 삭제한다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceTileEffectEditor effects={[portalEffect()]} onChange={onChange} />);
    expect(screen.getAllByText(/배치 목록/)).not.toHaveLength(0);
    expect(screen.getByText(/recording-booth/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이펙트 portal-existing 삭제" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(0);
  });

  it("빈 목록에서는 안내 문구를 보여준다", () => {
    render(<StudioVirtualSpaceTileEffectEditor effects={[]} onChange={vi.fn()} />);
    expect(screen.getByText("아직 배치된 이펙트가 없어요.")).toBeTruthy();
  });
});
