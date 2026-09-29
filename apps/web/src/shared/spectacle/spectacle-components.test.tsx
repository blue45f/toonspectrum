// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpectacleBackdrop } from "./SpectacleBackdrop";
import { SpectacleArt } from "./SpectacleArt";
import { SpectacleBarChart } from "./SpectacleBarChart";
import { SpectacleCountUp } from "./SpectacleCountUp";
import { SpectacleEmptyState } from "./SpectacleEmptyState";
import { SpectacleGlowButton } from "./SpectacleGlowButton";
import { SpectacleHero } from "./SpectacleHero";
import { SpectaclePageTransition } from "./SpectaclePageTransition";
import { SpectacleProgressRing } from "./SpectacleProgressRing";
import { SpectacleReveal } from "./SpectacleReveal";
import { SpectacleSkeleton } from "./SpectacleSkeleton";
import { SpectacleTiltCard } from "./SpectacleTiltCard";
import { SpectacleTypewriter } from "./SpectacleTypewriter";
import { useSpectacleCelebration } from "./useSpectacleCelebration";
import { writeAmbientIntensity } from "../ambient/ambient-engine";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

// jsdom은 hardwareConcurrency=2로 보고되어 저전력으로 감지된다.
// heavy 연출(full 수준) 테스트를 위해 고성능 환경으로 고정한다.
vi.mock("../ambient/ambient-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("../ambient/ambient-engine")>();
  return { ...original, isLowPowerEnvironment: () => false };
});

beforeEach(() => {
  localStorage.clear();
  // jsdom: matchMedia 미구현 → reducedMotion false, 모바일 UA 아님 → vivid면 full
  writeAmbientIntensity("vivid");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SpectacleHero", () => {
  it("full 수준에서 반짝이 캔버스를 렌더한다", () => {
    const { container } = render(
      <SpectacleHero>
        <h1>hero</h1>
      </SpectacleHero>,
    );
    expect(screen.getByText("hero")).toBeTruthy();
    expect(container.querySelector(".spectacle-sparkle-canvas")).toBeTruthy();
    expect(container.querySelector(".spectacle-full")).toBeTruthy();
  });

  it("off면 캔버스 없이 정적 히어로", () => {
    writeAmbientIntensity("off");
    const { container } = render(
      <SpectacleHero>
        <h1>hero</h1>
      </SpectacleHero>,
    );
    expect(container.querySelector(".spectacle-sparkle-canvas")).toBeNull();
  });
});

describe("SpectacleTypewriter", () => {
  it("motion이 꺼지면 첫 문장을 즉시 표시한다", () => {
    writeAmbientIntensity("off");
    render(<SpectacleTypewriter lines={["첫 문장", "둘째 문장"]} />);
    expect(screen.getByText("첫 문장")).toBeTruthy();
  });

  it("motion이 켜지면 aria-label에 전체 문장을 제공한다", () => {
    render(<SpectacleTypewriter lines={["첫 문장", "둘째 문장"]} />);
    const element = screen.getByLabelText("첫 문장 둘째 문장");
    expect(element.className).toContain("spectacle-typewriter");
  });
});

describe("SpectacleTiltCard", () => {
  it("full에서 틸트 클래스를 가진다", () => {
    const { container } = render(
      <SpectacleTiltCard>
        <span>card</span>
      </SpectacleTiltCard>,
    );
    expect(container.querySelector(".spectacle-tilt")).toBeTruthy();
  });

  it("off면 일반 div로 폴백한다", () => {
    writeAmbientIntensity("off");
    const { container } = render(
      <SpectacleTiltCard>
        <span>card</span>
      </SpectacleTiltCard>,
    );
    expect(container.querySelector(".spectacle-tilt")).toBeNull();
    expect(screen.getByText("card")).toBeTruthy();
  });

  it("마우스 이동 시 transform이 적용된다", () => {
    const { container } = render(
      <SpectacleTiltCard>
        <span>card</span>
      </SpectacleTiltCard>,
    );
    const card = container.querySelector(".spectacle-tilt") as HTMLElement;
    // jsdom의 getBoundingClientRect는 0을 반환하므로 실제 크기를 모킹한다
    card.getBoundingClientRect = () =>
      ({
        left: 0, top: 0, width: 200, height: 100,
        right: 200, bottom: 100, x: 0, y: 0,
        toJSON: () => undefined,
      }) as DOMRect;
    const move = new window.PointerEvent("pointermove", {
      clientX: 100,
      clientY: 50,
      pointerType: "mouse",
      bubbles: true,
    });
    fireEvent(card, move);
    expect(card.style.transform).toContain("rotateX");
    fireEvent.pointerLeave(card);
    expect(card.style.transform).toBe("");
  });
});

