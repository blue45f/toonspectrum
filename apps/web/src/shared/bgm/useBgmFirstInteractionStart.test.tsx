// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { BgmController } from "./BgmController";
import { bgmEngine } from "./bgm-engine";
import {
  resetBgmAutoStartForTest,
  useBgmFirstInteractionStart,
} from "./useBgmFirstInteractionStart";


vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

function Harness({
  supported = true,
  enabled = true,
  reducedMotion = false,
  start,
}: {
  readonly supported?: boolean;
  readonly enabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly start: () => boolean;
}) {
  useBgmFirstInteractionStart({ supported, enabled, reducedMotion, start });
  return null;
}

function installAudioMocks() {
  const gainNode = () => ({
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
  });
  class MockAudioContext {
    destination = {};
    sampleRate = 44100;
    currentTime = 0;
    state = "running";
    createGain = gainNode;
    createDynamicsCompressor = () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: vi.fn() });
    createConvolver = () => ({ connect: vi.fn(), buffer: null });
    createBuffer = () => ({ getChannelData: () => new Float32Array(8) });
    createOscillator = () => ({ type: "", frequency: { value: 0 }, detune: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
    createBiquadFilter = () => ({ type: "", frequency: { value: 0 }, connect: vi.fn() });
    resume = vi.fn().mockResolvedValue(undefined);
    suspend = vi.fn().mockResolvedValue(undefined);
  }
  Object.defineProperty(window, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue({ matches: false }),
    configurable: true,
    writable: true,
  });
}

function interact(kind: "pointerdown" | "keydown") {
  act(() => {
    window.dispatchEvent(new window.Event(kind, { bubbles: true }));
  });
}

beforeEach(() => {
  installAudioMocks();
  window.localStorage.clear();
  resetBgmAutoStartForTest();
});

afterEach(() => {
  bgmEngine.stop();
  cleanup();
  vi.restoreAllMocks();
});

describe("useBgmFirstInteractionStart", () => {
  it("첫 pointerdown에서 start를 1회 호출한다", () => {
    const start = vi.fn(() => true);
    render(<Harness start={start} />);
    interact("pointerdown");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("keydown에서도 시작된다", () => {
    const start = vi.fn(() => true);
    render(<Harness start={start} />);
    interact("keydown");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("두 번째 이후 인터랙에서는 다시 시작하지 않는다", () => {
    const start = vi.fn(() => true);
    render(<Harness start={start} />);
    interact("pointerdown");
    interact("keydown");
    interact("pointerdown");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("start가 실패하면 다음 인터랙에서 재시도한다", () => {
    const start = vi.fn(() => false);
    render(<Harness start={start} />);
    interact("pointerdown");
    interact("pointerdown");
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("enabled=false이면 시작하지 않는다", () => {
    const start = vi.fn(() => true);
    render(<Harness start={start} enabled={false} />);
    interact("pointerdown");
    interact("keydown");
    expect(start).not.toHaveBeenCalled();
  });

  it("reducedMotion이면 시작하지 않는다", () => {
    const start = vi.fn(() => true);
    render(<Harness start={start} reducedMotion />);
    interact("pointerdown");
    expect(start).not.toHaveBeenCalled();
  });

  it("미지원 브라우저에서는 리스너를 등록하지 않는다", () => {
    const start = vi.fn(() => true);
    const addSpy = vi.spyOn(window, "addEventListener");
    render(<Harness start={start} supported={false} />);
    expect(addSpy).not.toHaveBeenCalledWith("pointerdown", expect.any(Function));
    interact("pointerdown");
    expect(start).not.toHaveBeenCalled();
  });
});

describe("BgmController 첫 인터랙 자동 시작", () => {
  it("첫 pointerdown에서 엔진이 현재 라우트 무드로 재생을 시작한다", () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <BgmController />
      </MemoryRouter>,
    );
    expect(bgmEngine.playing).toBe(false);
    interact("pointerdown");
    expect(bgmEngine.playing).toBe(true);
    expect(bgmEngine.currentMood).toBe("studio");
  });

  it("BGM을 끈 상태(enabled=false)에서는 자동 시작하지 않는다", () => {
    window.localStorage.setItem("ts_bgm_enabled", "0");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BgmController />
      </MemoryRouter>,
    );
    interact("pointerdown");
    expect(bgmEngine.playing).toBe(false);
  });
});
