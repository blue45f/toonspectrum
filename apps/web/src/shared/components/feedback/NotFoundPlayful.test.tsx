// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  NotFoundDecorations,
  NotFoundNumber,
} from "./NotFoundPlayful";

vi.mock("motion/react", () => {
  type TagName = "button" | "div" | "span";
  function strip(tag: TagName) {
    return function MockMotionElement(props: {
      children?: ReactNode;
      [key: string]: unknown;
    }) {
      const {
        children,
        initial,
        animate,
        exit,
        transition,
        whileTap,
        style,
        ...rest
      } = props;
      void initial;
      void animate;
      void exit;
      void transition;
      void whileTap;
      void style;
      const Tag = tag as "div";
      return <Tag {...rest}>{children}</Tag>;
    };
  }
  const useMotionValue = (initialValue: number) => {
    let value = initialValue;
    return {
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    };
  };
  return {
    motion: {
      button: strip("button"),
      div: strip("div"),
      span: strip("span"),
    },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
    useMotionValue,
    useSpring: (value: unknown) => value,
    useTransform: (value: unknown) => value,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const QUIPS = [
  "어라, 이 컷은 아직 안 그렸어요!",
  "잉크가 마르기도 전에 길을 잃었네요.",
  "다음 화에서 만나요… 아마도요!",
  "작가님이 지금 이 페이지를 그리고 있어요.",
];

describe("NotFoundNumber", () => {
  it("404 숫자 버튼과 탭 힌트를 렌더한다", () => {
    render(<NotFoundNumber />);
    const button = screen.getByRole("button", { name: "숫자를 툭 눌러보세요" });
    expect(button.textContent).toContain("404");
    expect(screen.getByText("숫자를 툭 눌러보세요")).toBeTruthy();
  });

  it("클릭하면 랜덤 대사 말풍선이 나타난다", () => {
    render(<NotFoundNumber />);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "숫자를 툭 눌러보세요" }));
    const bubble = screen.getByRole("status");
    expect(QUIPS).toContain(bubble.textContent);
  });

  it("다시 클릭하면 대사가 바뀐다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<NotFoundNumber />);
    const button = screen.getByRole("button", { name: "숫자를 툭 눌러보세요" });
    fireEvent.click(button);
    expect(screen.getByRole("status").textContent).toBe(QUIPS[0]);
    fireEvent.click(button);
    expect(screen.getByRole("status").textContent).toBe(QUIPS[1]);
  });

  it("네이티브 버튼이라 키보드(Enter/Space)로도 동작한다", () => {
    render(<NotFoundNumber />);
    const button = screen.getByRole("button", { name: "숫자를 툭 눌러보세요" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });
});

describe("NotFoundDecorations", () => {
  it("장식을 렌더하되 스크린리더에서는 숨긴다", () => {
    const { container } = render(<NotFoundDecorations />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.querySelectorAll("span").length).toBe(4);
  });
});
