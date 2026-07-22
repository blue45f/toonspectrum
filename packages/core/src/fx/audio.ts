/**
 * @toonspectrum/core/fx/audio — 브라우저용 isomorphic 오디오 엔진.
 *
 * 설계 원칙
 * - **하이브리드 오디오**: SFX와 폴백 BGM은 Web Audio로 합성하고, 앱이 등록한 라이선스 음원은
 *   호스티드 플레이리스트로 재생합니다.
 * - **단일 lazy AudioContext**: 최초 사용자 제스처 시점에 1개만 만들고 재사용해요(autoplay 정책 준수).
 * - **graceful no-op**: SSR·비브라우저·미지원·차단 환경에서 어떤 호출도 조용히 무시되고 절대 throw 하지 않습니다.
 *   (`window`/`AudioContext` 가드 + 전역 try/catch). 비브라우저 환경에서도 안전합니다.
 * - **React/Tailwind/Node 의존 0**: Web Audio + (선택) localStorage 만 씁니다.
 *
 * BGM 성격(2026-06 리튠)
 * - **신나고 대중적**: 전부 장조(major) 팝 진행 + 빠른 템포 + 아르페지오 + 가벼운 킥/하이햇 비트 +
 *   밝은 음색(square/triangle/saw 리드). 5개 무드(밝은 팝 ☀️ · 칩튠 🎮 · 펑키 그루브 🪩 · 신스웨이브 🌃 · 해피 🎉).
 * - `public/audio/*.mp3` 호스티드 플레이리스트가 있으면 우선 재생하고, 없거나 등록이 해제되면
 *   생성형으로 graceful 폴백합니다(`registerBgmPlaylist`).
 *
 * 공개 표면(요약)
 * - 효과음:   `playSfx('tick'|'pop'|'success'|'error')`
 * - BGM:      `bgmPlay` / `bgmPause` / `bgmToggle` / `bgmNext` / `bgmSetMood` · 5개 무드 자동 로테이션(crossfade)
 * - 무드:     `BGM_PRESETS`(id·name·emoji) · `getCurrentMoodName` · `bgmSetMood`
 * - 마스터:   `setMuted` / `isMuted` · `setMasterVolume` / `getMasterVolume`(기본 0.55 — 은은하게)
 * - 영속 opt-in: `setSfxEnabled` / `setBgmEnabled`(localStorage) + `getAudioState` / `onAudioStateChange`
 * - UX 가드:  기본 OFF(autoplay 금지) · enable 시 fade-in · 탭 숨김(visibilitychange) 시 자동 일시정지 ·
 *             reduce-motion 이면 SFX 기본 OFF · mute + 영속 opt-in.
 * - 플레이리스트: `registerBgmPlaylist(urls)`(있으면 mp3 우선, 없으면 생성형)
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
const MASTER_CEILING = 0.55;
/** 저장된 볼륨이 없을 때의 낮은 기본 볼륨 — 비트가 있는 BGM 이라도 거슬리지 않게 시작. */
const DEFAULT_VOLUME = 0.55;

let masterGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
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

/**
 * SFX 전용 버스. 클릭이 연속되어도 피크가 튀지 않도록 가벼운 대역 제한과 컴프레서를 거친다.
 * BGM은 이 버스를 통과하지 않으므로 보컬 음색과 다이내믹은 그대로 유지된다.
 */
const ensureSfxBus = (ctx: AudioContext): GainNode => {
  if (sfxBus) return sfxBus;

  const input = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();

  input.gain.setValueAtTime(0.86, ctx.currentTime);
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(85, ctx.currentTime);
  highpass.Q.setValueAtTime(0.55, ctx.currentTime);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(7600, ctx.currentTime);
  lowpass.Q.setValueAtTime(0.4, ctx.currentTime);
  compressor.threshold.setValueAtTime(-20, ctx.currentTime);
  compressor.knee.setValueAtTime(18, ctx.currentTime);
  compressor.ratio.setValueAtTime(3, ctx.currentTime);
  compressor.attack.setValueAtTime(0.004, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(ensureMasterGain(ctx));
  sfxBus = input;
  return input;
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
export type SfxName =
  | "tick"
  | "pop"
  | "success"
  | "error"
  | "sparkle"
  | "woosh"
  | "open"
  | "close"
  | "tab"
  | "heart";

/**
 * 단일 오실레이터 톤을 soft attack/decay 엔벨로프로 마스터 버스에 재생해요(SFX 빌딩 블록).
 */
const playTone = (
  ctx: AudioContext,
  output: AudioNode,
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
    /** 좌우 공간감(-1~1). 짧은 레이어가 한가운데 겹쳐 답답해지는 것을 방지한다. */
    pan?: number;
    /** 오실레이터 미세 피치(cent). 같은 음의 레이어에 자연스러운 폭을 만든다. */
    detune?: number;
    /** 레이어별 음색 정리용 필터. */
    filterFrequency?: number;
    filterType?: BiquadFilterType;
    filterQ?: number;
  },
): void => {
  const {
    type,
    frequency,
    startAt,
    duration,
    peak,
    attackRatio = 0.2,
    glideToFrequency,
    pan = 0,
    detune = 0,
    filterFrequency,
    filterType = "lowpass",
    filterQ = 0.7,
  } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  osc.detune.setValueAtTime(detune, startAt);
  if (glideToFrequency && glideToFrequency > 0) {
    osc.frequency.exponentialRampToValueAtTime(glideToFrequency, startAt + duration);
  }
  const attack = Math.max(0.004, duration * attackRatio);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);

  let tail: AudioNode = gain;
  if (filterFrequency && filterFrequency > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, startAt);
    filter.Q.setValueAtTime(filterQ, startAt);
    tail.connect(filter);
    tail = filter;
  }
  if (typeof ctx.createStereoPanner === "function" && pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
    tail.connect(panner);
    tail = panner;
  }
  tail.connect(output);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
};

