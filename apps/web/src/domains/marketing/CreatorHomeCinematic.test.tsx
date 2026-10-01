// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { CINEMATIC_CONTAINER_VARIANTS } from "./creator-home-cinematic-variants";
import { useCinematicJumpNavActive } from "./use-cinematic-jump-nav";
import {
  CinematicHeadline,
  CinematicHeroMesh,
  CinematicHeroVisual,
  CinematicItem,
  CinematicReveal,
  type CinematicFloatCard,
} from "./CreatorHomeCinematic";

const { reducedRef, capturedMotionProps } = vi.hoisted(() => ({
  reducedRef: { current: false },
  capturedMotionProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("motion/react", () => {
  type TagName = "div" | "span" | "figure" | "section" | "li" | "article" | "p";
  function strip(tag: TagName) {
    return function MockMotionElement(props: {
      children?: ReactNode;
      [key: string]: unknown;
    }) {
      capturedMotionProps.push({ ...props });
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
      const Tag = tag;
      return <Tag {...rest}>{children}</Tag>;
    };
  }
  return {
    motion: {
      div: strip("div"),
      span: strip("span"),
      figure: strip("figure"),
      section: strip("section"),
      li: strip("li"),
      article: strip("article"),
    },
    useReducedMotion: () => reducedRef.current,
    useMotionValue: (initialValue: number) => {
      const box = { current: initialValue };
      return {
        get: () => box.current,
        set: (value: number) => {
          box.current = value;
        },
      };
    },
    useTransform: () => 0,
  };
});

vi.mock("./use-creator-home-section-navigation", () => ({
  useCreatorHomeSectionNavigation: () => undefined,
}));

afterEach(() => {
  cleanup();
  reducedRef.current = false;
  capturedMotionProps.length = 0;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const KO_CARDS: readonly CinematicFloatCard[] = [
  { tag: "3D 배경", title: "컷에 바로 붙는 3D", body: "포즈·소품·카메라를 현재 컷에 연결" },
  { tag: "자동 저장", title: "작업은 알아서 저장", body: "버전 이력으로 언제든 되돌리기" },
];

describe("creator home cinematic layer", () => {
  it("renders the gradient mesh as decorative layers", () => {
    const { container } = render(<CinematicHeroMesh />);
    const mesh = container.querySelector(".cf-cinematic-mesh");
    expect(mesh?.getAttribute("aria-hidden")).toBe("true");
    expect(mesh?.querySelectorAll(".cf-cinematic-mesh-layer")).toHaveLength(3);
  });

  it("keeps hero figure semantics while overlaying floating art cards", () => {
    render(
      <CinematicHeroVisual cards={KO_CARDS}>
        <img src="/brand/atelier-20260927/creation-world.webp" alt="히어로" />
      </CinematicHeroVisual>,
    );
    const figure = document.querySelector("figure.cf-home-preview.cf-cinematic-visual");
    expect(figure).not.toBeNull();
    expect(figure?.querySelector("img")).not.toBeNull();
    expect(screen.getByText("컷에 바로 붙는 3D")).toBeTruthy();
    expect(screen.getByText("버전 이력으로 언제든 되돌리기")).toBeTruthy();
    expect(document.querySelectorAll(".cf-cinematic-float-card")).toHaveLength(2);
  });

  it("renders the headline as an h1 with word-level spans", () => {
    render(<CinematicHeadline id="creator-hero-title" lines={["기획부터 연재까지,", "웹툰 제작의 모든 것을 한곳에서."]} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.getAttribute("id")).toBe("creator-hero-title");
    expect(heading.textContent).toContain("기획부터 연재까지,");
    expect(heading.querySelector("em")).not.toBeNull();
    expect(heading.querySelectorAll(".cf-cinematic-word").length).toBeGreaterThan(2);
  });

  it("marks motion branches with data-reduced-motion", () => {
    reducedRef.current = false;
    const { unmount } = render(
      <CinematicHeadline id="creator-hero-title" lines={["기획부터", "연재까지"]} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("data-reduced-motion")).toBe("false");
    unmount();

    reducedRef.current = true;
    render(<CinematicHeadline id="creator-hero-title" lines={["기획부터", "연재까지"]} />);
    const staticHeading = screen.getByRole("heading", { level: 1 });
    expect(staticHeading.getAttribute("data-reduced-motion")).toBe("true");
    expect(staticHeading.querySelectorAll(".cf-cinematic-word")).toHaveLength(2);
  });

  it("keeps section semantics for scroll reveals in both motion branches", () => {
    reducedRef.current = false;
    const { unmount } = render(
      <CinematicReveal id="creator-flow" className="cf-flow" labelledBy="creator-process-title">
        <p>flow</p>
      </CinematicReveal>,
    );
    const animated = document.querySelector("section#creator-flow.cf-flow");
    expect(animated).not.toBeNull();
    expect(animated?.getAttribute("aria-labelledby")).toBe("creator-process-title");
    expect(animated?.getAttribute("data-cinematic")).toBe("reveal");
    unmount();

    reducedRef.current = true;
    render(
      <CinematicReveal id="creator-flow" className="cf-flow" labelledBy="creator-process-title">
        <p>flow</p>
      </CinematicReveal>,
    );
    const staticSection = document.querySelector("section#creator-flow.cf-flow");
    expect(staticSection?.getAttribute("data-cinematic")).toBe("static");
    expect(staticSection?.textContent).toContain("flow");
  });

  it("renders stagger items as li/article and preserves data hooks", () => {
    reducedRef.current = false;
    render(
      <ol>
        <CinematicItem as="li" dataWorkflowStep="plan">
          <h3>기획</h3>
        </CinematicItem>
      </ol>,
    );
    const item = document.querySelector('li[data-workflow-step="plan"]');
    expect(item).not.toBeNull();
    expect(item?.getAttribute("data-cinematic")).toBe("item");

    reducedRef.current = true;
    render(
      <CinematicItem as="article">
        <h3>원칙</h3>
      </CinematicItem>,
    );
    const staticItem = document.querySelector("article[data-cinematic='static-item']");
    expect(staticItem?.textContent).toContain("원칙");
  });

  it("supports div reveals for non-section wrappers", () => {
    reducedRef.current = true;
    render(
      <CinematicReveal tag="div" id="creator-start" className="cf-shell cf-home-wayfinding">
        <p>start</p>
      </CinematicReveal>,
    );
    expect(document.querySelector("div#creator-start.cf-home-wayfinding")).not.toBeNull();
  });

  it("drives section reveals with fade+rise and staggers child items", () => {
    expect(CINEMATIC_CONTAINER_VARIANTS.hidden).toMatchObject({ opacity: 0, y: 32 });
    const show = CINEMATIC_CONTAINER_VARIANTS.show(0.25);
    expect(show).toMatchObject({ opacity: 1, y: 0 });
    expect(show.transition.delayChildren).toBe(0.25);
    expect(show.transition.staggerChildren).toBeGreaterThan(0);
    expect(show.transition.duration).toBeGreaterThan(0);
  });

  it("keeps card hover lift through whileHover in the motion branch", () => {
    reducedRef.current = false;
    render(
      <ol>
        <CinematicItem as="li" dataWorkflowStep="plan">
          <h3>기획</h3>
        </CinematicItem>
      </ol>,
    );
    const itemProps = capturedMotionProps.find((props) => props["data-cinematic"] === "item");
    // motion의 인라인 transform이 기존 CSS :hover 리프트를 덮으므로 whileHover로 유지한다.
    expect(itemProps?.whileHover).toEqual({ y: -3 });

    cleanup();
    capturedMotionProps.length = 0;
    reducedRef.current = true;
    render(
      <CinematicItem as="article">
        <h3>원칙</h3>
      </CinematicItem>,
    );
    expect(capturedMotionProps.some((props) => "whileHover" in props)).toBe(false);
    expect(document.querySelector("article[data-cinematic='static-item']")).not.toBeNull();
  });
});

describe("useCinematicJumpNavActive", () => {
  function probeActive(sectionIds: readonly string[]) {
    const { result } = renderHook(() => useCinematicJumpNavActive(sectionIds));
    return () => result.current;
  }

  function installObserver() {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    return {
      observed,
      intersect: (element: Element) =>
        act(() => {
          callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], {} as IntersectionObserver);
        }),
    };
  }

  it("starts from the current hash and follows intersecting sections", () => {
    document.body.innerHTML =
      '<div id="creator-start"></div><section id="creator-flow"></section><section id="creator-principles"></section>';
    window.location.hash = "#creator-flow";
    const observer = installObserver();
    const getActive = probeActive(["creator-start", "creator-flow", "creator-principles"]);
    expect(getActive()).toBe("creator-flow");
    expect(observer.observed.map((element) => element.id)).toEqual([
      "creator-start",
      "creator-flow",
      "creator-principles",
    ]);

    const principles = document.getElementById("creator-principles");
    expect(principles).not.toBeNull();
    observer.intersect(principles as Element);
    expect(getActive()).toBe("creator-principles");
    window.location.hash = "";
  });

  it("ignores unknown hashes", () => {
    document.body.innerHTML = '<section id="creator-flow"></section>';
    window.location.hash = "#unknown";
    installObserver();
    const getActive = probeActive(["creator-flow"]);
    expect(getActive()).toBeNull();
    window.location.hash = "";
  });
});
