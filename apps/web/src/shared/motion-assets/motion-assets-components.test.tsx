// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MotionLightRays,
  MotionNoise,
  MotionOrbs,
  MotionParticles,
} from "./motion-assets-backgrounds";
import {
  MotionCompareDiagram,
  MotionGauge,
  MotionStepFlow,
  MotionTimeline,
} from "./motion-assets-diagrams";
import { MotionEmptyState } from "./motion-assets-empty";
import {
  listMotionIllustrations,
  MotionIllustration,
  MOTION_ILLUSTRATION_NAMES,
} from "./motion-assets-illustrations";
import {
  MotionCountUp,
  MotionParallax,
  MotionReveal,
  MotionSequence,
  MotionStagger,
  MotionTypewriter,
} from "./motion-assets-primitives";

vi.mock("./motion-assets-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("./motion-assets-engine")>();
  return { ...original, prefersReducedMotion: () => false, isLowPowerEnvironment: () => false };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MotionIllustration", () => {
  it("26종 전부 렌더된다", () => {
    expect(MOTION_ILLUSTRATION_NAMES).toHaveLength(26);
    expect(listMotionIllustrations()).toHaveLength(26);
    for (const name of MOTION_ILLUSTRATION_NAMES) {
      const { container, unmount } = render(<MotionIllustration name={name} size={48} />);
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.querySelector("[data-motion-illustration]")?.getAttribute("data-motion-illustration")).toBe(name);
      unmount();
    }
  });

  it("title이 있으면 role=img, 없으면 aria-hidden", () => {
    const { container: c1 } = render(<MotionIllustration name="rocket" title="런칭" />);
    expect(c1.querySelector('[role="img"]')).not.toBeNull();
    expect(c1.querySelector("title")?.textContent).toBe("런칭");
    const { container: c2 } = render(<MotionIllustration name="rocket" />);
    expect(c2.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("animated=false면 ma-static 클래스", () => {
    const { container } = render(<MotionIllustration name="heart" animated={false} />);
    expect(container.querySelector(".ma-static")).not.toBeNull();
    expect(container.querySelector("[data-animated]")?.getAttribute("data-animated")).toBe("false");
  });

  it("숫자 크기 적용", () => {
    const { container } = render(<MotionIllustration name="big-star" size={64} />);
    const wrapper = container.querySelector("[data-motion-illustration]") as HTMLElement;
    expect(wrapper.style.width).toBe("64px");
  });
});

describe("MotionStepFlow", () => {
  it("단계와 커넥터를 렌더한다", () => {
    const { container } = render(
      <MotionStepFlow
        steps={[{ title: "스케치" }, { title: "선화" }, { title: "채색" }]}
        activeStep={1}
      />,
    );
    expect(screen.getByText("스케치")).not.toBeNull();
    expect(screen.getByText("채색")).not.toBeNull();
    expect(container.querySelectorAll(".ma-step-connector")).toHaveLength(2);
    expect(container.querySelector('[aria-current="step"]')).not.toBeNull();
  });
});

describe("MotionCompareDiagram", () => {
  it("before/after와 VS 배지", () => {
    render(
      <MotionCompareDiagram
        before={<span>전</span>}
        after={<span>후</span>}
        beforeLabel="선화"
        afterLabel="채색"
      />,
    );
    expect(screen.getByText("전")).not.toBeNull();
    expect(screen.getByText("후")).not.toBeNull();
    expect(screen.getByText("선화")).not.toBeNull();
    expect(screen.getByText("채색")).not.toBeNull();
    expect(screen.getByText("VS")).not.toBeNull();
  });
});

describe("MotionTimeline", () => {
  it("항목과 타임라인 도트", () => {
    const { container } = render(
      <MotionTimeline
        items={[
          { title: "기획", meta: "1일차", description: "시놉시스" },
          { title: "콘티", meta: "3일차" },
        ]}
      />,
    );
    expect(screen.getByText("기획")).not.toBeNull();
    expect(screen.getByText("1일차")).not.toBeNull();
    expect(container.querySelectorAll(".ma-timeline-dot")).toHaveLength(2);
  });
});

describe("MotionGauge", () => {
  it("게이지와 aria-label", () => {
    const { container } = render(<MotionGauge value={72} max={100} />);
    const gauge = container.querySelector('[data-motion-diagram="gauge"]');
    expect(gauge?.getAttribute("aria-label")).toBe("100 중 72");
    expect(screen.getByText("72%")).not.toBeNull();
  });

  it("값 클램핑", () => {
    const { container } = render(<MotionGauge value={150} max={100} />);
    expect(screen.getByText("100%")).not.toBeNull();
    expect(container.querySelector('[aria-label="100 중 100"]')).not.toBeNull();
  });
});

describe("모션 프리미티브", () => {
  it("MotionReveal은 자식을 감싼다", () => {
    render(<MotionReveal variant="up"><span>리빌</span></MotionReveal>);
    expect(screen.getByText("리빌")).not.toBeNull();
  });

  it("MotionSequence는 항목별 지연을 둔다", () => {
    const { container } = render(
      <MotionSequence staggerMs={150}>
        <span>a</span>
        <span>b</span>
      </MotionSequence>,
    );
    const items = container.querySelectorAll(".ma-sequence-item");
    expect(items).toHaveLength(2);
    expect((items[1] as HTMLElement).style.getPropertyValue("--ma-delay")).toBe("150ms");
  });

  it("MotionStagger 마운트 시 등장", async () => {
    const { container } = render(
      <MotionStagger>
        <span>x</span>
      </MotionStagger>,
    );
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(container.querySelector(".ma-sequence-item")).not.toBeNull();
  });

  it("MotionCountUp 목표 숫자를 표시한다", async () => {
    render(<MotionCountUp to={1280} durationMs={30} />);
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.getByText("1,280")).not.toBeNull();
  });

  it("MotionTypewriter 전체 텍스트 타이핑", async () => {
    render(<MotionTypewriter text="상상" charMs={5} />);
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.getByLabelText("상상")).not.toBeNull();
  });

  it("MotionParallax 렌더", () => {
    render(<MotionParallax speed={0.3}><span>패럴랙스</span></MotionParallax>);
    expect(screen.getByText("패럴랙스")).not.toBeNull();
  });
});