/**
 * 종이·유리 표면을 살짝 건드린 듯한 초단 노이즈 트랜지언트.
 * 단순 오실레이터만 쓸 때 생기는 장난감 같은 전자음을 줄여준다.
 */
const playNoiseTransient = (
  ctx: AudioContext,
  output: AudioNode,
  options: {
    startAt: number;
    duration: number;
    peak: number;
    frequency: number;
    type?: BiquadFilterType;
    q?: number;
    pan?: number;
  },
): void => {
  const {
    startAt,
    duration,
    peak,
    frequency,
    type = "bandpass",
    q = 0.8,
    pan = 0,
  } = options;
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = (Math.floor(startAt * 1_000_000) ^ frames ^ 0x51f15e) >>> 0;
  for (let i = 0; i < frames; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 2147483648 - 1) * (1 - i / frames);
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, startAt);
  filter.Q.setValueAtTime(q, startAt);
  gain.gain.setValueAtTime(Math.max(0.0002, peak), startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  source.connect(filter);
  filter.connect(gain);
  let tail: AudioNode = gain;
  if (typeof ctx.createStereoPanner === "function" && pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
    tail.connect(panner);
    tail = panner;
  }
  tail.connect(output);
  source.start(startAt);
  source.stop(startAt + duration + 0.01);
};

/** SFX 합성 레시피 — 애니메이션 UI처럼 짧고 맑되 귀를 찌르지 않는 음색. */
const SFX_RECIPES: Record<SfxName, (ctx: AudioContext, master: GainNode, now: number) => void> = {
  // tick — 종이 책갈피의 촉감 + 짧은 유리 공명. 고역 피크는 SFX 버스에서 한 번 더 정리한다.
  tick: (ctx, master, now) => {
    playNoiseTransient(ctx, master, {
      startAt: now,
      duration: 0.022,
      peak: 0.03,
      frequency: 1750,
      q: 0.75,
      pan: -0.08,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 680,
      startAt: now,
      duration: 0.058,
      peak: 0.064,
      attackRatio: 0.07,
      glideToFrequency: 610,
      filterFrequency: 3000,
      pan: -0.05,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 1360,
      startAt: now + 0.004,
      duration: 0.082,
      peak: 0.018,
      attackRatio: 0.08,
      detune: 4,
      filterFrequency: 4200,
      pan: 0.12,
    });
  },
  // pop — 말풍선이 열리는 듯한 5도 상승. 반복 탭에도 거슬리지 않게 고역 피크를 억제한다.
  pop: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 392,
      startAt: now,
      duration: 0.13,
      peak: 0.145,
      attackRatio: 0.12,
      glideToFrequency: 659.25,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 987.77,
      startAt: now + 0.018,
      duration: 0.075,
      peak: 0.042,
      attackRatio: 0.1,
    });
  },
  // success — 애니메이션 아이캐치처럼 빠르게 솟는 E 메이저 펜타토닉 아르페지오.
  success: (ctx, master, now) => {
    const notes = [659.25, 783.99, 987.77, 1318.51];
    notes.forEach((frequency, index) => {
      playTone(ctx, master, {
        type: "sine",
        frequency,
        startAt: now + index * 0.055,
        duration: 0.31 - index * 0.025,
        peak: 0.13 - index * 0.012,
        attackRatio: 0.12,
      });
    });
    // 윗배음 반짝임.
    playTone(ctx, master, {
      type: "triangle",
      frequency: 2637.02,
      startAt: now + 0.17,
      duration: 0.2,
      peak: 0.025,
      attackRatio: 0.16,
    });
  },
  // error — 위협적인 버저 대신 낮게 내려앉는 단3도. 실패를 알리되 흐름을 끊지 않는다.
  error: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 293.66,
      startAt: now,
      duration: 0.18,
      peak: 0.11,
      attackRatio: 0.16,
      glideToFrequency: 246.94,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 196,
      startAt: now + 0.065,
      duration: 0.2,
      peak: 0.055,
      attackRatio: 0.18,
      glideToFrequency: 164.81,
    });
  },
  // sparkle — 애니메이션 마법 및 아이템 획득 반짝임 효과음.
  sparkle: (ctx, master, now) => {
    const freqs = [1046.5, 1318.51, 1567.98, 2093.0, 2637.02];
    freqs.forEach((freq, i) => {
      playTone(ctx, master, {
        type: "sine",
        frequency: freq,
        startAt: now + i * 0.032,
        duration: 0.22,
        peak: 0.08 - i * 0.01,
        attackRatio: 0.1,
      });
    });
  },
  // woosh — 화면 전환 및 슬라이드 연출 시 바람 스치는 소리.
  woosh: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 240,
      startAt: now,
      duration: 0.16,
      peak: 0.08,
      attackRatio: 0.4,
      glideToFrequency: 680,
    });
  },
  // open — 팝업/모달/메뉴 열림 연출용 맑은 울림.
  open: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 523.25,
      startAt: now,
      duration: 0.18,
      peak: 0.12,
      attackRatio: 0.15,
      glideToFrequency: 880,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 1318.51,
      startAt: now + 0.02,
      duration: 0.22,
      peak: 0.06,
      attackRatio: 0.1,
    });
  },
  // close — 팝업/모달/메뉴 닫힘 연출용 경쾌한 안착음.
  close: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "triangle",
      frequency: 659.25,
      startAt: now,
      duration: 0.14,
      peak: 0.1,
      attackRatio: 0.1,
      glideToFrequency: 440,
    });
  },
  // tab — 탭 전환 및 탭 필터 클릭 시의 착붙 피드백.
  tab: (ctx, master, now) => {
    playNoiseTransient(ctx, master, {
      startAt: now,
      duration: 0.018,
      peak: 0.022,
      frequency: 2200,
      q: 0.9,
      pan: -0.1,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 659.25,
      startAt: now,
      duration: 0.085,
      peak: 0.07,
      attackRatio: 0.07,
      glideToFrequency: 783.99,
      filterFrequency: 3300,
      pan: -0.06,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 1318.51,
      startAt: now + 0.012,
      duration: 0.11,
      peak: 0.02,
      attackRatio: 0.08,
      detune: -3,
      filterFrequency: 4700,
      pan: 0.13,
    });
  },
  // heart — 좋아요/즐겨찾기 선택 시 발랄한 두근거림.
  heart: (ctx, master, now) => {
    playTone(ctx, master, {
      type: "sine",
      frequency: 587.33,
      startAt: now,
      duration: 0.12,
      peak: 0.11,
      attackRatio: 0.1,
      glideToFrequency: 880,
    });
    playTone(ctx, master, {
      type: "sine",
      frequency: 1174.66,
      startAt: now + 0.04,
      duration: 0.18,
      peak: 0.08,
      attackRatio: 0.1,
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
    const master = ensureSfxBus(ctx);
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
  /** 무드를 한눈에 보여줄 이모지(라벨 prefix 용, 선택). */
  emoji?: string;
  /** 한 박 길이(초) — 느릴수록 큼(= 템포). 업비트라 모두 짧아요(빠른 BPM). */
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

/* ── 리듬 빌딩 블록 — 가벼운 킥/하이햇(전부 합성, 음원 0개) ──────────────────── */

/** 짧은 화이트노이즈 버퍼(하이햇/스네어용) — 컨텍스트당 1회 생성 후 재사용. */
let noiseBuffer: AudioBuffer | null = null;
const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = secureRandom() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
};

/** 부드러운 킥 드럼 — 피치 다운 사인 + 빠른 엔벨로프(둥근 '둠'). */
const scheduleKick = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(125, startAt);
  osc.frequency.exponentialRampToValueAtTime(46, startAt + 0.12);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
  osc.connect(gain);
  gain.connect(out);
  osc.start(startAt);
  osc.stop(startAt + 0.2);
};

/** 하이햇 — 하이패스 노이즈 버스트(짧으면 closed, 길면 open). */
const scheduleHat = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
  duration = 0.045,
): void => {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, startAt);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(startAt);
  src.stop(startAt + duration + 0.02);
};

