/**
 * @toonspectrum/core/fx/audio — 웹(/)·토스(apps/toss) 양쪽이 공유하는 **isomorphic 오디오 엔진**.
 *
 * 설계 원칙
 * - **음원 파일 0개**: 모든 소리는 Oscillator/Filter/Gain 으로 코드 생성합니다(전부 절차생성 = 저작권 free).
 * - **단일 lazy AudioContext**: 최초 사용자 제스처 시점에 1개만 만들고 재사용해요(autoplay 정책 준수).
 * - **graceful no-op**: SSR·비브라우저·미지원·차단 환경에서 어떤 호출도 조용히 무시되고 절대 throw 하지 않습니다.
 *   (`window`/`AudioContext` 가드 + 전역 try/catch). 토스 웹뷰·브라우저 모두에서 안전.
 * - **React/Tailwind/Node 의존 0**: Web Audio + (선택) localStorage 만 씁니다.
 *
 * 공개 표면(요약)
 * - 효과음:   `playSfx('tick'|'pop'|'success'|'error')`
 * - BGM:      `bgmPlay` / `bgmPause` / `bgmToggle` / `bgmNext` · 5개 무드 프리셋 자동 로테이션(crossfade)
 * - 마스터:   `setMuted` / `isMuted` · `setMasterVolume` / `getMasterVolume`
 * - 영속 opt-in: `setSfxEnabled` / `setBgmEnabled`(localStorage) + `getAudioState` / `onAudioStateChange`
 * - 언락:     `resumeAudio`(제스처 핸들러에서 호출하면 suspended 컨텍스트를 깨워요)
 */

/* ────────────────────────────────────────────────────────────────────────── *
 * 0. 컨텍스트 싱글톤 (lazy · 제스처 언락 · graceful)
 * ────────────────────────────────────────────────────────────────────────── */

type AudioContextCtor = typeof AudioContext;

let cachedContext: AudioContext | null = null;
let contextUnavailable = false;

const resolveAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === "undefined") return null;
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return typeof candidate === "function" ? candidate : null;
};

/**
 * 공유 AudioContext 를 반환해요(없으면 lazy 생성). 미지원/비브라우저면 null → 호출부는 no-op.
 * 최초 호출은 사용자 제스처 안에서 일어나도록 설계되어 있어요(autoplay 정책).
 */
const getAudioContext = (): AudioContext | null => {
  if (cachedContext) return cachedContext;
  if (contextUnavailable) return null;
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) {
    contextUnavailable = true;
    return null;
  }
  try {
    cachedContext = new Ctor();
    return cachedContext;
  } catch {
    contextUnavailable = true;
    return null;
  }
};

/** 현재 오디오 클럭(초). 컨텍스트 없으면 0. 스케줄링 기준 시각. */
const audioNow = (): number => {
  const ctx = getAudioContext();
  return ctx ? ctx.currentTime : 0;
};

/**
 * 컨텍스트를 resume 해 언락해요(제스처 핸들러 안에서 호출). 반환 Promise 는 절대 reject 되지 않아요.
 */
export const resumeAudio = async (): Promise<void> => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // 무시 — 다음 제스처에서 다시 시도돼요.
    }
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 1. 마스터 버스 (mute + volume — 모든 소리가 여기로 모임)
 * ────────────────────────────────────────────────────────────────────────── */

/** 합성 음량을 은은하게 유지하기 위한 마스터 상한(0~1 사용자 볼륨에 곱해짐). */
const MASTER_CEILING = 0.6;

let masterGain: GainNode | null = null;
let userVolume = 1; // 0~1, 사용자 볼륨.
let muted = false;

const targetMasterGain = (): number => (muted ? 0 : MASTER_CEILING * userVolume);

/** 마스터 게인 노드(모든 SFX/BGM 출력의 종착지). 컨텍스트당 1개. */
const ensureMasterGain = (ctx: AudioContext): GainNode => {
  if (masterGain) return masterGain;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(targetMasterGain(), ctx.currentTime);
  gain.connect(ctx.destination);
  masterGain = gain;
  return gain;
};

