/**
 * Web Audio API 기반 프로시저럴 앰비언트 BGM 엔진.
 *
 * - 외부 오디오 파일 없음: 오실레이터 + 생성형 리버브만 사용하므로 라이선스 문제 없음.
 * - 무드별 스케일/템포/음색 프리셋으로 페이지 분위기에 맞는 배경음을 만든다.
 * - 무드 전환 시 2초 크로스페이드.
 * - 자동재생 정책: AudioContext는 반드시 사용자 제스처(클릭/탭) 안에서 `start()`로 생성한다.
 */

/** 페이지 분위기 종류. */
export type BgmMood = "home" | "studio" | "draw" | "virtual" | "pricing" | "material";

export const BGM_MOODS: readonly BgmMood[] = [
  "home",
  "studio",
  "draw",
  "virtual",
  "pricing",
  "material",
] as const;

export type BgmPattern = "pad" | "arp" | "pluck";

export interface BgmPreset {
  readonly mood: BgmMood;
  /** 기준 음 (MIDI 번호, C4 = 60). */
  readonly rootMidi: number;
  /** 스케일 (반음 오프셋). */
  readonly scale: readonly number[];
  /** 코드 진행 — 각 코드는 스케일 degree(0부터) 3음. */
  readonly chords: ReadonlyArray<readonly number[]>;
  /** 코드 하나가 유지되는 시간(초). */
  readonly chordSeconds: number;
  readonly pattern: BgmPattern;
  /** arp/pluck 패턴의 템포. */
  readonly bpm: number;
  readonly wave: OscillatorType;
  /** 로우패스 필터 컷오프 (Hz). */
  readonly cutoffHz: number;
  /** 리버브 믹스 (0~1). */
  readonly reverbMix: number;
  /** 프리셋 상대 음량 (0~1). */
  readonly level: number;
}

/**
 * 무드별 프리셋.
 * - home: 따뜻하고 환영하는 메이저 패드
 * - studio: 집중되는 마이너 아르페지오
 * - draw: 몽환적인 도리안 + 깊은 리버브
 * - virtual: 활기찬 플럭 리듬
 * - pricing: 신뢰감 있는 깔끔한 톤
 * - material: 호기심을 자극하는 프리지안
 */
export const BGM_PRESETS: Record<BgmMood, BgmPreset> = {
  home: {
    mood: "home",
    rootMidi: 60,
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 2, 4],
      [4, 1, 3],
      [5, 0, 2],
      [3, 5, 0],
    ],
    chordSeconds: 8,
    pattern: "pad",
    bpm: 60,
    wave: "triangle",
    cutoffHz: 900,
    reverbMix: 0.5,
    level: 0.5,
  },
  studio: {
    mood: "studio",
    rootMidi: 57,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [2, 4, 6],
      [6, 1, 3],
    ],
    chordSeconds: 8,
    pattern: "arp",
    bpm: 60,
    wave: "triangle",
    cutoffHz: 1400,
    reverbMix: 0.35,
    level: 0.42,
  },
  draw: {
    mood: "draw",
    rootMidi: 62,
    scale: [0, 2, 3, 5, 7, 9, 10],
    chords: [
      [0, 2, 4],
      [3, 5, 0],
      [4, 6, 1],
      [5, 0, 2],
    ],
    chordSeconds: 10,
    pattern: "arp",
    bpm: 48,
    wave: "sine",
    cutoffHz: 2000,
    reverbMix: 0.7,
    level: 0.45,
  },
  virtual: {
    mood: "virtual",
    rootMidi: 55,
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [
      [0, 2, 4],
      [4, 6, 1],
      [5, 0, 2],
      [3, 5, 0],
    ],
    chordSeconds: 4,
    pattern: "pluck",
    bpm: 92,
    wave: "triangle",
    cutoffHz: 2400,
    reverbMix: 0.25,
    level: 0.38,
  },
  pricing: {
    mood: "pricing",
    rootMidi: 65,
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [3, 5, 0],
      [4, 1, 3],
    ],
    chordSeconds: 6,
    pattern: "pluck",
    bpm: 66,
    wave: "sine",
    cutoffHz: 1600,
    reverbMix: 0.4,
    level: 0.4,
  },
  material: {
    mood: "material",
    rootMidi: 64,
    scale: [0, 1, 3, 5, 7, 8, 10],
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [4, 6, 1],
      [3, 5, 0],
    ],
    chordSeconds: 6,
    pattern: "arp",
    bpm: 72,
    wave: "sine",
    cutoffHz: 1800,
    reverbMix: 0.55,
    level: 0.42,
  },
};

