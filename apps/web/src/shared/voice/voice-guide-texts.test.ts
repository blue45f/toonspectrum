import { describe, expect, it } from "vitest";

import {
  getVoiceGuideScript,
  VOICE_GUIDE_SCRIPT_IDS,
  VOICE_GUIDE_SCRIPTS,
} from "./voice-guide-texts";

const REQUIRED_SCRIPTS = ["home", "studio", "pricing", "product-tour"] as const;

describe("음성 안내 문구", () => {
  it("필수 페이지 스크립트가 모두 존재한다", () => {
    for (const id of REQUIRED_SCRIPTS) {
      expect(VOICE_GUIDE_SCRIPT_IDS).toContain(id);
      expect(VOICE_GUIDE_SCRIPTS[id]).toBeDefined();
    }
  });

  it("모든 스크립트에 한·영 문구가 비어 있지 않다", () => {
    for (const id of VOICE_GUIDE_SCRIPT_IDS) {
      const script = VOICE_GUIDE_SCRIPTS[id];
      expect(script.ko.trim().length).toBeGreaterThan(0);
      expect(script.en.trim().length).toBeGreaterThan(0);
    }
  });

  it("한국어 문구는 짧고 명확하다 (120자 이내)", () => {
    for (const id of VOICE_GUIDE_SCRIPT_IDS) {
      expect(VOICE_GUIDE_SCRIPTS[id].ko.length).toBeLessThanOrEqual(120);
    }
  });

  it("언어에 맞는 문구를 반환한다", () => {
    expect(getVoiceGuideScript("home", "ko")).toBe(VOICE_GUIDE_SCRIPTS.home.ko);
    expect(getVoiceGuideScript("home", "ko-KR")).toBe(VOICE_GUIDE_SCRIPTS.home.ko);
    expect(getVoiceGuideScript("home", "en")).toBe(VOICE_GUIDE_SCRIPTS.home.en);
    expect(getVoiceGuideScript("home", "en-US")).toBe(VOICE_GUIDE_SCRIPTS.home.en);
  });
});
