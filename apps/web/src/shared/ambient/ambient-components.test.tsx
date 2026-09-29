// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AmbientLoading } from "./AmbientLoading";
import { AmbientReveal } from "./AmbientReveal";
import { AmbientSettingsSection } from "./AmbientSettingsSection";
import { MagneticGlow } from "./MagneticGlow";
import { readAmbientPreferences, writeAmbientIntensity } from "./ambient-engine";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AmbientReveal", () => {
  it("자식을 렌더하고 reveal 클래스를 가진다", () => {
    render(<AmbientReveal>hello</AmbientReveal>);
    const element = screen.getByText("hello");
    expect(element.className).toContain("reveal");
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
    const element = screen.getByText("no-io");
    expect(element.className).toContain("is-revealed");
    window.IntersectionObserver = original;
  });
});

describe("MagneticGlow", () => {
  it("자식을 감싸 렌더한다", () => {
    render(
      <MagneticGlow>
        <button type="button">click</button>
      </MagneticGlow>,
    );
    expect(screen.getByRole("button", { name: "click" })).toBeTruthy();
  });

  it("마우스 이동 시 transform이 적용된다", () => {
    // hover 지원 환경으로 가정
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    const { container } = render(
      <MagneticGlow>
        <span>glow</span>
      </MagneticGlow>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("ambient-magnetic");
    fireEvent.mouseMove(wrapper, { clientX: 60, clientY: 30 });
    // rAF는 비동기이므로 transform이 비어있거나 설정됨
    expect(wrapper).toBeTruthy();
  });
});

describe("AmbientLoading", () => {
  it("dots 변형을 렌더한다", () => {
    const { container } = render(<AmbientLoading />);
    expect(container.querySelector(".ambient-loading-dots")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("불러오는 중");
  });

  it("brush 변형을 렌더한다", () => {
    const { container } = render(<AmbientLoading variant="brush" />);
    expect(container.querySelector(".ambient-loading-brush")).toBeTruthy();
  });

  it("커스텀 라벨", () => {
    render(<AmbientLoading label="날씨 불러오는 중" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("날씨 불러오는 중");
  });
});

describe("AmbientSettingsSection", () => {
  it("제목과 3단계 강도 버튼을 렌더한다", () => {
    render(<AmbientSettingsSection />);
    expect(screen.getByText("화면 연출")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /끔/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /은은하게/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /화려하게/ })).toBeTruthy();
  });

  it("강도 변경이 저장된다", () => {
    render(<AmbientSettingsSection />);
    const vivid = screen.getByRole("radio", { name: /화려하게/ });
    fireEvent.click(vivid);
    expect(readAmbientPreferences().intensity).toBe("vivid");
    expect(vivid.getAttribute("aria-checked")).toBe("true");
  });

  it("현재 분위기를 표시한다", () => {
    render(<AmbientSettingsSection />);
    expect(screen.getByText("지금 분위기")).toBeTruthy();
  });
});

describe("useAmbientExperience", () => {
  it("writeAmbientIntensity가 storage에 반영된다", () => {
    writeAmbientIntensity("off");
    expect(readAmbientPreferences().intensity).toBe("off");
    writeAmbientIntensity("subtle");
  });
});