/** 무드 전환 크로스페이드 시간(초). */
export const BGM_CROSSFADE_SECONDS = 2;

/** 경로 → BGM 무드 매핑 (순수 함수). */
export function moodForPath(pathname: string): BgmMood {
  const path = pathname.toLowerCase();
  if (path.startsWith("/studio/canvas")) return "draw";
  if (path.startsWith("/studio")) return "studio";
  if (path.startsWith("/hub") || path.includes("virtual")) return "virtual";
  if (path.startsWith("/pricing")) return "pricing";
  if (path.startsWith("/research")) return "material";
  if (path === "/" || path.startsWith("/home")) return "home";
  return "home";
}

/** 스케일 degree → MIDI 번호. degree가 스케일을 넘어가면 옥타브를 올린다. */
export function degreeToMidi(rootMidi: number, scale: readonly number[], degree: number): number {
  const length = scale.length;
  const octave = Math.floor(degree / length);
  const index = ((degree % length) + length) % length;
  return rootMidi + scale[index] + 12 * octave;
}

/** MIDI 번호 → 주파수 (Hz). A4(69) = 440Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------ 환경설정 저장 ------------------------------ */

export const BGM_DEFAULT_VOLUME = 0.6;
export const BGM_MIN_VOLUME = 0;
export const BGM_MAX_VOLUME = 1;

const ENABLED_KEY = "ts_bgm_enabled";
const VOLUME_KEY = "ts_bgm_volume";

function readStored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 시크릿 모드 등 — 조용히 무시 */
  }
}

export function clampBgmVolume(volume: number): number {
  if (!Number.isFinite(volume)) return BGM_DEFAULT_VOLUME;
  return Math.min(BGM_MAX_VOLUME, Math.max(BGM_MIN_VOLUME, volume));
}

export interface BgmPreferences {
  /** 마스터 on/off. */
  readonly enabled: boolean;
  /** 볼륨 0~1. */
  readonly volume: number;
}

export function readBgmPreferences(): BgmPreferences {
  const storedVolume = readStored(VOLUME_KEY);
  return {
    enabled: readStored(ENABLED_KEY) !== "0",
    volume: storedVolume === null ? BGM_DEFAULT_VOLUME : clampBgmVolume(Number(storedVolume)),
  };
}

export function writeBgmEnabled(enabled: boolean): void {
  writeStored(ENABLED_KEY, enabled ? "1" : "0");
}

export function writeBgmVolume(volume: number): void {
  writeStored(VOLUME_KEY, String(clampBgmVolume(volume)));
}

/** `prefers-reduced-motion` 사용자인지. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** 브라우저가 Web Audio를 지원하는지. */
export function isBgmSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.AudioContext !== "undefined" ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined")
  );
}

/* ------------------------------ 엔진 ------------------------------ */

export type BgmEngineState = "stopped" | "playing";

type EngineStateListener = (state: BgmEngineState, mood: BgmMood) => void;

const SCHEDULER_INTERVAL_MS = 40;
const SCHEDULER_LOOKAHEAD_SEC = 0.18;

interface ScheduledVoice {
  readonly stop: (when: number) => void;
}

/**
 * 프로시저럴 앰비언트 BGM 싱글톤 엔진.
 *
 * - `start()`: 사용자 제스처 안에서 호출해야 한다. AudioContext를 만들고 스케줄러를 시작한다.
 * - `setMood()`: 2초 크로스페이드로 무드를 전환한다.
 * - `stop()`: 페이드아웃 후 컨텍스트를 suspend한다.
 */
export class BgmEngine {
  private listeners = new Set<EngineStateListener>();
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private state: BgmEngineState = "stopped";
  private mood: BgmMood = "home";
  private volume = BGM_DEFAULT_VOLUME;
  private schedulerTimer: number | null = null;
  private generation = 0;
  private activeVoices = new Set<ScheduledVoice>();
  private nextChordTime = 0;
  private chordIndex = 0;
  private nextNoteTime = 0;
  private noteStep = 0;

