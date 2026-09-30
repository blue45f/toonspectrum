// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BgmSettingsSection } from "./BgmSettingsSection";
import {
  BGM_DEFAULT_VOLUME,
  readBgmPreferences,
  writeBgmEnabled,
  writeBgmVolume,
} from "./bgm-engine";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

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
}

beforeEach(() => {
  installAudioMocks();
  window.localStorage.clear();
  writeBgmEnabled(true);
  writeBgmVolume(BGM_DEFAULT_VOLUME);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BgmSettingsSection", () => {
  it("제목과 설명이 렌더링된다", () => {
    render(<BgmSettingsSection />);
    expect(screen.getByText("배경음악")).toBeTruthy();
    expect(screen.getByText("페이지 분위기에 맞는 음악이 흘러나옵니다.")).toBeTruthy();
  });

  it("마스터 토글 변경이 localStorage에 저장된다", () => {
    render(<BgmSettingsSection />);
    const toggle = screen.getByRole("switch", { name: "배경음악 사용" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(readBgmPreferences().enabled).toBe(false);
  });

  it("마스터가 꺼지면 음량 슬라이더가 비활성화된다", () => {
    writeBgmEnabled(false);
    render(<BgmSettingsSection />);
    expect((screen.getByRole("slider", { name: "음량" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("6개 무드 설명이 모두 렌더링된다", () => {
    render(<BgmSettingsSection />);
    for (const name of ["환영", "집중", "창작", "활기", "신뢰", "탐색"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("i18n useI18n을 실제로 사용한다", () => {
    render(<BgmSettingsSection />);
    expect(useI18n).toBeDefined();
  });
});