describe("배경 에셋", () => {
  it("MotionOrbs 3개", () => {
    const { container } = render(<MotionOrbs />);
    expect(container.querySelectorAll(".ma-bg-orb")).toHaveLength(3);
  });

  it("MotionNoise svg 필터 (고유 ID)", () => {
    const { container } = render(<MotionNoise />);
    const filter = container.querySelector("filter[id^='ma-noise-filter-']");
    expect(filter).not.toBeNull();
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("filter")).toBe(`url(#${filter?.getAttribute("id")})`);
  });

  it("MotionNoise 다중 인스턴스 ID 충돌 없음", () => {
    const { container } = render(
      <>
        <MotionNoise />
        <MotionNoise />
      </>,
    );
    const ids = [...container.querySelectorAll("filter")].map((f) => f.getAttribute("id"));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("MotionLightRays", () => {
    const { container } = render(<MotionLightRays />);
    expect(container.querySelector(".ma-bg-rays")).not.toBeNull();
  });

  it("MotionParticles canvas", () => {
    const { container } = render(<MotionParticles count={10} />);
    expect(container.querySelector("canvas.ma-bg-particles")).not.toBeNull();
  });
});

describe("MotionEmptyState", () => {
  it("4종 전부 기본 문구 렌더", () => {
    for (const kind of ["search", "empty", "error", "loading"] as const) {
      const { unmount } = render(<MotionEmptyState kind={kind} lang="ko" />);
      const el = screen.getByRole(kind === "error" ? "alert" : "status");
      expect(el.getAttribute("data-motion-empty")).toBe(kind);
      unmount();
      cleanup();
    }
    const { container } = render(<MotionEmptyState kind="search" lang="ko" />);
    expect(container.textContent).toContain("검색 결과가 없어요");
  });

  it("로딩 바에 ma-anim-shimmer 클래스 (reduced-motion 대응)", () => {
    const { container } = render(<MotionEmptyState kind="loading" lang="ko" />);
    expect(container.querySelector(".ma-anim-shimmer")).not.toBeNull();
  });

  it("액션 슬롯과 커스텀 문구", () => {
    render(
      <MotionEmptyState
        kind="empty"
        title="첫 컷을 그려보세요"
        description="빈 캔버스입니다"
        action={<button type="button">새 원고</button>}
      />,
    );
    expect(screen.getByText("첫 컷을 그려보세요")).not.toBeNull();
    expect(screen.getByRole("button", { name: "새 원고" })).not.toBeNull();
  });

  it("영어 라벨", () => {
    const { container } = render(<MotionEmptyState kind="error" lang="en" />);
    expect(container.textContent).toContain("Something went wrong");
  });
});