  onStateChange(listener: EngineStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state, this.mood);
    }
  }

  get playing(): boolean {
    return this.state === "playing";
  }

  get currentMood(): BgmMood {
    return this.mood;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (!isBgmSupported()) return null;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new Ctor();
      this.context = context;

      // 마스터 체인: masterGain → 컴프레서(안전) → 출력
      this.masterGain = context.createGain();
      this.masterGain.gain.value = this.volume * this.volume * 0.6;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 6;
      this.masterGain.connect(compressor);
      compressor.connect(context.destination);

      // 생성형 리버브: 지수 감쇠 노이즈 임펄스
      const convolver = context.createConvolver();
      convolver.buffer = this.makeImpulseResponse(context, 2.2, 2.8);
      this.wetGain = context.createGain();
      this.wetGain.gain.value = 0.5;
      convolver.connect(this.wetGain);
      this.wetGain.connect(this.masterGain);
      // wet 입력 버스는 sendVoice에서 사용한다.
      this.reverbInput = convolver;
      return context;
    } catch {
      this.context = null;
      return null;
    }
  }

  private reverbInput: ConvolverNode | null = null;

  /** 지수 감쇠 노이즈로 임펄스 응답을 생성한다 (외부 파일 불필요). */
  private makeImpulseResponse(
    context: AudioContext,
    seconds: number,
    decay: number,
  ): AudioBuffer {
    const rate = context.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /**
   * BGM을 시작한다. 반드시 사용자 제스처(클릭/탭) 안에서 호출할 것.
   * 이미 재생 중이면 현재 무드를 유지한다.
   */
  start(mood: BgmMood): boolean {
    const context = this.ensureContext();
    if (!context) return false;
    this.mood = mood;
    try {
      if (context.state === "suspended") {
        void context.resume();
      }
    } catch {
      return false;
    }
    if (this.state === "playing") {
      this.setMood(mood);
      return true;
    }
    this.state = "playing";
    this.beginGeneration(mood);
    this.emit();
    return true;
  }

  /** 무드를 전환한다 (2초 크로스페이드). */
  setMood(mood: BgmMood): void {
    if (mood === this.mood && this.state === "playing") return;
    this.mood = mood;
    if (this.state !== "playing") return;
    this.beginGeneration(mood);
    this.emit();
  }

  private beginGeneration(mood: BgmMood): void {
    const context = this.context;
    if (!context) return;
    // 이전 세대의 보이스를 2초에 걸쳐 페이드아웃한다.
    this.generation += 1;
    const fadeOutUntil = context.currentTime + BGM_CROSSFADE_SECONDS;
    for (const voice of this.activeVoices) {
      try {
        voice.stop(fadeOutUntil);
      } catch {
        /* 이미 정리된 보이스 */
      }
    }
    this.activeVoices.clear();

    // 새 세대의 스케줄을 시작한다. tick()은 항상 최신 프리셋을 읽는다.
    this.activePreset = BGM_PRESETS[mood];
    const now = context.currentTime + 0.08;
    this.nextChordTime = now;
    this.nextNoteTime = now;
    this.chordIndex = 0;
    this.noteStep = 0;
    if (this.schedulerTimer === null) {
      this.schedulerTimer = window.setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    }
  }

  private activePreset: BgmPreset | null = null;

  private tick(): void {
    const context = this.context;
    const preset = this.activePreset;
    if (!context || !preset || this.state !== "playing") return;
    try {
      const horizon = context.currentTime + SCHEDULER_LOOKAHEAD_SEC;
      if (preset.pattern === "pad") {
        while (this.nextChordTime < horizon) {
          this.schedulePadChord(preset, this.nextChordTime, this.chordIndex);
          this.nextChordTime += preset.chordSeconds;
          this.chordIndex += 1;
        }
      } else {
        const stepSeconds = 60 / preset.bpm / (preset.pattern === "arp" ? 2 : 1);
        while (this.nextNoteTime < horizon) {
          const chord = preset.chords[this.chordIndex % preset.chords.length];
          this.schedulePatternNote(preset, this.nextNoteTime, chord, this.noteStep, stepSeconds);
          this.nextNoteTime += stepSeconds;
          this.noteStep += 1;
          if (this.noteStep % (chord.length * 2) === 0) {
            this.chordIndex += 1;
          }
        }
      }
    } catch {
      /* 스케줄 실패는 다음 틱에서 복구 */
    }
  }

  /** 보이스를 dry/wet 버스에 연결한다. */
  private sendVoice(source: AudioNode, gain: GainNode, preset: BgmPreset): void {
    const context = this.context;
    const master = this.masterGain;
    if (!context || !master) return;
    source.connect(gain);
    gain.connect(master);
    if (this.reverbInput && preset.reverbMix > 0) {
      const wet = context.createGain();
      wet.gain.value = preset.reverbMix;
      gain.connect(wet);
      wet.connect(this.reverbInput);
    }
  }

  private schedulePadChord(preset: BgmPreset, when: number, chordIndex: number): void {
    const context = this.context;
    if (!context) return;
    const chord = preset.chords[chordIndex % preset.chords.length];
    const fadeIn = BGM_CROSSFADE_SECONDS;
    for (const degree of chord) {
      const midi = degreeToMidi(preset.rootMidi, preset.scale, degree);
      const freq = midiToFreq(midi);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(preset.level / chord.length, when + fadeIn);
      // 코드 끝에서 릴리즈
      const endTime = when + preset.chordSeconds + 1;
      gain.gain.setValueAtTime(preset.level / chord.length, endTime - 2);
      gain.gain.linearRampToValueAtTime(0, endTime);
      for (const detune of [-4, 4]) {
        const osc = context.createOscillator();
        osc.type = preset.wave;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = preset.cutoffHz;
        osc.connect(filter);
        this.sendVoice(filter, gain, preset);
        osc.start(when);
        osc.stop(endTime + 0.1);
      }
      this.activeVoices.add({ stop: (stopWhen: number) => {
        try {
          gain.gain.cancelScheduledValues(stopWhen);
          gain.gain.setValueAtTime(gain.gain.value, stopWhen);
          gain.gain.linearRampToValueAtTime(0, stopWhen + BGM_CROSSFADE_SECONDS);
        } catch { /* 무시 */ }
      } });
    }
  }

  private schedulePatternNote(
    preset: BgmPreset,
    when: number,
    chord: readonly number[],
    step: number,
    stepSeconds: number,
  ): void {
    const context = this.context;
    if (!context) return;
    // 코드를 오르내리는 아르페지오: degree + 옥타브 순환
    const position = step % (chord.length * 2);
    const degree = position < chord.length ? chord[position] : chord[chord.length * 2 - 1 - position];
    const octaveUp = Math.floor(step / (chord.length * 2)) % 2;
    const midi = degreeToMidi(preset.rootMidi, preset.scale, degree) + 12 * octaveUp;
    const freq = midiToFreq(midi);

    const osc = context.createOscillator();
    osc.type = preset.wave;
    osc.frequency.value = freq;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = preset.cutoffHz;
    const gain = context.createGain();
    const noteLevel = preset.level * (preset.pattern === "pluck" ? 0.9 : 0.7);
    const noteDur = preset.pattern === "pluck" ? Math.min(stepSeconds * 0.9, 0.5) : stepSeconds * 1.8;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(noteLevel, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + noteDur);
    osc.connect(filter);
    this.sendVoice(filter, gain, preset);
    osc.start(when);
    osc.stop(when + noteDur + 0.1);
    this.activeVoices.add({ stop: (stopWhen: number) => {
      try {
        gain.gain.cancelScheduledValues(stopWhen);
        gain.gain.setValueAtTime(gain.gain.value, stopWhen);
        gain.gain.linearRampToValueAtTime(0, stopWhen + BGM_CROSSFADE_SECONDS);
      } catch { /* 무시 */ }
    } });
  }

  /** 볼륨을 설정한다 (0~1). */
  setVolume(volume: number): void {
    this.volume = clampBgmVolume(volume);
    if (this.context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.volume * this.volume * 0.6,
        this.context.currentTime,
        0.1,
      );
    }
  }

  get currentVolume(): number {
    return this.volume;
  }

  /** 페이드아웃 후 정지한다. */
  stop(): void {
    const context = this.context;
    if (context) {
      const stopWhen = context.currentTime + 0.6;
      for (const voice of this.activeVoices) {
        try {
          voice.stop(stopWhen);
        } catch {
          /* 무시 */
        }
      }
    }
    this.activeVoices.clear();
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.activePreset = null;
    if (context) {
      try {
        void context.suspend();
      } catch {
        /* 무시 */
      }
    }
    this.state = "stopped";
    this.emit();
  }
}

/** 앱 전역에서 공유하는 단일 엔진 인스턴스. */
export const bgmEngine = new BgmEngine();