/** 마스터 게인을 현재 mute/volume 상태로 부드럽게 적용. */
const applyMasterGain = (): void => {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  try {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.linearRampToValueAtTime(targetMasterGain(), now + 0.08);
  } catch {
    // 무시.
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 2. 효과음(SFX) — tick / pop / success / error (전부 합성)
 * ────────────────────────────────────────────────────────────────────────── */

/** 재생 가능한 효과음 종류. */
export type SfxName = "tick" | "pop" | "success" | "error";

/**
 * 단일 오실레이터 톤을 soft attack/decay 엔벨로프로 마스터 버스에 재생해요(SFX 빌딩 블록).
 */
const playTone = (
  ctx: AudioContext,
  master: GainNode,
  options: {
    type: OscillatorType;
    frequency: number;
    startAt: number;
    duration: number;
    peak: number;
    /** attack 비율(0~1, duration 대비). 클수록 더 부드럽게 시작. */
    attackRatio?: number;
    /** 끝으로 갈수록 주파수를 미끄러뜨려 '딩/뽁' 느낌(선택). */
    glideToFrequency?: number;
  },
): void => {
  const { type, frequency, startAt, duration, peak, attackRatio = 0.2, glideToFrequency } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  if (glideToFrequency && glideToFrequency > 0) {
    osc.frequency.exponentialRampToValueAtTime(glideToFrequency, startAt + duration);
  }
  const attack = Math.max(0.004, duration * attackRatio);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
};

/** SFX 합성 레시피 — 종류별 음색/엔벨로프. (peak 는 SFX 마스터 기준 상대값.) */
const SFX_RECIPES: Record<SfxName, (ctx: AudioContext, master: GainNode, now: number) => void> = {
  // tick — 짧고 미묘한 틱(<80ms). 클릭/탭/포커스용. 두 톤을 살짝 겹쳐 둥근 클릭감.
  tick: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "sine",
      frequency: 880,
      startAt: now,
      duration: 0.055,
      peak: 0.28,
      attackRatio: 0.16,
      glideToFrequency: 640,
    });
    playTone(ctx, master, {
      type: "triangle",
      frequency: 1320,
      startAt: now,
      duration: 0.04,
      peak: 0.14,
      attackRatio: 0.1,
    });
  },
  // pop — 살짝 위로 솟는 '뽁'(버블/추가/좋아요). 빠른 상승 글라이드.
  pop: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "sine",
      frequency: 420,
      startAt: now,
      duration: 0.12,
      peak: 0.34,
      attackRatio: 0.08,
      glideToFrequency: 760,
    });
    playTone(ctx, master, {
      type: "triangle",
      frequency: 1180,
      startAt: now + 0.01,
      duration: 0.08,
      peak: 0.1,
      attackRatio: 0.06,
    });
  },
  // success — 밝은 상승 메이저 아르페지오(C E G C). 완료/저장/달성.
  success: (ctx, master, now) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      playTone(ctx, master, {
        type: "sine",
        frequency,
        startAt: now + index * 0.07,
        duration: 0.42 - index * 0.04,
        peak: 0.26 - index * 0.02,
        attackRatio: 0.08,
      });
    });
    // 윗배음 반짝임.
    playTone(ctx, master, {
      type: "triangle",
      frequency: 2093.0,
      startAt: now + 0.21,
      duration: 0.3,
      peak: 0.07,
      attackRatio: 0.1,
    });
  },
  // error — 낮게 떨어지는 단2도(부드러운 거절음, 거슬리지 않게). 실패/취소/유효성.
  error: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 330,
      startAt: now,
      duration: 0.16,
      peak: 0.26,
      attackRatio: 0.12,
      glideToFrequency: 247,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 220,
      startAt: now + 0.07,
      duration: 0.18,
      peak: 0.18,
      attackRatio: 0.14,
      glideToFrequency: 175,
    });
  },
};

/**
 * 효과음을 재생해요. SFX 비활성·mute·미지원·비브라우저면 graceful no-op.
 * 첫 제스처에서 suspended 면 언락(반환 무시 — 다음 호출부터 들려요).
 * @param name 'tick' | 'pop' | 'success' | 'error'
 */
