import { describe, it, expect } from "vitest";

import {
  AMBIENT_PRESETS,
  DEFAULT_WORK_FX,
  REVEAL_PRESETS,
  buildAmbientParticles,
  findAmbientPreset,
  hasAnyFx,
  readWorkFx,
  revealHiddenStyle,
  stepAmbientParticle,
} from "./studio-motion-fx";

describe("프리셋 데이터", () => {
  it("리빌·앰비언트 id는 유일하고 'none'을 포함한다", () => {
    const r = REVEAL_PRESETS.map((p) => p.id);
    const a = AMBIENT_PRESETS.map((p) => p.id);
    expect(new Set(r).size).toBe(r.length);
    expect(new Set(a).size).toBe(a.length);
    expect(r).toContain("none");
    expect(a).toContain("none");
  });
});

describe("readWorkFx", () => {
  it("doc에 fx가 없으면 기본값", () => {
    expect(readWorkFx({})).toEqual(DEFAULT_WORK_FX);
    expect(readWorkFx(null)).toEqual(DEFAULT_WORK_FX);
    expect(readWorkFx(undefined)).toEqual(DEFAULT_WORK_FX);
  });

  it("유효한 fx를 정규화해 읽는다", () => {
    const fx = readWorkFx({ fx: { reveal: "fade-up", ambient: "snow", bgmMood: "calm", bgmUrl: "https://x/y.mp3", bgmVolume: 0.3 } });
    expect(fx.reveal).toBe("fade-up");
    expect(fx.ambient).toBe("snow");
    expect(fx.bgmMood).toBe("calm");
    expect(fx.bgmUrl).toBe("https://x/y.mp3");
    expect(fx.bgmVolume).toBe(0.3);
  });

  it("잘못된 reveal/ambient는 기본값으로 떨어진다", () => {
    const fx = readWorkFx({ fx: { reveal: "nope", ambient: "lava" } });
    expect(fx.reveal).toBe("none");
    expect(fx.ambient).toBe("none");
  });

  it("볼륨은 0..1로 클램프", () => {
    expect(readWorkFx({ fx: { bgmVolume: 5 } }).bgmVolume).toBe(1);
    expect(readWorkFx({ fx: { bgmVolume: -2 } }).bgmVolume).toBe(0);
  });
});

describe("hasAnyFx", () => {
  it("전부 기본이면 false, 하나라도 켜지면 true", () => {
    expect(hasAnyFx(DEFAULT_WORK_FX)).toBe(false);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, reveal: "zoom-in" })).toBe(true);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, ambient: "rain" })).toBe(true);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, bgmMood: "calm" })).toBe(true);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, bgmUrl: "http://x" })).toBe(true);
  });
});

describe("revealHiddenStyle", () => {
  it("none/미지정은 완전 표시 상태", () => {
    expect(revealHiddenStyle("none")).toEqual({ opacity: 1, transform: "none", filter: "none" });
    expect(revealHiddenStyle("xxx")).toEqual({ opacity: 1, transform: "none", filter: "none" });
  });
  it("fade-up은 아래로 이동+투명", () => {
    const s = revealHiddenStyle("fade-up");
    expect(s.opacity).toBe(0);
    expect(s.transform).toContain("translateY");
  });
  it("blur-in은 흐림 필터", () => {
    expect(revealHiddenStyle("blur-in").filter).toContain("blur");
  });
});

describe("buildAmbientParticles", () => {
  it("none/0 크기는 빈 배열", () => {
    expect(buildAmbientParticles(AMBIENT_PRESETS[0], 720, 1000)).toEqual([]);
    const rain = findAmbientPreset("rain")!;
    expect(buildAmbientParticles(rain, 0, 1000)).toEqual([]);
    expect(buildAmbientParticles(rain, 720, 0)).toEqual([]);
  });

  it("같은 시드면 같은 입자(결정적)", () => {
    const snow = findAmbientPreset("snow")!;
    const a = buildAmbientParticles(snow, 720, 1000, 7);
    const b = buildAmbientParticles(snow, 720, 1000, 7);
    expect(a).toEqual(b);
    const c = buildAmbientParticles(snow, 720, 1000, 8);
    expect(c).not.toEqual(a);
  });

  it("입자는 캔버스 범위 안에서 시작하고 크기 범위를 지킨다", () => {
    const petals = findAmbientPreset("petals")!;
    const ps = buildAmbientParticles(petals, 720, 1280, 3);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(720);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1280);
      expect(p.size).toBeGreaterThanOrEqual(petals.minSize);
      expect(p.size).toBeLessThanOrEqual(petals.maxSize);
    }
  });

  it("폭이 넓으면 입자 수가 비례해 늘어난다", () => {
    const rain = findAmbientPreset("rain")!;
    const narrow = buildAmbientParticles(rain, 360, 1000, 1).length;
    const wide = buildAmbientParticles(rain, 1440, 1000, 1).length;
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe("stepAmbientParticle", () => {
  it("입력을 변형하지 않고(불변) 위치를 전진시킨다", () => {
    const p = { x: 100, y: 100, size: 4, vx: 0, vy: 60, rot: 0, vr: 0, phase: 0 };
    const next = stepAmbientParticle(p, 720, 1000, 0.5);
    expect(p.y).toBe(100); // 원본 불변
    expect(next.y).toBeGreaterThan(100);
  });

  it("아래로 빠지면 위에서 재진입(래핑)", () => {
    const p = { x: 100, y: 999, size: 4, vx: 0, vy: 60, rot: 0, vr: 0, phase: 0 };
    const next = stepAmbientParticle(p, 720, 1000, 1);
    expect(next.y).toBeLessThan(0);
  });
});
