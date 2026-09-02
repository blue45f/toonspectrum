// @vitest-environment jsdom

/**
 * 조합 편집기가 실제로 조합을 만들어 내보내는지 — 그리고 기본값으로 돌아오면 세트를 벗는지.
 *
 * 후자가 중요하다. 프리셋과 같은 조합의 획은 프리셋과 바이트 단위로 같은 플랜이어야 하고, 그
 * 계약은 '세트 없음' 경로에 쓰여 있다. 편집기가 기본값을 세트로 실어 보내면 계약이 우회된다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioBrushEngineProgramSetFromOil } from "./studio-brush-engine-program-set";
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

  it("패스를 켜면 세트를 실어 보내고, 프리셋에 없는 조합이면 커스텀이라고 표시한다", () => {
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
    // 세 프로그램을 전부 켠 조합에 대응하는 출하 프리셋은 없다.
    expect(screen.getByText("커스텀 조합")).toBeTruthy();
    expect(screen.getAllByText("변경됨").length).toBe(1);
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