/** 스네어/클랩 — 밴드패스 노이즈(2·4박 백비트용). */
const scheduleSnare = (
  ctx: AudioContext,
  out: AudioNode,
  startAt: number,
  peak: number,
): void => {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1900, startAt);
  filter.Q.setValueAtTime(0.7, startAt);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(startAt);
  src.stop(startAt + 0.16);
};

// 스케일(루트 기준 반음 오프셋) — 업비트라 전부 밝은 장조 계열.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10]; // 펑키/그루브용(♭7).
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]; // 살짝 둥둥 뜨는 밝음(#4).

/** 메이저 트라이어드 화음 톤(루트 반음 오프셋 묶음). */
const MAJOR_TRIAD = [0, 4, 7];
const MAJOR_SEVENTH = [0, 4, 7, 11];
const ADD9 = [0, 4, 7, 14];

/**
 * 메이저 트라이어드 패드 화음을 한 묶음 길이로 깔아요(공통 헬퍼).
 * 모든 업비트 프리셋의 "코드 베드"로 재사용 — 음색만 type 으로 바꿉니다.
 */
const scheduleChordBed = (
  sc: ScheduleContext,
  options: {
    rootMidi: number;
    chord: readonly number[];
    type: OscillatorType;
    peak: number;
    cutoff: number;
    attackRatio?: number;
  },
): void => {
  const { ctx, out, startAt, beatDuration, beats } = sc;
  const { rootMidi, chord, type, peak, cutoff, attackRatio = 0.25 } = options;
  chord.forEach((semis, i) => {
    scheduleVoice(ctx, out, {
      type,
      frequency: midiToFreq(rootMidi + semis),
      startAt,
      duration: beatDuration * beats * 0.98,
      peak,
      attackRatio,
      cutoff,
      detune: i === 1 ? 5 : i === 2 ? -5 : 0, // 살짝 코러스감.
    });
  });
};

/**
 * 5개 **애니메이션 OST풍** 생성형 무드 — 청춘·마법·로맨스·모험·엔딩의 장면 문법을
 * 장조 진행과 맑은 삼각파 중심으로 재구성했다. 기존 id는 저장 설정 호환을 위해 유지한다.
 */