export const playSfx = (name: SfxName): void => {
  if (!state.sfxEnabled || muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void resumeAudio();
  try {
    const master = ensureMasterGain(ctx);
    const now = Math.max(audioNow(), ctx.currentTime) + 0.001;
    (SFX_RECIPES[name] ?? SFX_RECIPES.tick)(ctx, master, now);
  } catch {
    // 합성 실패는 조용히 무시 — UI 흐름을 막지 않아요.
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 3. 생성형 BGM — 무드 프리셋 정의 (scale·progression·timbre·tempo 가 모두 다름)
 * ────────────────────────────────────────────────────────────────────────── */

/** 연출용 난수 — crypto 우선(S2245), 미지원 환경만 폴백. */
const secureRandom = (): number => {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return (array[0] ?? 0) / 4294967296; // 2^32 → [0, 1)
  }
  return 0.5;
};

const pick = <T>(items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(secureRandom() * items.length))] as T;

/** MIDI 노트 → 주파수(Hz). A4(69)=440. */
const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** 한 마디(beat 묶음) 분량 노트를 스케줄링하는 컨텍스트. */
interface ScheduleContext {
  ctx: AudioContext;
  /** 이 프리셋의 전용 출력 게인(엔진이 페이드/정리 담당). */
  out: AudioNode;
  /** 이번 묶음 시작 시각(ctx.currentTime 기준 절대 초). */
  startAt: number;
  /** 한 박 길이(초). */
  beatDuration: number;
  /** 이번에 채울 박 수. */
  beats: number;
  /** 프리셋 내부 진행 카운터(코드 진행/완만한 진화에 사용). */
  bar: number;
}

/** BGM 무드 프리셋. */
export interface BgmPreset {
  /** 안정적 식별자(영속/디버그용). */
  id: string;
  /** 사용자에게 보여줄 한글 무드명. */
  name: string;
  /** 한 박 길이(초) — 느릴수록 큼(= 템포). */
  beatDuration: number;
  /** 한 번의 schedule 호출이 채우는 박 수. */
  beatsPerBar: number;
  /** 한 묶음 분량 노트를 스케줄링(순수 합성 + out 연결). */
  schedule: (sc: ScheduleContext) => void;
}

/** soft attack/decay 보이스 — 여러 프리셋이 공유하는 빌딩 블록. */
const scheduleVoice = (
  ctx: AudioContext,
  out: AudioNode,
  options: {
    type: OscillatorType;
    frequency: number;
    startAt: number;
    duration: number;
    peak: number;
    attackRatio?: number;
    /** 로우패스 컷오프(Hz). 지정 시 필터로 음색을 둥글게. */
    cutoff?: number;
    /** 미세 디튠(cents) — 살짝 풍성하게. */
    detune?: number;
  },
): void => {
  const { type, frequency, startAt, duration, peak, attackRatio = 0.35, cutoff, detune = 0 } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  if (detune) osc.detune.setValueAtTime(detune, startAt);

  let tail: AudioNode = gain;
  osc.connect(gain);
  if (cutoff && cutoff > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, startAt);
    gain.connect(filter);
    tail = filter;
  }

  const attack = Math.max(0.01, duration * attackRatio);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  tail.connect(out);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
};

// 스케일(루트 기준 반음 오프셋).
const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * 5개 생성형 무드 프리셋 — 각기 다른 scale · chord-progression · timbre · tempo.
 * 배열 순서가 곧 기본 로테이션 순서예요(cozy → lofi → dreamy → bright → night).
 */
