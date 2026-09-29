// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { EventCard } from "./EventCard";
import { BETA_OPEN_EVENT, type MarketingEvent } from "./event-catalog";

vi.mock("motion/react", () => {
  type TagName = "article" | "div" | "span" | "img" | "p";
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
        custom,
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
      void custom;
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
      img: strip("img"),
      p: strip("p"),
    },
    useReducedMotion: () => false,
  };
});

afterEach(cleanup);

const DAY_MS = 86_400_000;

function makeEvent(overrides: Partial<MarketingEvent>): MarketingEvent {
  return {
    ...BETA_OPEN_EVENT,
    id: "test-event",
    slug: "test-event",
    startsAt: "2026-01-01T00:00:00+09:00",
    ...overrides,
  };
}

function renderCard(event: MarketingEvent) {
  render(
    <MemoryRouter>
      <EventCard event={event} />
    </MemoryRouter>,
  );
}

describe("EventCard", () => {
  it("이벤트 제목·상태 칩·상세 링크를 렌더한다", () => {
    renderCard(BETA_OPEN_EVENT);
    expect(
      screen.getByRole("heading", {
        name: "지금 가입하면, 최대 1년 동안 전부 무료.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("진행 중")).toBeTruthy();
    const link = document.querySelector('a[href="/events/beta-open"]');
    expect(link).not.toBeNull();
    expect(screen.getByText("이벤트 보기")).toBeTruthy();
  });

  it("endsAt이 없으면 카운트다운 배지 대신 종료일 미정 안내를 보여준다", () => {
    renderCard(BETA_OPEN_EVENT);
    expect(screen.getByText("종료일 추후 안내")).toBeTruthy();
    expect(screen.queryByText(/^D-/)).toBeNull();
  });

  it("마감 임박 이벤트에는 글로우 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 2.5 * DAY_MS).toISOString() }),
    );
    const badge = screen.getByText("D-2");
    expect(badge.className).toContain("bg-orange-500");
    expect(badge.className).toContain("shadow-[0_0_20px_3px_rgba(249,115,22,0.55)]");
  });

  it("마감 당일에는 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 12 * 3_600_000).toISOString() }),
    );
    expect(screen.getByText("D-day")).toBeTruthy();
  });

  it("여유 있는 마감에는 글로우 없는 D-day 배지를 보여준다", () => {
    renderCard(
      makeEvent({ endsAt: new Date(Date.now() + 10.5 * DAY_MS).toISOString() }),
    );
    const badge = screen.getByText("D-10");
    expect(badge.className).not.toContain("bg-orange-500");
  });

  it("대표 이미지를 렌더한다", () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={BETA_OPEN_EVENT} />
      </MemoryRouter>,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/images/section-community.webp");
  });
});
