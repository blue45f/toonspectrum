// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getPwaInstallPlatformGuide,
  listPwaInstallPlatformGuides,
} from "./pwa-install-platform-guide";

describe("pwa-install-platform-guide", () => {
  it("플랫폼별 가이드를 반환한다", () => {
    expect(getPwaInstallPlatformGuide("ios").steps).toHaveLength(4);
    expect(getPwaInstallPlatformGuide("android").steps).toHaveLength(4);
    expect(getPwaInstallPlatformGuide("desktop").steps).toHaveLength(3);
  });

  it("알 수 없는 플랫폼은 기본 가이드를 반환한다", () => {
    const guide = getPwaInstallPlatformGuide("unknown");
    expect(guide.steps.length).toBeGreaterThan(0);
    for (const step of guide.steps) {
      expect(step.ko.length).toBeGreaterThan(0);
      expect(step.en.length).toBeGreaterThan(0);
      expect(step.koDescription.length).toBeGreaterThan(0);
      expect(step.enDescription.length).toBeGreaterThan(0);
    }
  });

  it("모든 단계에 한영 문구가 빠짐없이 있다", () => {
    for (const guide of listPwaInstallPlatformGuides()) {
      expect(guide.tabKo.length).toBeGreaterThan(0);
      expect(guide.tabEn.length).toBeGreaterThan(0);
      for (const step of guide.steps) {
        expect(step.ko.length).toBeGreaterThan(0);
        expect(step.en.length).toBeGreaterThan(0);
      }
    }
  });
});