export const BGM_PRESETS: readonly BgmPreset[] = [
  {
    // cozy pad — C 펜타토닉, 느리고 따뜻한 사인 패드(포근).
    id: "cozy",
    name: "포근한 오후",
    beatDuration: 1.6,
    beatsPerBar: 4,
    schedule: ({ ctx, out, startAt, beatDuration, beats, bar }) => {
      const root = 60; // C4
      // I–vi–IV–V 느낌의 느린 화성 진행(마디마다 루트 이동).
      const progression = [0, -3, -7, -5];
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleVoice(ctx, out, {
        type: "sine",
        frequency: midiToFreq(root - 12 + rootShift),
        startAt,
        duration: beatDuration * beats,
        peak: 0.1,
        attackRatio: 0.5,
        cutoff: 700,
        detune: -4,
      });
      for (let b = 0; b < beats; b++) {
        if (secureRandom() > 0.45) {
          const degree = PENTATONIC_MAJOR[(bar + b) % PENTATONIC_MAJOR.length] ?? 0;
          const octave = secureRandom() > 0.7 ? 12 : 0;
          scheduleVoice(ctx, out, {
            type: "triangle",
            frequency: midiToFreq(root + rootShift + degree + octave),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.8,
            peak: 0.07,
            attackRatio: 0.4,
            cutoff: 1600,
          });
        }
      }
    },
  },
  {
    // lo-fi arpeggio — A 도리안, 흐르는 셋잇단 아르페지오 + 둥근 베이스(lo-fi).
    id: "lofi",
    name: "로파이 아르페지오",
    beatDuration: 0.32,
    beatsPerBar: 8,
    schedule: ({ ctx, out, startAt, beatDuration, beats, bar }) => {
      const root = 57; // A3
      // ii–V 류 베이스 워크(2마디 주기로 루트 이동).
      const bassCycle = [0, 0, 5, 7];
      const rootShift = bassCycle[bar % bassCycle.length] ?? 0;
      scheduleVoice(ctx, out, {
        type: "sine",
        frequency: midiToFreq(root + rootShift - 12),
        startAt,
        duration: beatDuration * beats,
        peak: 0.07,
        attackRatio: 0.55,
        cutoff: 520,
      });
      for (let b = 0; b < beats; b++) {
        const degree = DORIAN[(bar * 3 + b) % DORIAN.length] ?? 0;
        const octave = b % 4 >= 2 ? 12 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + degree + octave),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.2,
          peak: 0.05,
          attackRatio: 0.18,
          cutoff: 1900,
        });
      }
    },
  },
  {
    // dreamy ambient — F 리디안, 희소하게 떨어지는 벨 + 낮은 드론(몽환).
    id: "dreamy",
    name: "꿈결 앰비언트",
    beatDuration: 1.2,
    beatsPerBar: 6,
    schedule: ({ ctx, out, startAt, beatDuration, beats, bar }) => {
      const root = 65; // F4
      scheduleVoice(ctx, out, {
        type: "sine",
        frequency: midiToFreq(root - 24),
        startAt,
        duration: beatDuration * beats,
        peak: 0.055,
        attackRatio: 0.6,
        cutoff: 480,
      });
      for (let b = 0; b < beats; b++) {
        // 희소 — 절반 이하만 울려요(공간감).
        if (secureRandom() > 0.6) {
          const degree = LYDIAN[(bar + b * 2) % LYDIAN.length] ?? 0;
          const octave = secureRandom() > 0.5 ? 12 : 0;
          scheduleVoice(ctx, out, {
            type: "sine",
            frequency: midiToFreq(root + degree + octave),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 3,
            peak: 0.06,
            attackRatio: 0.04, // 벨처럼 빠른 어택.
            cutoff: 3200,
          });
        }
      }
    },
  },
  {
    // bright day — G 믹솔리디안, 경쾌하게 통통 튀는 멜로디 + 펄스 베이스(밝은 낮).
    id: "bright",
    name: "맑은 낮",
    beatDuration: 0.5,
    beatsPerBar: 8,
    schedule: ({ ctx, out, startAt, beatDuration, beats, bar }) => {
      const root = 67; // G4
      // 루트/4도/5도 번갈아 도는 밝은 베이스 진행.
      const bassWalk = [0, 5, 7, 5];
      for (let b = 0; b < beats; b += 2) {
        const bassDegree = bassWalk[(bar + b / 2) % bassWalk.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 12 + bassDegree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.6,
          peak: 0.06,
          attackRatio: 0.15,
          cutoff: 1100,
        });
      }
      for (let b = 0; b < beats; b++) {
        if (secureRandom() > 0.4) {
          const degree = pick(MIXOLYDIAN);
          scheduleVoice(ctx, out, {
            type: "square",
            frequency: midiToFreq(root + degree + (b % 3 === 0 ? 12 : 0)),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.05,
            peak: 0.03, // square 는 작게(거칠어서).
            attackRatio: 0.1,
            cutoff: 2000,
          });
        }
      }
    },
  },
  {
    // night glow — A 단조, 느린 톱니 화음 패드 + 가끔의 윗 멜로디(고요한 밤).
    id: "night",
    name: "밤의 윤슬",
    beatDuration: 1.9,
    beatsPerBar: 3,
    schedule: ({ ctx, out, startAt, beatDuration, beats, bar }) => {
      const root = 57; // A3
      // i–VI–III–VII 단조 진행(쓸쓸하고 따뜻).
      const progression = [0, -4, -9, -2];
      const rootShift = progression[bar % progression.length] ?? 0;
      const chordDegrees = [MINOR[0], MINOR[2], MINOR[4]];
      chordDegrees.forEach((degree, i) => {
        scheduleVoice(ctx, out, {
          type: "sawtooth",
          frequency: midiToFreq(root + rootShift + (degree ?? 0)),
          startAt,
          duration: beatDuration * beats,
          peak: 0.04,
          attackRatio: 0.55,
          cutoff: 880,
          detune: i === 1 ? 6 : -3,
        });
      });
      if (secureRandom() > 0.4) {
        const degree = MINOR[(bar * 2) % MINOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + 12 + degree),
          startAt: startAt + beatDuration * (secureRandom() > 0.5 ? 1 : 0),
          duration: beatDuration * 2,
          peak: 0.05,
          attackRatio: 0.45,
          cutoff: 1500,
        });
      }
    },
  },
];