export const BGM_PRESETS: readonly BgmPreset[] = [
  {
    // 🌅 청춘 오프닝 — C 메이저 I–V–vi–IV + 질주하는 펜타토닉 리드.
    id: "pop",
    name: "청춘 오프닝",
    emoji: "🌅",
    beatDuration: 0.3, // ≈100 BPM(8분음표 그리드).
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 60; // C4
      // I–V–vi–IV — 마디마다 루트 이동(C·G·Am·F 느낌).
      const progression = [0, 7, 9, 5];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 메이저7 패드(따뜻+밝음).
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: MAJOR_SEVENTH,
        type: "triangle",
        peak: 0.05,
        cutoff: 2200,
      });
      // 둥근 베이스(루트 한 옥타브 아래, 4분음표).
      for (let b = 0; b < beats; b += 4) {
        scheduleVoice(ctx, out, {
          type: "sine",
          frequency: midiToFreq(root - 12 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 3.4,
          peak: 0.11,
          attackRatio: 0.1,
          cutoff: 600,
        });
      }
      // 통통 튀는 리드 아르페지오(메이저 펜타토닉, 8분음표).
      for (let b = 0; b < beats; b++) {
        const degree = PENTATONIC_MAJOR[(bar * 2 + b) % PENTATONIC_MAJOR.length] ?? 0;
        const octave = b % 4 === 0 ? 12 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + degree + octave),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.85,
          peak: 0.024,
          attackRatio: 0.06,
          cutoff: 2600,
        });
      }
      // 비트: 4-on-the-floor 킥 + 8분 하이햇 + 2·4박 클랩.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.16);
      for (let b = 0; b < beats; b += 2) {
        scheduleHat(ctx, out, startAt + b * beatDuration, b % 4 === 0 ? 0.05 : 0.035);
      }
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
    },
  },
  {
    // ✨ 별빛 마법소녀 — D 메이저, 종소리 같은 빠른 아르페지오와 가벼운 펄스.
    id: "chiptune",
    name: "별빛 마법소녀",
    emoji: "✨",
    beatDuration: 0.2,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 62; // D4
      // I–vi–IV–V(밝고 신나는 진행).
      const progression = [0, 9, 5, 7];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 펄스 베이스(8분음표 펌프).
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.6,
          peak: 0.045,
          attackRatio: 0.04,
          cutoff: 900,
        });
      }
      // 메인 칩튠 아르페지오 — 트라이어드를 빠르게 훑어요.
      const arp = MAJOR_TRIAD;
      for (let b = 0; b < beats; b++) {
        const semis = arp[b % arp.length] ?? 0;
        const octave = b % 6 >= 3 ? 12 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + semis + octave),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.95,
          peak: 0.025,
          attackRatio: 0.02,
          cutoff: 3000,
        });
      }
      // 윗 멜로디 카운터라인(메이저, 듬성듬성).
      for (let b = 0; b < beats; b += 4) {
        const degree = MAJOR[(bar + b) % MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + 12 + degree),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 3,
          peak: 0.035,
          attackRatio: 0.05,
          cutoff: 3400,
        });
      }
      // 가벼운 비트(빠른 템포라 4박 킥 + 오프비트 하이햇).
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.13);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌸 로맨스 산책 — E 믹솔리디안, 살짝 엇박인 발걸음과 부드러운 코드 스탭.
    id: "funky",
    name: "로맨스 산책",
    emoji: "🌸",
    beatDuration: 0.25,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 64; // E4
      const progression = [0, 0, 5, 7]; // I–I–IV–V 그루브 루프.
      const rootShift = progression[bar % progression.length] ?? 0;
      // 당김음(syncopated) 펑크 베이스 — 16분 자리 일부만 때려 그루브를 만들어요.
      const bassHits = [0, 3, 6, 7, 10, 11, 14];
      bassHits.forEach((b) => {
        const degree = MIXOLYDIAN[(bar + b) % MIXOLYDIAN.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift + (b % 7 === 0 ? 0 : degree % 12)),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.4,
          peak: 0.06,
          attackRatio: 0.04,
          cutoff: 1100,
        });
      });
      // 와카(wah) 코드 스탭 — 오프비트에 짧게 끊어 치는 메이저 화음.
      const stabAt = [2, 6, 10, 14];
      stabAt.forEach((b) => {
        MAJOR_TRIAD.forEach((semis, i) => {
          scheduleVoice(ctx, out, {
            type: "triangle",
            frequency: midiToFreq(root + rootShift + semis),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.1,
            peak: 0.022,
            attackRatio: 0.05,
            cutoff: 2400,
            detune: i === 1 ? 6 : 0,
          });
        });
      });
      // 디스코 비트: 4-on-the-floor 킥 + 백비트 스네어 + 오픈 하이햇 오프비트.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.15);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.07);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.05, 0.08);
    },
  },
  {
    // ⚔️ 판타지 모험 — A 리디안, 넓은 add9 패드 + 옥타브 베이스 + 영웅적인 리드.
    id: "synthwave",
    name: "판타지 모험",
    emoji: "⚔️",
    beatDuration: 0.34, // ≈88 BPM, 8분 펄스.
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 69; // A4
      const progression = [0, 5, 7, 4]; // I–IV–V–iii(살짝 드라마틱한 밝음).
      const rootShift = progression[bar % progression.length] ?? 0;
      // 넓은 saw add9 패드.
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.035,
        cutoff: 1500,
        attackRatio: 0.3,
      });
      // 신스웨이브 옥타브 베이스 펄스(8분음표, 루트↔옥타브).
      for (let b = 0; b < beats; b += 2) {
        const oct = (b / 2) % 2 === 0 ? 0 : 12;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift + oct),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.7,
          peak: 0.05,
          attackRatio: 0.05,
          cutoff: 800,
        });
      }
      // 반짝이는 리드 아르페지오(리디안 #4 가 레트로 느낌).
      for (let b = 0; b < beats; b++) {
        if (b % 2 === 0 || secureRandom() > 0.6) {
          const degree = LYDIAN[(bar * 2 + b) % LYDIAN.length] ?? 0;
          scheduleVoice(ctx, out, {
            type: "triangle",
            frequency: midiToFreq(root + rootShift + degree + (b % 8 >= 4 ? 12 : 0)),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 1.3,
            peak: 0.03,
            attackRatio: 0.04,
            cutoff: 3600,
          });
        }
      }
      // 가벼운 비트: 4박 킥 + 백비트 스네어 + 8분 하이햇.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.14);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.05);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌈 엔딩 크레딧 — F 메이저, 여운 있는 add9와 웃으며 돌아보는 상승 멜로디.
    id: "happy",
    name: "엔딩 크레딧",
    emoji: "🌈",
    beatDuration: 0.27, // ≈110 BPM, 8분 그리드.
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 65; // F4
      // I–IV–V–I(가장 밝고 결정적인 진행).
      const progression = [0, 5, 7, 0];
      const rootShift = progression[bar % progression.length] ?? 0;
      // add9 패드로 활기.
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.045,
        cutoff: 2600,
      });
      // 점프하는 베이스(루트→5도 바운스).
      for (let b = 0; b < beats; b += 2) {
        const fifth = (b / 2) % 2 === 1 ? 7 : 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 12 + rootShift + fifth),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.5,
          peak: 0.08,
          attackRatio: 0.08,
          cutoff: 900,
        });
      }
      // 밝은 멜로디 아르페지오(트라이어드 + 옥타브 점프, 신나게).
      const jump = [...MAJOR_TRIAD, 12, 7, 4];
      for (let b = 0; b < beats; b++) {
        const semis = jump[(bar + b) % jump.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.9,
          peak: 0.03,
          attackRatio: 0.05,
          cutoff: 2900,
        });
      }
      // 축제 비트: 4박 킥 + 2·4박 박수(스네어×2 살짝 겹쳐 박수감) + 8분 하이햇.
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.15);
      for (let b = 4; b < beats; b += 8) {
        scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
        scheduleSnare(ctx, out, startAt + b * beatDuration + 0.02, 0.04); // 박수 더블.
      }
      for (let b = 2; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.035);
    },
  },
  {
    // ⚡ 열혈 배틀 — E 마이너 / 왕도 펜타토닉, 강렬한 리프와 하이텐션 비트.
    id: "battle",
    name: "열혈 배틀",
    emoji: "⚡",
    beatDuration: 0.22, // 쾌속 BPM
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 64; // E4
      const progression = [0, 3, 5, 7]; // i-III-iv-V 강렬한 배틀 루프
      const rootShift = progression[bar % progression.length] ?? 0;
      // 옥타브 파워 듀얼 베이스
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "sawtooth",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.5,
          peak: 0.06,
          attackRatio: 0.02,
          cutoff: 1400,
        });
      }
      // 배틀 펜타토닉 질주 리드
      const riff = [0, 3, 5, 7, 10, 12, 10, 7];
      for (let b = 0; b < beats; b++) {
        const semis = riff[b % riff.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "square",
          frequency: midiToFreq(root + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.8,
          peak: 0.025,
          attackRatio: 0.03,
          cutoff: 2800,
        });
      }
      // 드럼 타격감 (헤비 킥 + 연속 하이햇 + 백비트 스네어)
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.18);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.08);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.045);
    },
  },
  {
    // 🎐 일상 코미디 — G 메이저, 목금/글록켄슈필 같은 톡톡 튀는 멜로디.
    id: "slice_of_life",
    name: "일상 코미디",
    emoji: "🎐",
    beatDuration: 0.24,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 67; // G4
      const progression = [0, 5, 7, 0];
      const rootShift = progression[bar % progression.length] ?? 0;
      // 통통 튀는 바운스 베이스
      for (let b = 0; b < beats; b += 4) {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 19 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 2.5,
          peak: 0.07,
          attackRatio: 0.05,
          cutoff: 900,
        });
      }
      // 맑은 16분음표 목금/벨 아르페지오
      for (let b = 0; b < beats; b++) {
        if (b % 3 !== 0) {
          const degree = PENTATONIC_MAJOR[(b + bar) % PENTATONIC_MAJOR.length] ?? 0;
          scheduleVoice(ctx, out, {
            type: "sine",
            frequency: midiToFreq(root + 12 + rootShift + degree),
            startAt: startAt + b * beatDuration,
            duration: beatDuration * 0.7,
            peak: 0.035,
            attackRatio: 0.02,
            cutoff: 4000,
          });
        }
      }
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.12);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.03);
    },
  },
  {
    // 🌌 감성 시티팝 — A 메이저 7th, 플랑크톤 빛나는 레트로 레전드 OST 분위기.
    id: "citypop",
    name: "감성 시티팝",
    emoji: "🌌",
    beatDuration: 0.28,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 69; // A4
      const progression = [0, 5, 2, 7]; // IV-V-iii-vi 변형
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root - 12 + rootShift,
        chord: MAJOR_SEVENTH,
        type: "triangle",
        peak: 0.04,
        cutoff: 1800,
        attackRatio: 0.3,
      });
      // 슬랩 느낌의 엇박 신스 베이스
      const bassPattern = [0, 3, 6, 10, 12, 14];
      bassPattern.forEach((b) => {
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root - 24 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.2,
          peak: 0.055,
          attackRatio: 0.04,
          cutoff: 1200,
        });
      });
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.14);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.06);
      for (let b = 2; b < beats; b += 4) scheduleHat(ctx, out, startAt + b * beatDuration, 0.045, 0.09);
    },
  },
  {
    // 🏆 영웅의 각성 — D 클라이맥스, 벅차오르는 하모닉 팡파레와 웅장한 아르페지오.
    id: "climax",
    name: "영웅의 각성",
    emoji: "🏆",
    beatDuration: 0.26,
    beatsPerBar: 16,
    schedule: (sc) => {
      const { ctx, out, startAt, beatDuration, beats, bar } = sc;
      const root = 62; // D4
      const progression = [0, 7, 9, 5]; // 벅차오르는 왕도 진행
      const rootShift = progression[bar % progression.length] ?? 0;
      scheduleChordBed(sc, {
        rootMidi: root + rootShift,
        chord: ADD9,
        type: "triangle",
        peak: 0.05,
        cutoff: 2400,
        attackRatio: 0.2,
      });
      for (let b = 0; b < beats; b += 2) {
        scheduleVoice(ctx, out, {
          type: "sawtooth",
          frequency: midiToFreq(root - 12 + rootShift),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 1.6,
          peak: 0.06,
          attackRatio: 0.05,
          cutoff: 1000,
        });
      }
      for (let b = 0; b < beats; b++) {
        const semis = MAJOR[(bar + b) % MAJOR.length] ?? 0;
        scheduleVoice(ctx, out, {
          type: "triangle",
          frequency: midiToFreq(root + 12 + rootShift + semis),
          startAt: startAt + b * beatDuration,
          duration: beatDuration * 0.9,
          peak: 0.03,
          attackRatio: 0.04,
          cutoff: 3200,
        });
      }
      for (let b = 0; b < beats; b += 4) scheduleKick(ctx, out, startAt + b * beatDuration, 0.16);
      for (let b = 4; b < beats; b += 8) scheduleSnare(ctx, out, startAt + b * beatDuration, 0.07);
      for (let b = 1; b < beats; b += 2) scheduleHat(ctx, out, startAt + b * beatDuration, 0.04);
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

/**
 * (선택) 호스티드 플레이리스트 트랙. `registerBgmPlaylist(['/audio/a.mp3', …])` 로 등록하면
 * 생성형 대신 이 mp3 들을 crossfade 로테이션해요. 비어 있으면 항상 생성형으로 폴백.
 */
interface PlaylistTrack {
  url: string;
  /** 라벨에 쓸 무드명(없으면 파일명에서 추론). */
  label: string;
  /** (선택) 아티스트명 — UI 크레딧 표기용. */
  artist?: string;
  /** (선택) 원본 출처/크레딧 링크 — UI 크레딧 표기용. */
  creditUrl?: string;
}
let playlist: PlaylistTrack[] = [];
let playlistIndex = 0;

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
 * 4b. (선택) 호스티드 mp3 플레이리스트 엔진 — 있으면 우선, 없으면 생성형 폴백
 *      HTMLAudioElement → MediaElementSource → masterGain 으로 라우팅해
 *      mute/volume/visibility 가드를 생성형과 똑같이 공유해요.
 * ────────────────────────────────────────────────────────────────────────── */

interface PlaylistVoice {
  el: HTMLAudioElement;
  node: GainNode;
  /** 한 트랙당 1번만 만드는 MediaElementSource(재사용 불가라 el 과 1:1). */
  src: MediaElementAudioSourceNode | null;
}
let playlistVoice: PlaylistVoice | null = null;
let playlistPlaying = false;

/** mp3 URL → 사람이 읽을 라벨(파일명 베이스). */
const labelFromUrl = (url: string): string => {
  try {
    const base = url.split("/").pop() ?? url;
    return decodeURIComponent(base.replace(/\.[a-z0-9]+$/i, "")).replace(/[-_]+/g, " ").trim() || "트랙";
  } catch {
    return "트랙";
  }
};

/** 한 트랙을 새 <audio> 로 만들어 master 로 라우팅하고 fade-in 재생. */
const startPlaylistTrack = (index: number): void => {
  const ctx = getAudioContext();
  if (!ctx || playlist.length === 0) return;
  playlistIndex = ((index % playlist.length) + playlist.length) % playlist.length;
  const track = playlist[playlistIndex];
  if (!track) return;

  let el: HTMLAudioElement;
  try {
    el = new Audio(track.url);
  } catch {
    return;
  }
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.loop = false;

  const node = ctx.createGain();
  node.gain.setValueAtTime(0.0001, ctx.currentTime);
  node.connect(ensureMasterGain(ctx));

  // CORS/미지원이면 라우팅 실패 → 엘리먼트 직접 재생(볼륨 가드만 못 받음).
  const src = ((): MediaElementAudioSourceNode | null => {
    try {
      const created = ctx.createMediaElementSource(el);
      created.connect(node);
      return created;
    } catch {
      return null;
    }
  })();

  const voice: PlaylistVoice = { el, node, src };
  playlistVoice = voice;
  syncTrackName(track.label);

  // 파일 누락·디코딩 실패 시 보컬 플레이리스트 상태에 멈춰 있지 않고 생성형 OST로 복구한다.
  const fallbackToProcedural = () => {
    if (!playlistPlaying || playlistVoice !== voice) return;
    playlistPlaying = false;
    playlistVoice = null;
    disposePlaylistVoice(voice);
    engineStart();
  };

  try {
    node.gain.setValueAtTime(0.0001, ctx.currentTime);
    node.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_S);
  } catch {
    // 무시.
  }
  // 트랙 끝나면 다음 트랙으로(crossfade).
  el.addEventListener(
    "ended",
    () => {
      if (playlistPlaying) advancePlaylist(1);
    },
    { once: true },
  );
  el.addEventListener("error", fallbackToProcedural, { once: true });
  void el.play().catch((error: unknown) => {
    // 정책상 자동재생 차단은 다음 제스처를 기다리고, 실제 미디어 실패만 생성형 OST로 폴백한다.
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "AbortError")
    ) {
      return;
    }
    fallbackToProcedural();
  });
};

