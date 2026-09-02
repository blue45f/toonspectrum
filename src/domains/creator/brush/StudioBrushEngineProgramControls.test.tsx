// @vitest-environment jsdom

/**
 * 조합 편집기가 실제로 조합을 만들어 내보내는지 — 그리고 기본값으로 돌아오면 세트를 벗는지.
 *
 * 후자가 중요하다. 프리셋과 같은 조합의 획은 프리셋과 바이트 단위로 같은 플랜이어야 하고, 그
 * 계약은 '세트 없음' 경로에 쓰여 있다. 편집기가 기본값을 세트로 실어 보내면 계약이 우회된다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS,
  studioBrushEngineProgramSetFromOil,
} from "./studio-brush-engine-program-set";
import { studioBrushPresetById } from "./studio-draw-ux";
import { StudioBrushEngineProgramControls } from "./StudioBrushEngineProgramControls";

describe("StudioBrushEngineProgramControls", () => {
  afterEach(cleanup);

  it("유화가 아닌 브러시에는 조합할 엔진이 없다고 정직하게 말한다", () => {
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={vi.fn()} />,
    );
    expect(screen.getByText("이 브러시는 아직 조합할 엔진이 없습니다")).toBeTruthy();
  });

  it("프리셋의 기본 조합을 그 프리셋 이름으로 보여준다", () => {
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={null}
        onChange={vi.fn()}
      />,
    );
    // oil--impasto-ribbon 은 붓털 물리 + 임파스토를 켠다.
    expect(screen.getByText("유화 · 임파스토(소모 없음)와 같은 조합")).toBeTruthy();
    expect(screen.getByRole("button", { name: /붓털 물리/ }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /임파스토 릴리프/ }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /물감 소모/ }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("패스를 켜면 세트를 실어 보내고, 다른 출하 프리셋과 같아지면 그 이름으로 부른다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /물감 소모/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0];
    expect(next?.oil).toEqual({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });

    rerender(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={next}
        onChange={onChange}
      />,
    );
    // 세 프로그램을 전부 켠 조합은 2026-08-20 부터 유화 붓·아크릴 물감이 출하하는 조합이다 —
    // 커스텀이 아니라 그 프리셋 이름으로 불러야 한다(매트릭스 순서상 유화 붓).
    expect(screen.getByText("유화 붓와 같은 조합")).toBeTruthy();
    expect(screen.queryByText(/이 조합과 같은 프리셋은 없습니다/)).toBeNull();
    expect(screen.getAllByText("변경됨").length).toBe(1);
  });

  it("출하 프리셋 어느 것과도 같지 않은 조합만 커스텀이라고 부른다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="brush--impasto-relief"
        programSet={null}
        onChange={onChange}
      />,
    );
    // 릴리프 + 물감 소모(붓털 물리 없음)는 여덟 조합 중 유일하게 출하 프리셋이 없는 조합이다.
    fireEvent.click(screen.getByRole("button", { name: /물감 소모/ }));
    const next = onChange.mock.calls[0]![0];
    expect(next?.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });

    rerender(
      <StudioBrushEngineProgramControls
        brushId="brush--impasto-relief"
        programSet={next}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("커스텀 조합")).toBeTruthy();
    expect(screen.getByText(/이 조합과 같은 프리셋은 없습니다/)).toBeTruthy();
  });

  it("세 프로그램을 모두 켜고 출하된 유화 붓·아크릴 물감은 자기 이름으로 불린다", () => {
    for (const [brushId, name] of [["oil", "유화 붓"], ["acrylic", "아크릴 물감"]] as const) {
      render(
        <StudioBrushEngineProgramControls brushId={brushId} programSet={null} onChange={vi.fn()} />,
      );
      expect(screen.getByText(`${name}와 같은 조합`), brushId).toBeTruthy();
      expect(screen.queryByText("커스텀 조합"), brushId).toBeNull();
      cleanup();
    }
  });

  it("카탈로그에 실린 매트릭스 id 는 기본 조합에서 결코 커스텀으로 표시되지 않는다", () => {
    // 매트릭스에 행이 늘어도 편집기가 따라오도록 — 이름을 못 얻는 id(카탈로그에 없는 행)만 예외다.
    let checked = 0;
    for (const brushId of STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS) {
      if (!studioBrushPresetById(brushId)) continue;
      checked += 1;
      render(
        <StudioBrushEngineProgramControls brushId={brushId} programSet={null} onChange={vi.fn()} />,
      );
      expect(screen.queryByText("커스텀 조합"), brushId).toBeNull();
      cleanup();
    }
    expect(checked).toBeGreaterThanOrEqual(7);
  });

  it("기본값으로 되돌아오면 세트가 아니라 null 을 내보낸다", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={studioBrushEngineProgramSetFromOil({
          bristlePhysics: true,
          bristleLoadDynamics: false,
          impastoRelief: true,
        })}
        onChange={onChange}
      />,
    );
    // filbert 의 기본은 붓털 물리만 — 임파스토를 끄면 기본값과 같아진다.
    fireEvent.click(screen.getByRole("button", { name: /임파스토 릴리프/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("프리셋으로 되돌리기는 변경이 있을 때만 나타난다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: /프리셋으로/ })).toBeNull();

    rerender(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={studioBrushEngineProgramSetFromOil({
          bristlePhysics: false,
          bristleLoadDynamics: true,
          impastoRelief: false,
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /프리셋으로/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
