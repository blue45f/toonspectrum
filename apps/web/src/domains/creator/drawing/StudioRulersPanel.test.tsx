// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  StudioRulersPanel,
  type StudioRulersPanelProps,
} from "./StudioRulersPanel";
import { STUDIO_RULERS_MAX_PER_CANVAS } from "./studio-rulers";

afterEach(cleanup);

function props(
  overrides: Partial<StudioRulersPanelProps> = {},
): StudioRulersPanelProps {
  return {
    onRulersChange: vi.fn(),
    onSymmetryChange: vi.fn(),
    ...overrides,
  };
}

/** 로케일을 강제로 고정한다 (테스트 격리). 이전 값 반환. */
function fixLocale(lang: string): string {
  const prev = useI18n.getState().lang;
  useI18n.setState({ lang });
  return prev;
}

describe("StudioRulersPanel", () => {
  it("한 줄 설명을 보여준다 (10초 이해 목표)", () => {
    const prev = fixLocale("ko");
    try {
      render(<StudioRulersPanel {...props()} />);
      expect(
        screen.getByText("자를 올려놓고 그리면 선이 자에 착 달라붙어요"),
      ).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("자 종류 카드 4종을 보여준다", () => {
    const prev = fixLocale("ko");
    try {
      render(<StudioRulersPanel {...props()} />);
      expect(screen.getByText("직선자")).toBeTruthy();
      expect(screen.getByText("곡선자")).toBeTruthy();
      expect(screen.getByText("동심원자")).toBeTruthy();
      expect(screen.getByText("퍼스펙티브자")).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("자 종류 카드를 누르면 자가 추가되고 onRulersChange가 호출된다", () => {
    const prev = fixLocale("ko");
    try {
      const onRulersChange = vi.fn();
      render(<StudioRulersPanel {...props({ onRulersChange })} />);
      fireEvent.click(screen.getByText("동심원자").closest("button")!);
      expect(onRulersChange).toHaveBeenCalledTimes(1);
      const rulers = onRulersChange.mock.calls[0][0];
      expect(rulers).toHaveLength(1);
      expect(rulers[0].kind).toBe("concentric");
      // 목록에 추가된 자가 보인다
      expect(screen.getByText("동심원 자")).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("스냅 토글로 snapEnabled가 뒤집힌다", () => {
    const prev = fixLocale("ko");
    try {
      const onRulersChange = vi.fn();
      render(<StudioRulersPanel {...props({ onRulersChange })} />);
      fireEvent.click(screen.getByText("직선자").closest("button")!);
      const snapButton = screen.getByLabelText("자 스냅 끄기");
      expect(snapButton.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(snapButton);
      const rulers = onRulersChange.mock.calls.at(-1)![0];
      expect(rulers[0].snapEnabled).toBe(false);
      expect(screen.getByLabelText("자 스냅 켜기")).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("표시 토글로 visible이 뒤집힌다", () => {
    const prev = fixLocale("ko");
    try {
      const onRulersChange = vi.fn();
      render(<StudioRulersPanel {...props({ onRulersChange })} />);
      fireEvent.click(screen.getByText("곡선자").closest("button")!);
      fireEvent.click(screen.getByLabelText("자 숨기기"));
      const rulers = onRulersChange.mock.calls.at(-1)![0];
      expect(rulers[0].visible).toBe(false);
    } finally {
      fixLocale(prev);
    }
  });

  it("색상 스와치로 자 색상을 바꾼다", () => {
    const prev = fixLocale("ko");
    try {
      const onRulersChange = vi.fn();
      render(<StudioRulersPanel {...props({ onRulersChange })} />);
      fireEvent.click(screen.getByText("직선자").closest("button")!);
      fireEvent.click(screen.getByLabelText("자 색상 #ef4444"));
      const rulers = onRulersChange.mock.calls.at(-1)![0];
      expect(rulers[0].color).toBe("#ef4444");
    } finally {
      fixLocale(prev);
    }
  });

  it("삭제 버튼으로 자를 제거한다", () => {
    const prev = fixLocale("ko");
    try {
      const onRulersChange = vi.fn();
      render(<StudioRulersPanel {...props({ onRulersChange })} />);
      fireEvent.click(screen.getByText("직선자").closest("button")!);
      fireEvent.click(screen.getByLabelText("자 삭제"));
      const rulers = onRulersChange.mock.calls.at(-1)![0];
      expect(rulers).toHaveLength(0);
    } finally {
      fixLocale(prev);
    }
  });

  it(`최대 ${STUDIO_RULERS_MAX_PER_CANVAS}개에 도달하면 추가 버튼이 비활성화된다`, () => {
    const prev = fixLocale("ko");
    try {
      const { container } = render(
        <StudioRulersPanel
          {...props({
            initialRulers: Array.from(
              { length: STUDIO_RULERS_MAX_PER_CANVAS },
              (_, i) => ({
                kind: "line" as const,
                id: `r-${i}`,
                name: `자 ${i}`,
                visible: true,
                snapEnabled: true,
                color: "#4f9cf9",
                p0: { x: 0, y: 0 },
                p1: { x: 100, y: 0 },
              }),
            ),
          })}
        />,
      );
      const addButtons = Array.from(
        container.querySelectorAll("button"),
      ).filter((button) => button.textContent?.includes("올리기"));
      expect(addButtons.length).toBeGreaterThan(0);
      for (const button of addButtons) {
        expect(button.hasAttribute("disabled")).toBe(true);
      }
    } finally {
      fixLocale(prev);
    }
  });

  it("SVG 미니 프리뷰는 role=img와 aria-label을 갖고 애니메이션이 없다", () => {
    const prev = fixLocale("ko");
    try {
      const { container } = render(<StudioRulersPanel {...props()} />);
      const previews = container.querySelectorAll('svg[role="img"]');
      expect(previews.length).toBe(4);
      for (const svg of previews) {
        expect(svg.getAttribute("aria-label")).toBeTruthy();
      }
      // reduced-motion: 애니메이션 요소가 없어야 한다
      expect(container.querySelectorAll("animate, animateTransform").length).toBe(0);
    } finally {
      fixLocale(prev);
    }
  });

  it("영어 로케일에서는 영어 문구를 보여준다", () => {
    const prev = fixLocale("en");
    try {
      render(<StudioRulersPanel {...props()} />);
      expect(
        screen.getByText(
          "Lay a ruler on the canvas — your strokes snap right onto it.",
        ),
      ).toBeTruthy();
      expect(screen.getByText("Straight")).toBeTruthy();
      expect(screen.getByText("Mirror drawing")).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("대칭 모드를 바꾸면 onSymmetryChange가 호출된다", () => {
    const prev = fixLocale("ko");
    try {
      const onSymmetryChange = vi.fn();
      render(<StudioRulersPanel {...props({ onSymmetryChange })} />);
      fireEvent.click(screen.getByText("방사형"));
      expect(onSymmetryChange).toHaveBeenCalledTimes(1);
      expect(onSymmetryChange.mock.calls[0][0].mode).toBe("radial");
      // 방사형이면 분할 수 슬라이더가 보인다
      expect(screen.getByLabelText("분할 수")).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("방사형 분할 수를 조절할 수 있다", () => {
    const prev = fixLocale("ko");
    try {
      const onSymmetryChange = vi.fn();
      render(
        <StudioRulersPanel
          {...props({ onSymmetryChange, initialSymmetry: { mode: "radial" } })}
        />,
      );
      const slider = screen.getByLabelText("분할 수") as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "8" } });
      const last = onSymmetryChange.mock.calls.at(-1)![0];
      expect(last.folds).toBe(8);
    } finally {
      fixLocale(prev);
    }
  });

  it("수직 모드에서는 수직축·각도 슬라이더가 보인다", () => {
    const prev = fixLocale("ko");
    try {
      render(
        <StudioRulersPanel
          {...props({ initialSymmetry: { mode: "vertical" } })}
        />,
      );
      expect(screen.getByLabelText("수직축 위치")).toBeTruthy();
      expect(screen.getByLabelText("축 각도")).toBeTruthy();
      expect(screen.queryByLabelText("분할 수")).toBeNull();
    } finally {
      fixLocale(prev);
    }
  });
});