/** 한 묶음(1회 schedule)의 길이(초). */
const barDuration = (preset: BgmPreset): number => preset.beatDuration * preset.beatsPerBar;

/* ────────────────────────────────────────────────────────────────────────── *
 * 4. BGM 엔진 — lookahead 스케줄러 + 무드 로테이션(crossfade)
 * ────────────────────────────────────────────────────────────────────────── */

/** 프리셋 1개 재생 길이(초) — 이후 다음 무드로 로테이션. */
const PRESET_DURATION_S = 75;
/** crossfade 길이(초). */
const FADE_S = 2.5;
/** 스케줄러 lookahead(초). */
const SCHEDULE_AHEAD_S = 1.5;
/** 스케줄러 틱 주기(ms). */
const SCHEDULER_INTERVAL_MS = 250;

interface ActivePreset {
  preset: BgmPreset;
  out: GainNode;
  /** 다음으로 스케줄을 채워야 할 절대 시각(초). */
  nextBarAt: number;
  bar: number;
}

let active: ActivePreset | null = null;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let rotationTimer: ReturnType<typeof setTimeout> | null = null;
let presetIndex = 0;
let bgmPlaying = false;

const createPresetOut = (ctx: AudioContext): GainNode => {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.connect(ensureMasterGain(ctx));
  return out;
};

/** lookahead 범위 안의 묶음들을 채워요. */
const runScheduler = (): void => {
  const ctx = getAudioContext();
  if (!ctx || !active) return;
  const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;
  let guard = 0;
  while (active.nextBarAt < horizon && guard < 16) {
    const { preset, out, nextBarAt, bar } = active;
    try {
      preset.schedule({
        ctx,
        out,
        startAt: nextBarAt,
        beatDuration: preset.beatDuration,
        beats: preset.beatsPerBar,
        bar,
      });
    } catch {
      // 한 묶음 합성 실패는 무시.
    }
    active.nextBarAt = nextBarAt + barDuration(preset);
    active.bar = bar + 1;
    guard += 1;
  }
};

/** 현재 프리셋을 페이드아웃하고 일정 시간 뒤 정리. */
const fadeOutAndDispose = (entry: ActivePreset): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  try {
    entry.out.gain.cancelScheduledValues(now);
    entry.out.gain.setValueAtTime(Math.max(0.0002, entry.out.gain.value), now);
    entry.out.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
  } catch {
    // 무시.
  }
  setTimeout(
    () => {
      try {
        entry.out.disconnect();
      } catch {
        // 무시.
      }
    },
    (FADE_S + 4) * 1000,
  );
};

const normalizeIndex = (index: number): number =>
  ((index % BGM_PRESETS.length) + BGM_PRESETS.length) % BGM_PRESETS.length;

/** 인덱스 프리셋을 시작(페이드인)하고 스케줄러를 돌려요. */
const startPreset = (index: number): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  presetIndex = normalizeIndex(index);
  const preset = BGM_PRESETS[presetIndex];
  if (!preset) return;

  const out = createPresetOut(ctx);
  const startAt = Math.max(audioNow(), ctx.currentTime) + 0.05;
  try {
    out.gain.setValueAtTime(0.0001, startAt);
    out.gain.exponentialRampToValueAtTime(1, startAt + FADE_S);
  } catch {
    // 무시.
  }

  active = { preset, out, nextBarAt: startAt, bar: 0 };
  syncTrackName(preset.name);

  runScheduler();
  if (!schedulerTimer) {
    schedulerTimer = setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  }
  if (rotationTimer) clearTimeout(rotationTimer);
  rotationTimer = setTimeout(() => {
    if (bgmPlaying) advance(1);
  }, PRESET_DURATION_S * 1000);
};

/** delta(보통 +1)만큼 무드를 전환(crossfade). */
const advance = (delta: number): void => {
  if (!getAudioContext()) return;
  const previous = active;
  startPreset(presetIndex + delta);
  if (previous) fadeOutAndDispose(previous);
};

