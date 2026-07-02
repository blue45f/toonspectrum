import { describe, it, expect } from "vitest";

import { planMotionExport } from "./studio-motion-export";
import {
  AMBIENT_PRESETS,
  CUT_BGM_SILENCE,
  DEFAULT_WORK_FX,
  EMPHASIS_PRESETS,
  REVEAL_PRESETS,
  SFX_STINGER_PRESETS,
  buildAmbientParticles,
  cutFx,
  emphasisAnimation,
  findAmbientPreset,
  findSfxStingerPreset,
  hasAnyFx,
  hasCutAudioFx,
  readWorkFx,
  revealHiddenStyle,
  stepAmbientParticle,
  type WorkFxSettings,
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

  it("컷별 강조/리빌이 있으면 true", () => {
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, cuts: [{ reveal: "", emphasis: "shake" }] })).toBe(true);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, cuts: [{ reveal: "zoom-in", emphasis: "none" }] })).toBe(true);
    expect(hasAnyFx({ ...DEFAULT_WORK_FX, cuts: [{ reveal: "", emphasis: "none" }] })).toBe(false);
  });
});

describe("컷별 효과(cuts)", () => {
  it("readWorkFx는 cuts 배열을 정규화한다", () => {
    const fx = readWorkFx({ fx: { cuts: [{ reveal: "fade-up", emphasis: "shake" }, { reveal: "bad", emphasis: "nope" }, 42] } });
    expect(fx.cuts).toHaveLength(3);
    expect(fx.cuts[0]).toEqual({ reveal: "fade-up", emphasis: "shake" });
    expect(fx.cuts[1]).toEqual({ reveal: "", emphasis: "none" }); // 잘못된 값은 기본
    expect(fx.cuts[2]).toEqual({ reveal: "", emphasis: "none" }); // 객체 아님
  });

  it("cuts가 없으면 빈 배열", () => {
    expect(readWorkFx({ fx: {} }).cuts).toEqual([]);
  });

  it("cutFx: 컷별 reveal이 비면 작품 기본 reveal 상속", () => {
    const fx = { ...DEFAULT_WORK_FX, reveal: "zoom-in", cuts: [{ reveal: "", emphasis: "shake" }] };
    expect(cutFx(fx, 0)).toEqual({ reveal: "zoom-in", emphasis: "shake" });
  });

  it("cutFx: 컷별 reveal이 있으면 그걸 사용", () => {
    const fx = { ...DEFAULT_WORK_FX, reveal: "zoom-in", cuts: [{ reveal: "slide-in", emphasis: "none" }] };
    expect(cutFx(fx, 0).reveal).toBe("slide-in");
  });

  it("cutFx: 범위 밖 인덱스는 작품 기본 + 강조 없음", () => {
    const fx = { ...DEFAULT_WORK_FX, reveal: "fade", cuts: [] };
    expect(cutFx(fx, 5)).toEqual({ reveal: "fade", emphasis: "none" });
  });
});

describe("SE 스팅어 프리셋", () => {
  it("8종이고 id가 유일하며 라벨이 기획(두근/쿵/휙/반짝/긴장/타격/또르르/빰)을 덮는다", () => {
    expect(SFX_STINGER_PRESETS).toHaveLength(8);
    const ids = SFX_STINGER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SFX_STINGER_PRESETS.map((p) => p.label)).toEqual([
      "두근",
      "쿵",
      "휙",
      "반짝",
      "긴장",
      "타격",
      "또르르",
      "빰",
    ]);
  });

  it("노트 파라미터가 Web Audio로 재생 가능한 범위다(양수 주파수·0..1 게인·어택<길이)", () => {
    for (const p of SFX_STINGER_PRESETS) {
      expect(p.duration).toBeGreaterThan(0);
      expect(p.notes.length).toBeGreaterThan(0);
      for (const n of p.notes) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.duration).toBeGreaterThan(0);
        expect(n.at + n.duration).toBeLessThanOrEqual(p.duration + 1e-9); // 총 길이가 노트를 덮는다
        expect(n.freq).toBeGreaterThan(0);
        if (n.freqEnd != null) expect(n.freqEnd).toBeGreaterThan(0); // 지수 램프는 0을 못 지난다
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(n.attack).toBeGreaterThan(0);
        expect(n.attack).toBeLessThan(n.duration);
      }
    }
  });

  it("findSfxStingerPreset", () => {
    expect(findSfxStingerPreset("thud")?.label).toBe("쿵");
    expect(findSfxStingerPreset("nope")).toBeUndefined();
  });
});

