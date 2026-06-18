/**
 * Studio BGM — 작품 배경음악(네이버 효과툰식). 두 갈래로 제공한다.
 * 1) 자동 생성 앰비언트: 무드별 음계/템포 데이터로 Web Audio가 부드러운 패드 코드를 반복
 *    재생한다. 외부 오디오 파일이 필요 없어 깨질 일이 없고 오프라인에서도 동작한다.
 * 2) 커스텀 URL: 창작자가 직접 가진 오디오 파일 URL을 넣으면 그걸 루프 재생한다.
 *
 * 음악이론 헬퍼(noteToFreq·buildProgression·BGM_MOODS)는 순수·결정적이라 단위 테스트가 가능하고,
 * 실제 소리를 내는 createBgmPlayer는 브라우저(AudioContext/Audio) 전용 얇은 래퍼다.
 * 자동재생 정책상 반드시 사용자 제스처(재생 버튼) 후에만 play()가 소리를 낸다.
 */

export type BgmWaveform = "sine" | "triangle" | "square" | "sawtooth";

export interface BgmMood {
  id: string;
  label: string;
  description: string;
  /** 기준 음 주파수(Hz). 음계 semitone 오프셋의 기준. */
  rootFreq: number;
  /** 루트 기준 반음 오프셋 음계. */
  scale: number[];
  /** 분당 박자(코드 전환 속도 기준). */
  tempo: number;
  waveform: BgmWaveform;
}

// 7가지 무드 — 라벨/설명은 한글. rootFreq는 낮은 옥타브(부담 없는 패드 음역).
export const BGM_MOODS: BgmMood[] = [
  { id: "calm", label: "잔잔", description: "평온한 일상·휴식", rootFreq: 130.81, scale: [0, 2, 4, 7, 9], tempo: 64, waveform: "sine" },
  { id: "romance", label: "설렘", description: "두근거리는 로맨스", rootFreq: 146.83, scale: [0, 2, 4, 7, 11], tempo: 72, waveform: "triangle" },
  { id: "tense", label: "긴장", description: "조여오는 서스펜스", rootFreq: 110.0, scale: [0, 2, 3, 7, 8], tempo: 88, waveform: "triangle" },
  { id: "sad", label: "슬픔", description: "먹먹한 슬픔·이별", rootFreq: 123.47, scale: [0, 2, 3, 5, 7, 10], tempo: 58, waveform: "sine" },
  { id: "epic", label: "웅장", description: "벅차오르는 클라이맥스", rootFreq: 98.0, scale: [0, 4, 7, 11, 12], tempo: 76, waveform: "triangle" },
  { id: "mystery", label: "미스터리", description: "수상한 미스터리", rootFreq: 116.54, scale: [0, 2, 4, 6, 8, 10], tempo: 66, waveform: "sine" },
  { id: "cheerful", label: "경쾌", description: "발랄·코믹", rootFreq: 164.81, scale: [0, 2, 4, 7, 9], tempo: 100, waveform: "triangle" },
];

export function findBgmMood(id: string): BgmMood | undefined {
  return BGM_MOODS.find((m) => m.id === id);
}

/** 반음 오프셋 → 주파수(평균율). 한 옥타브(12반음)는 두 배. */
export function noteToFreq(rootFreq: number, semitone: number): number {
  return rootFreq * Math.pow(2, semitone / 12);
}

export interface BgmStep {
  atBeat: number;
  /** 이 스텝에서 동시에 울릴 반음 오프셋들(코드). */
  semitones: number[];
  beats: number;
}

// 코드 진행(스케일 도수 사이클) — I·V·vi·IV 느낌을 음계 인덱스로 근사. 결정적.
const DEGREE_CYCLE = [0, 4, 5, 3];

/**
 * 무드의 음계로 bars 마디짜리 코드 진행을 만든다(마디당 4박, 3음 트라이어드).
 * 도수는 DEGREE_CYCLE을 순환하며, 음계를 넘어가면 옥타브(+12)로 올린다. 순수·결정적.
 */