/** BGM 재생 시작/재개(엔진 메커니즘). 제스처 안에서 호출되면 컨텍스트가 언락돼요. */
const engineStart = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  void resumeAudio();
  ensureMasterGain(ctx);
  if (bgmPlaying) return;
  bgmPlaying = true;
  startPreset(presetIndex);
};

/** BGM 정지(페이드아웃 + 타이머 정리). 재개 시 같은 무드부터 다시 시작. */
const engineStop = (): void => {
  bgmPlaying = false;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  if (active) {
    fadeOutAndDispose(active);
    active = null;
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 5. 상태 · 영속(opt-in) · 구독 — 엔진의 "두뇌"
 * ────────────────────────────────────────────────────────────────────────── */

const SFX_KEY = "ts_fx_sfx_enabled";
const BGM_KEY = "ts_fx_bgm_enabled";
const MUTE_KEY = "ts_fx_muted";
const VOL_KEY = "ts_fx_volume";

/** 공개 오디오 상태 스냅샷. */
export interface AudioState {
  /** 효과음 opt-in(기본 ON; reduce-motion 이면 OFF). */
  sfxEnabled: boolean;
  /** BGM opt-in(기본 OFF — autoplay 차단 회피). */
  bgmEnabled: boolean;
  /** 마스터 음소거. */
  muted: boolean;
  /** 마스터 볼륨(0~1). */
  volume: number;
  /** 현재(또는 다음 시작할) 무드명. */
  currentMood: string;
  /** 현재(또는 다음 시작할) 무드 id. */
  currentMoodId: string;
}

export type AudioStateListener = (state: AudioState) => void;

const hasWindow = (): boolean => typeof window !== "undefined";

const readStoredBool = (key: string): boolean | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return raw === "1" || raw === "true";
  } catch {
    return null;
  }
};

const writeStoredBool = (key: string, value: boolean): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 무시(프라이빗 모드 등).
  }
};

const readStoredNumber = (key: string): number | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const writeStoredNumber = (key: string, value: number): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 무시.
  }
};

const prefersReducedMotion = (): boolean => {
  if (!hasWindow() || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// 영속값을 모듈 로드 시 1회 읽어 초기 상태/마스터에 반영.
const initialMuted = readStoredBool(MUTE_KEY) ?? false;
const initialVolume = clamp01(readStoredNumber(VOL_KEY) ?? 1);
muted = initialMuted;
userVolume = initialVolume;

const state: AudioState = {
  sfxEnabled: readStoredBool(SFX_KEY) ?? !prefersReducedMotion(),
  bgmEnabled: readStoredBool(BGM_KEY) ?? false,
  muted: initialMuted,
  volume: initialVolume,
  currentMood: BGM_PRESETS[presetIndex]?.name ?? "",
  currentMoodId: BGM_PRESETS[presetIndex]?.id ?? "",
};

const listeners = new Set<AudioStateListener>();
let pausedByVisibility = false;
let wired = false;

// useSyncExternalStore 호환을 위해 스냅샷을 캐시한다 — getSnapshot 이 매번 새 객체를 주면
// React 가 "변경됨"으로 보고 무한 렌더 루프에 빠진다. 상태가 실제로 바뀔 때(emit)만
// 새 불변 스냅샷을 만들고, 그 사이엔 동일 참조를 돌려준다.
let cachedSnapshot: AudioState = { ...state };

const snapshot = (): AudioState => cachedSnapshot;

const emit = (): void => {
  const snap: AudioState = { ...state };
  cachedSnapshot = snap;
  listeners.forEach((listener) => {
    try {
      listener(snap);
    } catch {
      // 한 구독자 오류가 다른 구독자/엔진을 막지 않도록.
    }
  });
};

/** 엔진의 무드명 변경을 상태에 반영. */
const syncTrackName = (name: string): void => {
  const preset = BGM_PRESETS[presetIndex];
  const id = preset?.id ?? "";
  if (state.currentMood !== name || state.currentMoodId !== id) {
    state.currentMood = name;
    state.currentMoodId = id;
    emit();
  }
};

/** 가시성 일시정지 등 1회성 전역 배선. */
const ensureWired = (): void => {
  if (wired || !hasWindow()) return;
  wired = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (state.bgmEnabled && bgmPlaying) {
          pausedByVisibility = true;
          engineStop();
        }
      } else if (document.visibilityState === "visible") {
        if (pausedByVisibility && state.bgmEnabled) {
          pausedByVisibility = false;
          engineStart();
        }
        pausedByVisibility = false;
      }
    });
  }
};