describe("컷 오디오 필드(sfx·bgmShift) 정규화", () => {
  it("유효한 sfx·bgmShift를 읽는다", () => {
    const fx = readWorkFx({
      fx: { cuts: [{ reveal: "", emphasis: "none", sfx: { preset: "thud" }, bgmShift: { mood: "tense" } }] },
    });
    expect(fx.cuts[0].sfx).toEqual({ preset: "thud" });
    expect(fx.cuts[0].bgmShift).toEqual({ mood: "tense" });
  });

  it('bgmShift는 "silence"(음악 멈춤)도 허용한다', () => {
    const fx = readWorkFx({ fx: { cuts: [{ bgmShift: { mood: CUT_BGM_SILENCE } }] } });
    expect(fx.cuts[0].bgmShift).toEqual({ mood: "silence" });
  });

  it("잘못된 값은 키 자체를 만들지 않는다", () => {
    const fx = readWorkFx({
      fx: {
        cuts: [
          { sfx: { preset: "unknown" }, bgmShift: { mood: "" } }, // 모르는 프리셋 · 빈 무드
          { sfx: "thud", bgmShift: 42 }, // 객체 아님
          { sfx: {}, bgmShift: {} }, // 필드 누락
        ],
      },
    });
    for (const c of fx.cuts) {
      expect("sfx" in c).toBe(false);
      expect("bgmShift" in c).toBe(false);
    }
  });

  it("구버전 doc(필드 없음)은 새 키가 생기지 않는다(직렬화 하위호환)", () => {
    const fx = readWorkFx({ fx: { cuts: [{ reveal: "fade-up", emphasis: "shake" }] } });
    expect(fx.cuts[0]).toEqual({ reveal: "fade-up", emphasis: "shake" });
    expect(Object.keys(fx.cuts[0])).toEqual(["reveal", "emphasis"]);
  });

  it("cutFx는 sfx·bgmShift를 실효 효과에 실어 나른다(범위 밖·미지정은 undefined)", () => {
    const fx: WorkFxSettings = {
      ...DEFAULT_WORK_FX,
      reveal: "fade",
      cuts: [{ reveal: "", emphasis: "none", sfx: { preset: "hit" }, bgmShift: { mood: "epic" } }],
    };
    expect(cutFx(fx, 0)).toEqual({
      reveal: "fade",
      emphasis: "none",
      sfx: { preset: "hit" },
      bgmShift: { mood: "epic" },
    });
    expect(cutFx(fx, 3).sfx).toBeUndefined();
    expect(cutFx(fx, 3).bgmShift).toBeUndefined();
  });

  it("hasAnyFx/hasCutAudioFx — 컷 오디오만 있어도 효과로 친다", () => {
    const onlySfx: WorkFxSettings = {
      ...DEFAULT_WORK_FX,
      cuts: [{ reveal: "", emphasis: "none", sfx: { preset: "thud" } }],
    };
    const onlyShift: WorkFxSettings = {
      ...DEFAULT_WORK_FX,
      cuts: [{ reveal: "", emphasis: "none", bgmShift: { mood: "calm" } }],
    };
    expect(hasAnyFx(onlySfx)).toBe(true);
    expect(hasAnyFx(onlyShift)).toBe(true);
    expect(hasCutAudioFx(onlySfx)).toBe(true);
    expect(hasCutAudioFx(onlyShift)).toBe(true);
    expect(hasCutAudioFx(DEFAULT_WORK_FX)).toBe(false);
    expect(hasCutAudioFx({ ...DEFAULT_WORK_FX, cuts: [{ reveal: "zoom-in", emphasis: "shake" }] })).toBe(false);
  });
});

// studio-motion-export는 수정 없이 새 컷 오디오 필드를 "모른 채" 동작해야 한다(무시 보장).
describe("모션툰 영상 내보내기 하위호환", () => {
  it("planMotionExport는 sfx·bgmShift가 있어도 플랜이 동일하다(필드 무시)", () => {
    const opts = { fps: 10, revealSec: 0.5, holdSec: 1, tailSec: 0.5, width: 72, height: 128 };
    const base: WorkFxSettings = {
      ...DEFAULT_WORK_FX,
      reveal: "fade-up",
      bgmMood: "calm",
      cuts: [
        { reveal: "", emphasis: "shake" },
        { reveal: "slide-in", emphasis: "none" },
      ],
    };
    const withAudio: WorkFxSettings = {
      ...base,
      cuts: [
        { reveal: "", emphasis: "shake", sfx: { preset: "thud" }, bgmShift: { mood: "tense" } },
        { reveal: "slide-in", emphasis: "none", sfx: { preset: "sparkle" }, bgmShift: { mood: CUT_BGM_SILENCE } },
      ],
    };
    expect(planMotionExport(2, withAudio, opts)).toEqual(planMotionExport(2, base, opts));
  });
});

describe("emphasisAnimation", () => {
  it("none/미지정은 null", () => {
    expect(emphasisAnimation("none")).toBeNull();
    expect(emphasisAnimation("xxx")).toBeNull();
  });

  it("강조 프리셋은 키프레임+옵션을 돌려준다", () => {
    for (const p of EMPHASIS_PRESETS.filter((e) => e.id !== "none")) {
      const a = emphasisAnimation(p.id);
      expect(a).not.toBeNull();
      expect(a!.keyframes.length).toBeGreaterThanOrEqual(2);
      expect(a!.options.duration).toBeGreaterThan(0);
    }
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