/** 현재 트랙을 페이드아웃 후 정리. */
const disposePlaylistVoice = (voice: PlaylistVoice): void => {
  const ctx = getAudioContext();
  try {
    if (ctx) {
      const now = ctx.currentTime;
      voice.node.gain.cancelScheduledValues(now);
      voice.node.gain.setValueAtTime(Math.max(0.0002, voice.node.gain.value), now);
      voice.node.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
    }
  } catch {
    // 무시.
  }
  setTimeout(
    () => {
      try {
        voice.el.pause();
        voice.src?.disconnect();
        voice.node.disconnect();
      } catch {
        // 무시.
      }
    },
    (FADE_S + 1) * 1000,
  );
};

/** delta 만큼 플레이리스트 트랙 전환(crossfade). */
const advancePlaylist = (delta: number): void => {
  if (!getAudioContext() || playlist.length === 0) return;
  const previous = playlistVoice;
  startPlaylistTrack(playlistIndex + delta);
  if (previous) disposePlaylistVoice(previous);
};

const playlistStart = (): void => {
  const ctx = getAudioContext();
  if (!ctx || playlist.length === 0) return;
  void resumeAudio();
  ensureMasterGain(ctx);
  if (playlistPlaying) return;
  playlistPlaying = true;
  startPlaylistTrack(playlistIndex);
};