/* ────────────────────────────────────────────────────────────────────────── *
 * 6. 공개 API — 상태 읽기/구독, 토글, mute/volume, BGM 제어
 * ────────────────────────────────────────────────────────────────────────── */

/** 현재 오디오 상태 스냅샷. */
export const getAudioState = (): AudioState => snapshot();

/** 상태 변경 구독. 반환된 함수로 구독 해제(useSyncExternalStore 호환). */
export const onAudioStateChange = (listener: AudioStateListener): (() => void) => {
  ensureWired();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 효과음 opt-in 여부. */
export const isSfxEnabled = (): boolean => state.sfxEnabled;

/** BGM opt-in 여부. */
export const isBgmEnabled = (): boolean => state.bgmEnabled;

/** 효과음 on/off(영속). */
export const setSfxEnabled = (enabled: boolean): void => {
  ensureWired();
  if (state.sfxEnabled === enabled) return;
  state.sfxEnabled = enabled;
  writeStoredBool(SFX_KEY, enabled);
  emit();
};

/**
 * BGM on/off(영속). ON 토글은 제스처로 간주해 즉시 첫 무드 재생(컨텍스트 언락),
 * OFF 는 페이드아웃하며 정지해요.
 */
export const setBgmEnabled = (enabled: boolean): void => {
  ensureWired();
  if (state.bgmEnabled === enabled) return;
  state.bgmEnabled = enabled;
  writeStoredBool(BGM_KEY, enabled);
  pausedByVisibility = false;
  if (enabled) engineStart();
  else engineStop();
  emit();
};

/** BGM 재생 시작(opt-in ON). 제스처 안에서 호출하세요. */
export const bgmPlay = (): void => setBgmEnabled(true);

/** BGM 정지(opt-in OFF). */
export const bgmPause = (): void => setBgmEnabled(false);

/** BGM on↔off 토글. 새 상태(켜졌으면 true) 반환. */
export const bgmToggle = (): boolean => {
  setBgmEnabled(!state.bgmEnabled);
  return state.bgmEnabled;
};

/** 다음 무드 프리셋으로 전환. 정지 상태면 다음 인덱스만 기억해 둬요(다음 시작 시 반영). */
export const bgmNext = (): void => {
  ensureWired();
  if (!bgmPlaying) {
    presetIndex = normalizeIndex(presetIndex + 1);
    syncTrackName(BGM_PRESETS[presetIndex]?.name ?? "");
    return;
  }
  advance(1);
};

/** 특정 무드 id 로 직접 전환(없으면 무시). 재생 중이면 즉시 crossfade. */
export const bgmSetMood = (moodId: string): void => {
  ensureWired();
  const index = BGM_PRESETS.findIndex((p) => p.id === moodId);
  if (index < 0) return;
  if (!bgmPlaying) {
    presetIndex = index;
    syncTrackName(BGM_PRESETS[index]?.name ?? "");
    return;
  }
  advance(index - presetIndex);
};

/** 현재(또는 다음 시작할) 무드명. */
export const getCurrentMoodName = (): string => state.currentMood;

/** BGM 재생 중 여부(엔진 기준). */
export const isBgmPlaying = (): boolean => bgmPlaying;

/** 마스터 음소거 on/off(영속). 모든 SFX/BGM 출력에 즉시 반영. */
export const setMuted = (value: boolean): void => {
  ensureWired();
  if (muted === value) return;
  muted = value;
  state.muted = value;
  writeStoredBool(MUTE_KEY, value);
  applyMasterGain();
  emit();
};

/** mute 토글. 새 상태 반환. */
export const toggleMuted = (): boolean => {
  setMuted(!muted);
  return muted;
};

/** 현재 음소거 여부. */
export const isMuted = (): boolean => muted;

/** 마스터 볼륨 설정(0~1, 영속). */
export const setMasterVolume = (volume: number): void => {
  ensureWired();
  const next = clamp01(volume);
  if (userVolume === next) return;
  userVolume = next;
  state.volume = next;
  writeStoredNumber(VOL_KEY, next);
  applyMasterGain();
  emit();
};

/** 현재 마스터 볼륨(0~1). */
export const getMasterVolume = (): number => userVolume;