export function buildProgression(mood: BgmMood, bars: number): BgmStep[] {
  const steps: BgmStep[] = [];
  const len = mood.scale.length;
  for (let b = 0; b < bars; b++) {
    const deg = DEGREE_CYCLE[b % DEGREE_CYCLE.length];
    const semitones = [0, 2, 4].map((k) => {
      const idx = deg + k;
      return mood.scale[idx % len] + 12 * Math.floor(idx / len);
    });
    steps.push({ atBeat: b * 4, semitones, beats: 4 });
  }
  return steps;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ── 브라우저 플레이어(테스트 대상 아님) ──────────────────────────────
export interface BgmPlayer {
  play(): void;
  pause(): void;
  setVolume(v: number): void;
  dispose(): void;
}

const NOOP_PLAYER: BgmPlayer = {
  play() {},
  pause() {},
  setVolume() {},
  dispose() {},
};

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// 자동 생성 앰비언트 플레이어 — 무드 코드 진행을 lookahead 스케줄러로 반복 재생.
function createProceduralPlayer(mood: BgmMood, volume: number): BgmPlayer {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return NOOP_PLAYER;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = clamp01(volume) * 0.22; // 패드는 낮게 — 배경에 묻히게
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  master.connect(lp);
  lp.connect(ctx.destination);

  const progression = buildProgression(mood, 4);
  const secPerBeat = 60 / mood.tempo;
  let stepIndex = 0;
  let nextTime = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function scheduleStep(step: BgmStep, when: number) {
    const dur = step.beats * secPerBeat;
    for (const st of step.semitones) {
      const osc = ctx.createOscillator();
      osc.type = mood.waveform;
      osc.frequency.value = noteToFreq(mood.rootFreq, st);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(0.9, when + Math.min(0.6, dur * 0.3));
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(env);
      env.connect(master);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    }
  }

  function tick() {
    const ahead = 0.2;
    while (nextTime < ctx.currentTime + ahead) {
      const step = progression[stepIndex % progression.length];
      scheduleStep(step, nextTime);
      nextTime += step.beats * secPerBeat;
      stepIndex += 1;
    }
  }

  return {
    play() {
      void ctx.resume();
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.1;
      if (timer == null) timer = setInterval(tick, 60);
      tick();
    },
    pause() {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      void ctx.suspend();
    },
    setVolume(v: number) {
      master.gain.value = clamp01(v) * 0.22;
    },
    dispose() {
      if (timer != null) clearInterval(timer);
      timer = null;
      void ctx.close();
    },
  };
}

// 커스텀 오디오 URL 플레이어 — <audio> 루프 래퍼.
function createUrlPlayer(url: string, volume: number): BgmPlayer {
  if (typeof Audio === "undefined") return NOOP_PLAYER;
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = clamp01(volume);
  audio.crossOrigin = "anonymous";
  return {
    play() {
      void audio.play().catch(() => {});
    },
    pause() {
      audio.pause();
    },
    setVolume(v: number) {
      audio.volume = clamp01(v);
    },
    dispose() {
      audio.pause();
      audio.src = "";
    },
  };
}

/**
 * BGM 플레이어 생성 — URL이 있으면 URL 우선, 아니면 무드 자동 생성, 둘 다 없으면 무동작.
 * 브라우저 외(SSR/테스트)에서는 안전하게 무동작 플레이어를 돌려준다.
 */
export function createBgmPlayer(opts: { mood?: BgmMood | null; url?: string; volume?: number }): BgmPlayer {
  const volume = clamp01(opts.volume ?? 0.5);
  if (opts.url) return createUrlPlayer(opts.url, volume);
  if (opts.mood) return createProceduralPlayer(opts.mood, volume);
  return NOOP_PLAYER;
}