const playlistStop = (): void => {
  playlistPlaying = false;
  if (playlistVoice) {
    disposePlaylistVoice(playlistVoice);
    playlistVoice = null;
  }
};

/* ── 디스패처 — 플레이리스트가 있으면 그쪽, 없으면 생성형 ───────────────────── */

const usingPlaylist = (): boolean => playlist.length > 0;

/** BGM 시작(제스처 안에서). 호스티드 플레이리스트 우선, 없으면 생성형. */
const bgmStart = (): void => {
  if (usingPlaylist()) playlistStart();
  else engineStart();
};

/** BGM 정지(페이드아웃 + 정리). 두 엔진 모두 안전하게 멈춰요. */
const bgmStop = (): void => {
  if (playlistPlaying) playlistStop();
  if (bgmPlaying) engineStop();
};

/** 어느 엔진이든 재생 중인지. */
const anyBgmPlaying = (): boolean => bgmPlaying || playlistPlaying;

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
  /** 현재 트랙 아티스트(플레이리스트 모드에서만, 없으면 ""). */
  currentTrackArtist: string;
  /** 현재 트랙 크레딧 링크(플레이리스트 모드에서만, 없으면 ""). */
  currentTrackCreditUrl: string;
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
const initialVolume = clamp01(readStoredNumber(VOL_KEY) ?? DEFAULT_VOLUME);
muted = initialMuted;
userVolume = initialVolume;

