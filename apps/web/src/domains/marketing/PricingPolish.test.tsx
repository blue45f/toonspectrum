// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { CountUp, PulseCta, TiltCard } from "./PricingPolish";

const { setMockReducedMotion, isMockReducedMotion } = vi.hoisted(() => {
  let reduced = false;
  return {
    setMockReducedMotion: (value: boolean) => {
      reduced = value;
    },
    isMockReducedMotion: () => reduced,
  };
});

vi.mock("motion/react", () => {
  type TagName = "article" | "div" | "span";
  function strip(tag: TagName) {
    return function MockMotionElement(props: {
      children?: ReactNode;
      [key: string]: unknown;
    }) {
      const {
        children,
        initial,
        animate,
        transition,
        variants,
        viewport,
        whileInView,
        whileHover,
        whileTap,
        custom,
        exit,
        style,
        ...rest
      } = props;
      void initial;
      void animate;
      void transition;
      void variants;
      void viewport;
      void whileInView;
      void whileHover;
      void whileTap;
      void custom;
      void exit;
      void style;
      const Tag = tag as "div";
      return <Tag {...rest}>{children}</Tag>;
    };
  }
  return {
    motion: {
      article: strip("article"),
      div: strip("div"),
      span: strip("span"),
    },
    useReducedMotion: () => isMockReducedMotion(),
    useMotionValue: (initialValue: number) => {
      let current = initialValue;
      return {
        get: () => current,
        set: (next: number) => {
          current = next;
        },
      };
    },
    useSpring: (source: { get: () => number }) => source,
  };
});

beforeEach(() => {
  setMockReducedMotion(false);
});

afterEach(() => {
  cleanup();
});

function renderWithRouter(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("TiltCard", () => {
  it("자식을 렌더하고 모션 환경에서는 animated 틸트로 표시한다", () => {
    render(
      <TiltCard label="Free 요금제">
        <p>카드 내용</p>
      </TiltCard>,
    );
    expect(screen.getByText("카드 내용")).toBeTruthy();
    const card = screen.getByLabelText("Free 요금제");
    expect(card.getAttribute("data-tilt")).toBe("animated");
    expect(card.tagName).toBe("ARTICLE");
  });

  it("reduced-motion에서는 정적 카드로 렌더한다", () => {
    setMockReducedMotion(true);
    render(
      <TiltCard label="Pro 요금제">
        <p>정적 내용</p>
      </TiltCard>,
    );
    const card = screen.getByLabelText("Pro 요금제");
    expect(card.getAttribute("data-tilt")).toBe("static");
    expect(screen.getByText("정적 내용")).toBeTruthy();
  });

  it("glow prop이 있으면 글로우 그림자 클래스를 더한다", () => {
    render(
      <TiltCard label="추천" glow>
        <p>내용</p>
      </TiltCard>,
    );
    const card = screen.getByLabelText("추천");
    expect(card.className).toContain("shadow-[0_0_36px_oklch(0.7_0.18_315/0.28)]");
  });
});

describe("CountUp", () => {
  it("reduced-motion에서는 최종 값을 즉시 표시한다", () => {
    setMockReducedMotion(true);
    render(<CountUp value={10000} />);
    expect(screen.getByText("10,000")).toBeTruthy();
  });

  it("모션 환경에서는 카운트업 끝에 목표 값에 도달한다", async () => {
    render(<CountUp value={10000} duration={80} />);
    await screen.findByText("10,000", undefined, { timeout: 3000 });
  });

  it("format prop으로 표시 형식을 바꿀 수 있다", () => {
    setMockReducedMotion(true);
    render(<CountUp value={10} format={(n) => `${Math.round(n)} GB`} />);
    expect(screen.getByText("10 GB")).toBeTruthy();
  });
});

describe("PulseCta", () => {
  it("href로 이동하는 링크를 렌더한다", () => {
    renderWithRouter(<PulseCta href="/studio/new">무료로 시작하기</PulseCta>);
    const link = screen.getByRole("link", { name: "무료로 시작하기" });
    expect(link.getAttribute("href")).toBe("/studio/new");
  });

  it("모션 환경에서는 펄스 링을 렌더한다", () => {
    const { container } = renderWithRouter(<PulseCta href="/studio/new">시작</PulseCta>);
    const ring = container.querySelector('[data-testid="pulse-ring"]');
    expect(ring).toBeTruthy();
    expect(ring?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reduced-motion에서는 펄스 링을 렌더하지 않는다", () => {
    setMockReducedMotion(true);
    const { container } = renderWithRouter(<PulseCta href="/studio/new">시작</PulseCta>);
    expect(container.querySelector('[data-testid="pulse-ring"]')).toBeNull();
    expect(screen.getByRole("link", { name: "시작" })).toBeTruthy();
  });
});
