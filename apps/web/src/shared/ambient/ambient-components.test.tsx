// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AmbientExperienceHost } from "./AmbientExperienceHost";
import { AmbientLoading } from "./AmbientLoading";
import { AmbientReveal } from "./AmbientReveal";
import { AmbientSettingsSection } from "./AmbientSettingsSection";
import { MagneticGlow } from "./MagneticGlow";
import {
  AMBIENT_STORAGE_KEYS,
  readAmbientPreferences,
  writeAmbientEffect,
  writeAmbientIntensity,
} from "./ambient-preferences";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

const originalMatchMedia = window.matchMedia;

function stubReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function stubGeolocation(available: boolean) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: available
      ? { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) }
      : undefined,
  });
}

beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
  stubGeolocation(false);
  // 실제 네트워크 대신 맑은 날씨 응답.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ current: { temperature_2m: 20, weather_code: 0 } }), { status: 200 }),
    ),
  );
  // jsdom에는 2D 캔버스가 없다: 렌더러는 null을 받아 조용히 건너뛴다.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
});

describe("AmbientReveal", () => {
  it("자식을 렌더하고 reveal 클래스를 가진다", () => {
    render(<AmbientReveal>hello</AmbientReveal>);
    expect(screen.getByText("hello").className).toContain("reveal");
  });

  it("soft면 reveal-soft 클래스", () => {
    render(<AmbientReveal soft>soft</AmbientReveal>);
    expect(screen.getByText("soft").className).toContain("reveal-soft");
  });

  it("IO 미지원 시에도 콘텐츠가 보인다", () => {
    const original = window.IntersectionObserver;
    // @ts-expect-error 테스트용 삭제
    delete window.IntersectionObserver;
    render(<AmbientReveal>no-io</AmbientReveal>);
    expect(screen.getByText("no-io").className).toContain("is-revealed");
    window.IntersectionObserver = original;
  });
});

describe("MagneticGlow", () => {
  it("자식을 감싸 렌더하고 마우스 이동에 반응한다", () => {
    const { container } = render(
      <MagneticGlow>
        <button type="button">click</button>
      </MagneticGlow>,
    );
    expect(screen.getByRole("button", { name: "click" })).toBeTruthy();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("ambient-magnetic");
    fireEvent.mouseMove(wrapper, { clientX: 60, clientY: 30 });
    expect(wrapper).toBeTruthy();
  });
});

describe("AmbientLoading", () => {
  it("dots·brush 변형과 라벨을 렌더한다", () => {
    const { container, unmount } = render(<AmbientLoading />);
    expect(container.querySelector(".ambient-loading-dots")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("불러오는 중");
    unmount();
    const brush = render(<AmbientLoading variant="brush" label="날씨 불러오는 중" />);
    expect(brush.container.querySelector(".ambient-loading-brush")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("날씨 불러오는 중");
  });
});

describe("AmbientSettingsSection", () => {
  it("강도 3단계와 효과 7종을 라디오로 보여 준다", () => {
    render(<AmbientSettingsSection />);
    expect(screen.getByRole("heading", { name: "날씨·계절 배경" })).toBeTruthy();
    for (const name of ["끔", "은은하게", "화려하게"]) {
      expect(screen.getByRole("radio", { name: new RegExp(name) })).toBeTruthy();
    }
    for (const name of ["자동", "맑음", "비", "눈", "벚꽃", "낙엽", "반딧불"]) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect((screen.getByRole("radio", { name: /은은하게/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /^자동/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("강도를 바꾸면 저장된다", () => {
    render(<AmbientSettingsSection />);
    const vivid = screen.getByRole("radio", { name: /화려하게/ }) as HTMLInputElement;
    fireEvent.click(vivid);
    expect(readAmbientPreferences().intensity).toBe("vivid");
    expect(vivid.checked).toBe(true);
  });

  it("효과를 고르면 즉시 저장되고 상태 줄에 반영된다", () => {
    render(<AmbientSettingsSection />);
    fireEvent.click(screen.getByRole("radio", { name: /^눈/ }));
    expect(localStorage.getItem(AMBIENT_STORAGE_KEYS.effect)).toBe("snow");
    expect(screen.getByText("배경: 눈 (직접 선택)")).toBeTruthy();
  });

  it("강도가 꺼져 있으면 효과를 고를 수 없고 안내한다", () => {
    writeAmbientIntensity("off");
    render(<AmbientSettingsSection />);
    expect((screen.getByRole("radio", { name: /^비/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("연출 강도를 켜면 효과를 고를 수 있어요.")).toBeTruthy();
    expect(screen.getByText("배경 효과 꺼짐")).toBeTruthy();
  });

  it("자동 모드에서는 기본 서울 날씨로 상태를 보여 준다", async () => {
    render(<AmbientSettingsSection />);
    await waitFor(() => expect(screen.getByText(/^서울 · 맑음 · /)).toBeTruthy());
    expect(screen.getByText(/배경: (햇살|별빛)/)).toBeTruthy();
  });

  it("위치를 쓸 수 없는 환경이면 토글을 막고 이유를 알려 준다", () => {
    render(<AmbientSettingsSection />);
    const toggle = screen.getByRole("switch", { name: "내 위치 날씨 사용" }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(/위치를 쓸 수 없어 서울 날씨를 사용해요/)).toBeTruthy();
  });

  it("내 위치 날씨 사용을 켜면 저장한다", () => {
    stubGeolocation(true);
    render(<AmbientSettingsSection />);
    const toggle = screen.getByRole("switch", { name: "내 위치 날씨 사용" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(readAmbientPreferences().location).toBe("on");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("움직임 줄이기 사용자에게 안내한다", () => {
    stubReducedMotion(true);
    render(<AmbientSettingsSection />);
    expect(screen.getByText(/움직임 줄이기 설정이 켜져 있어/)).toBeTruthy();
  });
});

describe("AmbientExperienceHost", () => {
  it("콘텐츠 뒤 배경 캔버스 하나만 그린다(틴트 레이어 없음)", () => {
    writeAmbientEffect("rain");
    const { container } = render(<AmbientExperienceHost />);
    const canvas = container.querySelector("canvas.ambient-backdrop");
    expect(canvas?.getAttribute("data-ambient-surface")).toBe("backdrop");
    expect(canvas?.getAttribute("data-ambient-scene")).toBe("rain");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ambient-tint, .ambient-tint-gradient")).toBeNull();
    expect(container.children).toHaveLength(1);
  });

  it("설정을 바꾸면 같은 탭에서 바로 장면이 바뀐다", () => {
    writeAmbientEffect("rain");
    const { container } = render(<AmbientExperienceHost />);
    act(() => writeAmbientEffect("petals"));
    expect(container.querySelector("canvas")?.getAttribute("data-ambient-scene")).toBe("petals");
  });

  it("강도 끔·움직임 줄이기에서는 아무것도 그리지 않는다", () => {
    writeAmbientEffect("rain");
    writeAmbientIntensity("off");
    const off = render(<AmbientExperienceHost />);
    expect(off.container.querySelector("canvas")).toBeNull();
    off.unmount();

    writeAmbientIntensity("subtle");
    stubReducedMotion(true);
    const reduced = render(<AmbientExperienceHost />);
    expect(reduced.container.querySelector("canvas")).toBeNull();
  });

  it("자동 모드는 첫 날씨 응답 전에는 비워 두었다가 날씨 장면을 그린다", async () => {
    const { container } = render(<AmbientExperienceHost />);
    await waitFor(() =>
      expect(container.querySelector("canvas")?.getAttribute("data-ambient-scene")).toMatch(/sunny|clear-night/),
    );
  });
});