const state: AudioState = {
  sfxEnabled: readStoredBool(SFX_KEY) ?? !prefersReducedMotion(),
  bgmEnabled: readStoredBool(BGM_KEY) ?? false,
  muted: initialMuted,
  volume: initialVolume,
  currentMood: BGM_PRESETS[presetIndex]?.name ?? "",
  currentMoodId: BGM_PRESETS[presetIndex]?.id ?? "",
  currentTrackArtist: "",
  currentTrackCreditUrl: "",
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

/** 엔진의 무드명 변경을 상태에 반영. 플레이리스트 모드면 트랙 인덱스를 id 로, 크레딧 메타도 동기화. */
const syncTrackName = (name: string): void => {
  const usingList = playlist.length > 0;
  const id = usingList ? `playlist:${playlistIndex}` : (BGM_PRESETS[presetIndex]?.id ?? "");
  const artist = usingList ? (playlist[playlistIndex]?.artist ?? "") : "";
  const creditUrl = usingList ? (playlist[playlistIndex]?.creditUrl ?? "") : "";
  if (
    state.currentMood !== name ||
    state.currentMoodId !== id ||
    state.currentTrackArtist !== artist ||
    state.currentTrackCreditUrl !== creditUrl
  ) {
    state.currentMood = name;
    state.currentMoodId = id;
    state.currentTrackArtist = artist;
    state.currentTrackCreditUrl = creditUrl;
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
        // 탭/앱이 숨겨지면 두 엔진(생성형·플레이리스트) 모두 자동 일시정지(배터리/예의).
        if (state.bgmEnabled && anyBgmPlaying()) {
          pausedByVisibility = true;
          bgmStop();
        }
      } else if (document.visibilityState === "visible") {
        if (pausedByVisibility && state.bgmEnabled) {
          pausedByVisibility = false;
          bgmStart();
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
  if (enabled) bgmStart();
  else bgmStop();
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

/**
 * 다음 무드/트랙으로 전환. 정지 상태면 다음 인덱스만 기억해 둬요(다음 시작 시 반영).
 * 플레이리스트 모드면 다음 mp3 트랙으로 넘어가요.
 */
export const bgmNext = (): void => {
  ensureWired();
  if (usingPlaylist()) {
    if (!playlistPlaying) {
      playlistIndex = (playlistIndex + 1) % playlist.length;
      syncTrackName(playlist[playlistIndex]?.label ?? "");
      return;
    }
    advancePlaylist(1);
    return;
  }
  if (!bgmPlaying) {
    presetIndex = normalizeIndex(presetIndex + 1);
    syncTrackName(BGM_PRESETS[presetIndex]?.name ?? "");
    return;
  }
  advance(1);
};

/**
 * 특정 무드 id 로 직접 전환(없으면 무시). 재생 중이면 즉시 crossfade.
 * 플레이리스트 모드에서는 `playlist:<index>` 형태 id 또는 순수 인덱스 문자열도 받아요.
 */
export const bgmSetMood = (moodId: string): void => {
  ensureWired();
  if (usingPlaylist()) {
    const raw = moodId.startsWith("playlist:") ? moodId.slice("playlist:".length) : moodId;
    const index = Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= playlist.length) return;
    if (!playlistPlaying) {
      playlistIndex = index;
      syncTrackName(playlist[index]?.label ?? "");
      return;
    }
    advancePlaylist(index - playlistIndex);
    return;
  }
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

/** BGM 재생 중 여부(생성형/플레이리스트 어느 엔진이든). */
export const isBgmPlaying = (): boolean => anyBgmPlaying();

/** registerBgmPlaylist 입력 항목 — URL 문자열 또는 크레딧 메타 포함 객체. */
export interface BgmPlaylistEntry {
  url: string;
  label?: string;
  /** (선택) 아티스트명 — UI 크레딧 표기용. */
  artist?: string;
  /** (선택) 원본 출처/크레딧 링크. */
  creditUrl?: string;
}

/**
 * (선택) 호스티드 mp3 플레이리스트를 등록해요. 비어 있지 않으면 BGM 켤 때 생성형 대신
 * 이 트랙들을 crossfade 로테이션합니다(없으면 생성형 폴백). 항목은 URL 문자열 또는
 * `{ url, label, artist, creditUrl }`. 보통 앱 부팅 시 manifest(`/audio/playlist.json`)를
 * 읽어 1회 호출하세요.
 *
 * 예) `registerBgmPlaylist(['/audio/upbeat-1.mp3', { url: '/audio/funky.mp3', label: '펑키' }])`
 * 빈 배열을 넘기면 등록 해제(생성형으로 복귀).
 */
export const registerBgmPlaylist = (
  tracks: ReadonlyArray<string | BgmPlaylistEntry>,
): void => {
  ensureWired();
  const wasPlaying = anyBgmPlaying();
  // 전환 전에 현재 재생을 깔끔히 멈춰요(엔진 교체).
  if (wasPlaying) bgmStop();
  playlist = tracks
    .map((t) => (typeof t === "string" ? ({ url: t } as BgmPlaylistEntry) : t))
    .filter((t): t is BgmPlaylistEntry => Boolean(t?.url))
    .map((t) => ({
      url: t.url,
      label: t.label?.trim() || labelFromUrl(t.url),
      artist: t.artist?.trim() || undefined,
      creditUrl: t.creditUrl?.trim() || undefined,
    }));
  playlistIndex = 0;
  // 라벨/상태를 새 소스 기준으로 갱신.
  syncTrackName(
    playlist.length > 0
      ? (playlist[0]?.label ?? "")
      : (BGM_PRESETS[presetIndex]?.name ?? ""),
  );
  // opt-in 이 켜져 있었고 막 재생 중이었다면 새 엔진으로 이어 재생.
  if (wasPlaying && state.bgmEnabled) bgmStart();
};

/** 등록된 호스티드 플레이리스트 트랙 수(0 이면 생성형 사용 중). */
export const getBgmPlaylistSize = (): number => playlist.length;

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

let pausedForAd = false;
let bgmWasPlayingBeforeAd = false;

/** 광고 재생 시 BGM과 오디오 컨텍스트를 일시정지해요. */
export const pauseAudioForAd = (): void => {
  if (pausedForAd) return;
  pausedForAd = true;
  ensureWired();

  bgmWasPlayingBeforeAd = state.bgmEnabled && anyBgmPlaying();

  if (bgmWasPlayingBeforeAd) {
    bgmStop();
  }

  if (playlistVoice?.el) {
    try {
      playlistVoice.el.pause();
    } catch {
      // no-op
    }
  }

  const ctx = getAudioContext();
  if (ctx && ctx.state === "running") {
    void ctx.suspend().catch(() => {});
  }
};

/** 광고 재생이 끝나면 BGM과 오디오 컨텍스트를 재개해요. */
export const resumeAudioAfterAd = (): void => {
  if (!pausedForAd) return;
  pausedForAd = false;

  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume()
      .then(() => {
        if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
          bgmStart();
          if (playlistVoice?.el) {
            void playlistVoice.el.play().catch(() => {});
          }
        }
      })
      .catch(() => {
        if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
          bgmStart();
        }
      });
  } else {
    if (bgmWasPlayingBeforeAd && state.bgmEnabled) {
      bgmStart();
      if (playlistVoice?.el) {
        void playlistVoice.el.play().catch(() => {});
      }
    }
  }
};
