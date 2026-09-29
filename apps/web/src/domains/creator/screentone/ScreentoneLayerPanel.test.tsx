// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScreentoneLayerPanel } from "./ScreentoneLayerPanel";

import { normalizeScreentoneLayer } from "./screentone-layer";

describe("ScreentoneLayerPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("헤더·망점 종류·슬라이더·미리보기를 렌더한다", () => {
    render(
      <ScreentoneLayerPanel
        value={normalizeScreentoneLayer({ density: 40 })}
        onChange={() => {}}
      />
    );

    expect(screen.getByText("스크린톤 레이어")).toBeDefined();
    expect(screen.getByText("도트")).toBeDefined();
    expect(screen.getByText("사선")).toBeDefined();
    expect(screen.getByText("모래망점")).toBeDefined();
    expect(screen.getByText("격자")).toBeDefined();
    expect(screen.getByLabelText("선 수 조절")).toBeDefined();
    expect(screen.getByLabelText("농도 조절")).toBeDefined();
    expect(screen.getByLabelText("각도 조절")).toBeDefined();
    expect(screen.getByLabelText("스크린톤 미리보기")).toBeDefined();
    expect(screen.getByText("그라데이션 톤")).toBeDefined();
  });

  it("톤 Off 상태에서 토글을 누르면 기본 농도로 켜진다", () => {
    const onChange = vi.fn();
    render(<ScreentoneLayerPanel value={normalizeScreentoneLayer({ density: 0 })} onChange={onChange} />);

    const toggle = screen.getByRole("button", { name: "톤 Off" });
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ density: 40 }));
  });

  it("톤 On 상태에서 토글을 누르면 농도 0으로 꺼진다", () => {
    const onChange = vi.fn();
    render(
      <ScreentoneLayerPanel value={normalizeScreentoneLayer({ density: 40 })} onChange={onChange} />
    );

    const toggle = screen.getByRole("button", { name: "톤 On" });
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ density: 0 }));
  });

  it("망점 종류 버튼 클릭 시 onChange가 호출된다", () => {
    const onChange = vi.fn();
    render(
      <ScreentoneLayerPanel value={normalizeScreentoneLayer({ density: 40 })} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "사선" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "line", density: 40 }));
  });

  it("선 수 슬라이더 변경 시 onChange가 호출된다", () => {
    const onChange = vi.fn();
    render(
      <ScreentoneLayerPanel value={normalizeScreentoneLayer({ density: 40 })} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("선 수 조절"), { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lines: 60 }));
  });

  it("모래망점 선택 시 시드 UI가 보이고 다시 섞기가 동작한다", () => {
    const onChange = vi.fn();
    render(
      <ScreentoneLayerPanel
        value={normalizeScreentoneLayer({ density: 40, kind: "sand", seed: 7 })}
        onChange={onChange}
      />
    );

    expect(screen.getByText("노이즈 시드: 7")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "다시 섞기" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sand", seed: expect.any(Number) })
    );
  });

  it("그라데이션 선형 선택 시 방향 슬라이더가 나타난다", () => {
    const onChange = vi.fn();
    render(
      <ScreentoneLayerPanel value={normalizeScreentoneLayer({ density: 40 })} onChange={onChange} />
    );

    expect(screen.queryByLabelText("그라데이션 방향 조절")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "선형" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ gradient: expect.objectContaining({ kind: "linear" }) })
    );
  });

  it("그라데이션이 켜진 값에서는 시작/끝 농도 슬라이더가 보인다", () => {
    render(
      <ScreentoneLayerPanel
        value={normalizeScreentoneLayer({
          density: 40,
          gradient: { kind: "radial", direction: 0, fromDensity: 20, toDensity: 60 },
        })}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText("그라데이션 시작 농도 조절")).toBeDefined();
    expect(screen.getByLabelText("그라데이션 끝 농도 조절")).toBeDefined();
    // 방사형에서는 방향 슬라이더가 없다
    expect(screen.queryByLabelText("그라데이션 방향 조절")).toBeNull();
  });

  it("disabled이면 컨트롤이 비활성화된다", () => {
    render(
      <ScreentoneLayerPanel
        value={normalizeScreentoneLayer({ density: 40 })}
        onChange={() => {}}
        disabled
      />
    );

    expect(screen.getByLabelText("선 수 조절")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "톤 On" })).toHaveProperty("disabled", true);
  });
});