describe("SpectacleCountUp", () => {
  it("off면 최종값을 즉시 표시한다", () => {
    writeAmbientIntensity("off");
    render(<SpectacleCountUp value={1234} />);
    expect(screen.getByLabelText("1,234")).toBeTruthy();
    expect(screen.getByText("1,234")).toBeTruthy();
  });

  it("tabular-nums 클래스를 가진다", () => {
    render(<SpectacleCountUp value={99} />);
    expect(screen.getByLabelText("99").className).toContain("spectacle-count-up");
  });
});

describe("SpectacleProgressRing", () => {
  it("progressbar 역할과 값을 가진다", () => {
    render(<SpectacleProgressRing value={0.72} />);
    const ring = screen.getByRole("progressbar");
    expect(ring.getAttribute("aria-valuenow")).toBe("72");
  });

  it("0~1 범위로 클램프한다", () => {
    render(<SpectacleProgressRing value={2} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("SpectacleSkeleton", () => {
  it("로딩 중이면 스켈레톤을 표시한다", () => {
    render(
      <SpectacleSkeleton loading skeletonClassName="h-10" label="불러오는 중">
        <span>content</span>
      </SpectacleSkeleton>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("로딩 완료 시 콘텐츠를 모핑 표시한다", () => {
    const { container } = render(
      <SpectacleSkeleton loading={false}>
        <span>content</span>
      </SpectacleSkeleton>,
    );
    expect(screen.getByText("content")).toBeTruthy();
    expect(container.querySelector(".spectacle-morph-enter")).toBeTruthy();
  });
});

describe("SpectacleBackdrop", () => {
  it("변형 레이어를 렌더한다", () => {
    const { container } = render(
      <SpectacleBackdrop variants={["aurora", "grid"]}>
        <span>inner</span>
      </SpectacleBackdrop>,
    );
    expect(container.querySelector(".spectacle-backdrop-aurora")).toBeTruthy();
    expect(container.querySelector(".spectacle-backdrop-grid")).toBeTruthy();
  });

  it("off면 레이어를 렌더하지 않는다", () => {
    writeAmbientIntensity("off");
    const { container } = render(
      <SpectacleBackdrop variants={["aurora"]}>
        <span>inner</span>
      </SpectacleBackdrop>,
    );
    expect(container.querySelector(".spectacle-backdrop-layer")).toBeNull();
    expect(screen.getByText("inner")).toBeTruthy();
  });
});

describe("SpectacleEmptyState", () => {
  it("기본 한국어 문구와 일러스트를 렌더한다", () => {
    const { container } = render(<SpectacleEmptyState kind="empty" />);
    expect(screen.getByText("아직 비어 있어요")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("커스텀 문구와 액션을 렌더한다", () => {
    render(
      <SpectacleEmptyState
        kind="error"
        title="커스텀 제목"
        description="커스텀 설명"
        action={<button type="button">다시 시도</button>}
      />,
    );
    expect(screen.getByText("커스텀 제목")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});

describe("SpectacleReveal", () => {
  it("motion이 켜지면 리빌 클래스를 가진다", () => {
    const { container } = render(
      <SpectacleReveal direction="left">
        <span>revealed</span>
      </SpectacleReveal>,
    );
    expect(container.querySelector(".spectacle-reveal-left")).toBeTruthy();
    expect(screen.getByText("revealed")).toBeTruthy();
  });

  it("off면 애니메이션 클래스 없이 렌더한다", () => {
    writeAmbientIntensity("off");
    const { container } = render(
      <SpectacleReveal>
        <span>revealed</span>
      </SpectacleReveal>,
    );
    expect(container.querySelector(".spectacle-reveal")).toBeNull();
    expect(screen.getByText("revealed")).toBeTruthy();
  });
});

describe("SpectaclePageTransition", () => {
  it("enter 클래스로 렌더한다", () => {
    const { container } = render(
      <SpectaclePageTransition transitionKey="home">
        <span>page</span>
      </SpectaclePageTransition>,
    );
    expect(container.querySelector(".spectacle-page-enter")).toBeTruthy();
    expect(screen.getByText("page")).toBeTruthy();
  });

  it("off면 전환 클래스 없이 즉시 표시한다", () => {
    writeAmbientIntensity("off");
    const { container } = render(
      <SpectaclePageTransition transitionKey="home">
        <span>page</span>
      </SpectaclePageTransition>,
    );
    expect(container.querySelector(".spectacle-page-enter")).toBeNull();
    expect(screen.getByText("page")).toBeTruthy();
  });

  it("키가 바뀌면 exit 중 이전 스냅샷을 보여주고 타이머 후 새 화면으로 전환한다", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(
        <SpectaclePageTransition transitionKey="a" exitMs={160}>
          <span>page-a</span>
        </SpectaclePageTransition>,
      );
      rerender(
        <SpectaclePageTransition transitionKey="b" exitMs={160}>
          <span>page-b</span>
        </SpectaclePageTransition>,
      );
      // exit 단계: 이전 화면 유지 + exit 클래스
      expect(container.querySelector(".spectacle-page-exit")).toBeTruthy();
      expect(screen.getByText("page-a")).toBeTruthy();
      // 부모가 리렌더돼도 타이머가 흔들리지 않아야 한다
      rerender(
        <SpectaclePageTransition transitionKey="b" exitMs={160}>
          <span>page-b</span>
        </SpectaclePageTransition>,
      );
      expect(container.querySelector(".spectacle-page-exit")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(160);
      });
      // enter 단계: 새 화면 + enter 클래스
      expect(container.querySelector(".spectacle-page-enter")).toBeTruthy();
      expect(screen.getByText("page-b")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SpectacleGlowButton", () => {
  it("버튼으로 렌더하고 글로우 레이어를 가진다", () => {
    const { container } = render(
      <SpectacleGlowButton onClick={() => undefined}>glow</SpectacleGlowButton>,
    );
    const button = screen.getByRole("button", { name: "glow" });
    expect(button).toBeTruthy();
    expect(container.querySelector(".spectacle-glow-btn-glow")).toBeTruthy();
  });

  it("클릭 핸들러가 동작한다", () => {
    let clicked = 0;
    render(
      <SpectacleGlowButton onClick={() => { clicked += 1; }}>
        glow
      </SpectacleGlowButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "glow" }));
    expect(clicked).toBe(1);
  });

  it("마우스 이동 시 글로우 좌표 CSS 변수를 설정한다", () => {
    const { container } = render(
      <SpectacleGlowButton>glow</SpectacleGlowButton>,
    );
    const button = container.querySelector(
      ".spectacle-glow-btn",
    ) as HTMLElement;
    // jsdom의 getBoundingClientRect는 0을 반환하므로 실제 크기를 모킹한다
    button.getBoundingClientRect = () =>
      ({
        left: 0, top: 0, width: 100, height: 40,
        right: 100, bottom: 40, x: 0, y: 0,
        toJSON: () => undefined,
      }) as DOMRect;
    const move = new window.PointerEvent("pointermove", {
      clientX: 30,
      clientY: 10,
      pointerType: "mouse",
      bubbles: true,
    });
    fireEvent(button, move);
    expect(button.style.getPropertyValue("--spectacle-glow-x")).not.toBe("");
  });
});

describe("SpectacleBarChart", () => {
  const data = [
    { label: "월", value: 42 },
    { label: "화", value: 68 },
  ];

  it("막대와 라벨을 렌더한다", () => {
    const { container } = render(<SpectacleBarChart data={data} />);
    expect(container.querySelectorAll(".spectacle-bar-fill")).toHaveLength(2);
    expect(screen.getByText("월")).toBeTruthy();
    expect(screen.getByText("68")).toBeTruthy();
  });

  it("차트 전체를 설명하는 aria-label을 제공한다", () => {
    render(<SpectacleBarChart data={data} />);
    expect(screen.getByLabelText("월: 42, 화: 68")).toBeTruthy();
  });

  it("막대 비율 CSS 변수를 설정한다", () => {
    const { container } = render(<SpectacleBarChart data={data} maxValue={100} />);
    const fills = container.querySelectorAll(
      ".spectacle-bar-fill",
    ) as unknown as HTMLElement[];
    expect(fills[0].style.getPropertyValue("--spectacle-bar-ratio")).toBe("0.420");
    expect(fills[1].style.getPropertyValue("--spectacle-bar-ratio")).toBe("0.680");
  });
});

describe("useSpectacleCelebration", () => {
  function CelebrateButton() {
    const { celebrate } = useSpectacleCelebration();
    return (
      <button type="button" onClick={() => celebrate()}>
        celebrate
      </button>
    );
  }

  it("off 수준에서는 컨페티 캔버스를 만들지 않는다", () => {
    writeAmbientIntensity("off");
    render(<CelebrateButton />);
    fireEvent.click(screen.getByRole("button", { name: "celebrate" }));
    expect(document.querySelector(".spectacle-confetti-canvas")).toBeNull();
  });

  function FireworksButton() {
    const { fireworks } = useSpectacleCelebration();
    return (
      <button type="button" onClick={() => fireworks({ burstCount: 2 })}>
        fireworks
      </button>
    );
  }

  it("off 수준에서는 폭죽 캔버스를 만들지 않는다", () => {
    writeAmbientIntensity("off");
    render(<FireworksButton />);
    fireEvent.click(screen.getByRole("button", { name: "fireworks" }));
    expect(document.querySelector(".spectacle-confetti-canvas")).toBeNull();
  });
});

describe("SpectacleArt", () => {
  it("kind별로 SVG 일러스트를 렌더링한다", () => {
    const kinds = ["celebration", "growth", "magic"] as const;
    for (const kind of kinds) {
      const { container, unmount } = render(<SpectacleArt kind={kind} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      unmount();
    }
  });

  it("title이 있으면 img 역할을 가진다", () => {
    render(<SpectacleArt kind="celebration" title="축하 일러스트" />);
    const img = screen.getByRole("img", { name: "축하 일러스트" });
    expect(img).not.toBeNull();
    expect(img.getAttribute("role")).toBe("img");
  });
});
