import { useCallback, useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  clampDeckIndex,
  engineeringDeckHash,
  engineeringDeckSearch,
  isDeckTrack,
  parseEngineeringDeckState,
  type DeckTrack,
  type DeckView,
  type EngineeringDeckState,
} from "./engineering-deck-state";

/**
 * 발표 모드의 외부 시스템 동기화(URL·키보드·전체 화면·다른 창·세션 저장소)를 한곳에서 관리한다.
 * 슬라이드 모델과 화면 배치는 호출하는 페이지가 소유한다.
 */

const SYNC_CHANNEL = "toonstudio-engineering-deck";
const TIMER_STORAGE_KEY = "toonstudio-engineering-deck-timer";
const POSITION_STORAGE_KEY = "toonstudio-engineering-deck-position";
const JUMP_BUFFER_TIMEOUT_MS = 1600;
const SWIPE_MIN_DISTANCE_PX = 60;

function readDeckLocation(): EngineeringDeckState {
  if (typeof window === "undefined") return parseEngineeringDeckState("", "");
  return parseEngineeringDeckState(window.location.search, window.location.hash);
}

function readSession<T>(key: string, parse: (value: unknown) => T | null): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없어도 발표 조작은 계속된다.
  }
}

/* ── URL과 슬라이드 위치 ─────────────────────────────────── */

export interface DeckPosition {
  readonly track: DeckTrack;
  readonly index: number;
  readonly view: DeckView;
  /** 이 탭에서 같은 트랙을 보던 마지막 위치. URL에 위치가 없을 때만 이어보기를 제안한다. */
  readonly resumeIndex: number | null;
  readonly goTo: (index: number) => void;
  readonly setTrack: (track: DeckTrack) => void;
  /** 다른 창에서 받은 위치를 적용한다(다시 방송하지 않음). */
  readonly applyRemote: (track: DeckTrack, index: number) => void;
  readonly dismissResume: () => void;
}

interface StoredPosition {
  readonly track: DeckTrack;
  readonly index: number;
}

function parseStoredPosition(value: unknown): StoredPosition | null {
  if (!value || typeof value !== "object" || !("track" in value) || !("index" in value)) return null;
  const { track, index } = value;
  return isDeckTrack(track) && typeof index === "number" && Number.isSafeInteger(index) ? { track, index } : null;
}

export function useDeckPosition(slideCount: (track: DeckTrack) => number): DeckPosition {
  const [state, setState] = useState(() => {
    const location = readDeckLocation();
    const stored = typeof window === "undefined" ? null : readSession(POSITION_STORAGE_KEY, parseStoredPosition);
    const hasHashPosition = typeof window !== "undefined" && /^#(?:slide-|deck=)/u.test(window.location.hash);
    const resumeIndex = !hasHashPosition && stored && stored.track === location.track && stored.index > 0 ? stored.index : null;
    return { track: location.track, index: location.index, view: location.view, resumeIndex };
  });

  const safeIndex = clampDeckIndex(state.index, slideCount(state.track));

  // URL은 외부 시스템이다. 라우터 이력을 늘리지 않도록 replaceState로만 맞춘다.
  useEffect(() => {
    const nextSearch = engineeringDeckSearch({ track: state.track, view: state.view });
    const nextHash = engineeringDeckHash(safeIndex);
    if (window.location.search !== nextSearch || window.location.hash !== nextHash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch}${nextHash}`);
    }
    if (state.view === "audience") writeSession(POSITION_STORAGE_KEY, { track: state.track, index: safeIndex });
  }, [state.track, state.view, safeIndex]);

  useEffect(() => {
    const restore = (): void => {
      const location = readDeckLocation();
      setState((current) => ({ ...current, track: location.track, index: location.index, view: location.view }));
    };
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);

  const goTo = useCallback((index: number) => {
    const next = clampDeckIndex(index, slideCount(state.track));
    if (next === safeIndex) return;
    setState((current) => ({ ...current, index: next, resumeIndex: null }));
  }, [safeIndex, slideCount, state.track]);

  const setTrack = useCallback((track: DeckTrack) => {
    if (track === state.track) return;
    setState((current) => ({ ...current, track, index: 0, resumeIndex: null }));
  }, [state.track]);

  const applyRemote = useCallback((track: DeckTrack, index: number) => {
    setState((current) => (current.track === track && current.index === index
      ? current
      : { ...current, track, index, resumeIndex: null }));
  }, []);

  const dismissResume = useCallback(() => setState((current) => ({ ...current, resumeIndex: null })), []);

  return {
    track: state.track,
    index: safeIndex,
    view: state.view,
    resumeIndex: state.resumeIndex,
    goTo,
    setTrack,
    applyRemote,
    dismissResume,
  };
}

/* ── 다른 창(발표자 창) 동기화 ─────────────────────────────── */

type DeckSyncMessage =
  | { readonly v: 1; readonly kind: "state"; readonly track: DeckTrack; readonly index: number; readonly from: string }
  | { readonly v: 1; readonly kind: "sync-request"; readonly from: string };

function parseSyncMessage(value: unknown): DeckSyncMessage | null {
  if (!value || typeof value !== "object" || !("v" in value) || !("from" in value) || !("kind" in value)) return null;
  const { v, from, kind } = value;
  if (v !== 1 || typeof from !== "string") return null;
  if (kind === "sync-request") return { v: 1, kind: "sync-request", from };
  if (kind !== "state" || !("track" in value) || !("index" in value)) return null;
  const { track, index } = value;
  return isDeckTrack(track) && typeof index === "number" && Number.isSafeInteger(index) && index >= 0
    ? { v: 1, kind: "state", track, index, from }
    : null;
}

export interface DeckSync {
  readonly available: boolean;
}

/**
 * BroadcastChannel로 같은 브라우저의 청중 화면과 발표자 창을 같은 슬라이드로 맞춘다.
 * 새로 열린 창은 위치를 방송하지 않고 먼저 현재 위치를 요청한다(이미 발표 중인 창이 기준).
 */
export function useDeckSync(current: { readonly track: DeckTrack; readonly index: number }, apply: (track: DeckTrack, index: number) => void): DeckSync {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const syncedKeyRef = useRef<string | null>(null);
  const [senderId] = useState(() => `deck-${Math.random().toString(36).slice(2, 10)}`);
  const [available] = useState(() => typeof window !== "undefined" && typeof window.BroadcastChannel === "function");

  const onMessage = useEffectEvent((data: unknown) => {
    const message = parseSyncMessage(data);
    if (!message || message.from === senderId) return;
    if (message.kind === "sync-request") {
      channelRef.current?.postMessage({ v: 1, kind: "state", track: current.track, index: current.index, from: senderId } satisfies DeckSyncMessage);
      return;
    }
    syncedKeyRef.current = `${message.track}:${message.index}`;
    apply(message.track, message.index);
  });

  useEffect(() => {
    if (!available) return;
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => onMessage(event.data);
    channel.postMessage({ v: 1, kind: "sync-request", from: senderId } satisfies DeckSyncMessage);
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [available, senderId]);

  useEffect(() => {
    const key = `${current.track}:${current.index}`;
    if (syncedKeyRef.current === null || syncedKeyRef.current === key) {
      syncedKeyRef.current = key;
      return;
    }
    syncedKeyRef.current = key;
    channelRef.current?.postMessage({ v: 1, kind: "state", track: current.track, index: current.index, from: senderId } satisfies DeckSyncMessage);
  }, [current.track, current.index, senderId]);

  return { available };
}

/* ── 발표 타이머 ─────────────────────────────────────────── */

export interface DeckTimerState {
  /** 실행 중이면 시작 시각(ms), 멈춰 있으면 null. */
  readonly startedAt: number | null;
  /** 이전 실행 구간에서 누적된 초. */
  readonly accumulatedSeconds: number;
}

export interface DeckTimer extends DeckTimerState {
  readonly running: boolean;
  readonly start: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly reset: () => void;
}

function parseTimer(value: unknown): DeckTimerState | null {
  if (!value || typeof value !== "object" || !("startedAt" in value) || !("accumulatedSeconds" in value)) return null;
  const { startedAt, accumulatedSeconds } = value;
  if (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt))) return null;
  if (typeof accumulatedSeconds !== "number" || !Number.isFinite(accumulatedSeconds) || accumulatedSeconds < 0) return null;
  return { startedAt, accumulatedSeconds };
}

export function elapsedDeckSeconds(timer: DeckTimerState, now: number): number {
  const running = timer.startedAt === null ? 0 : Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  return timer.accumulatedSeconds + running;
}

/** 새로고침해도 같은 탭에서는 경과 시간을 이어간다(sessionStorage). */
export function useDeckTimer(): DeckTimer {
  const [timer, setTimer] = useState<DeckTimerState>(() => (
    typeof window === "undefined" ? null : readSession(TIMER_STORAGE_KEY, parseTimer)
  ) ?? { startedAt: null, accumulatedSeconds: 0 });

  useEffect(() => {
    writeSession(TIMER_STORAGE_KEY, timer.startedAt === null && timer.accumulatedSeconds === 0 ? null : timer);
  }, [timer]);

  const start = useCallback(() => {
    setTimer((current) => (current.startedAt === null ? { ...current, startedAt: Date.now() } : current));
  }, []);
  const pause = useCallback(() => {
    setTimer((current) => (current.startedAt === null
      ? current
      : { startedAt: null, accumulatedSeconds: elapsedDeckSeconds(current, Date.now()) }));
  }, []);
  const toggle = useCallback(() => {
    setTimer((current) => (current.startedAt === null
      ? { ...current, startedAt: Date.now() }
      : { startedAt: null, accumulatedSeconds: elapsedDeckSeconds(current, Date.now()) }));
  }, []);
  const reset = useCallback(() => setTimer({ startedAt: null, accumulatedSeconds: 0 }), []);

  return { ...timer, running: timer.startedAt !== null, start, pause, toggle, reset };
}

/** 초 단위로 다시 그려지는 현재 시각. 타이머 표시 컴포넌트 안에서만 사용해 페이지 전체 재렌더를 피한다. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

/* ── 전체 화면 ───────────────────────────────────────────── */

export function useFullscreenState(): boolean {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = (): void => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return fullscreen;
}

export async function requestDocumentFullscreen(): Promise<boolean> {
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== "function") return false;
  try {
    await root.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitDocumentFullscreen(): Promise<void> {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== "function") return;
  try {
    await document.exitFullscreen();
  } catch {
    // 브라우저가 거부하면 사용자가 Esc로 직접 종료할 수 있다.
  }
}

/* ── 키보드 ──────────────────────────────────────────────── */

export type DeckCommand =
  | "next"
  | "previous"
  | "first"
  | "last"
  | "present"
  | "notes"
  | "overview"
  | "blackout"
  | "timer"
  | "help"
  | "escape";

const FORM_FIELD_SELECTOR = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
const CONTROL_SELECTOR = `a, button, summary, [role="button"], [role="link"], ${FORM_FIELD_SELECTOR}`;

/**
 * 키 입력을 발표 명령으로 바꾼다.
 * - 입력 필드에서는 발표 단축키를 쓰지 않는다.
 * - 발표 중이 아니면 버튼·링크에 초점이 있을 때도 쓰지 않는다(기본 동작 유지).
 * - 발표 중에는 버튼에 초점이 있어도 화살표로 넘기되 Space/Enter는 버튼에 맡긴다.
 */
export function deckCommandForKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "target">, presenting: boolean): DeckCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (event.key === "Escape") return "escape";
  if (target?.closest(FORM_FIELD_SELECTOR)) return null;
  const onControl = Boolean(target?.closest(CONTROL_SELECTOR));
  if (onControl && (!presenting || event.key === " " || event.key === "Enter")) return null;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "previous";
    case " ":
      return event.shiftKey ? "previous" : "next";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      break;
  }
  switch (event.key.toLowerCase()) {
    case "f":
      return "present";
    case "n":
    case "s":
      return "notes";
    case "o":
      return "overview";
    case "b":
    case ".":
      return "blackout";
    case "t":
      return "timer";
    case "?":
      return "help";
    default:
      return null;
  }
}

/** 숫자를 누른 뒤 Enter로 해당 번호 슬라이드로 이동한다(Keynote·Reveal.js와 같은 방식). */
export function useSlideNumberJump(onJump: (position: number) => void): {
  readonly buffer: string;
  readonly handleKey: (event: KeyboardEvent) => boolean;
} {
  const [buffer, setBuffer] = useState("");
  const timeoutRef = useRef<number | null>(null);
  const bufferRef = useRef("");

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleKey = useCallback((event: KeyboardEvent): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(FORM_FIELD_SELECTOR)) return false;
    const update = (value: string): void => {
      bufferRef.current = value;
      setBuffer(value);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = value ? window.setTimeout(() => update(""), JUMP_BUFFER_TIMEOUT_MS) : null;
    };
    if (/^\d$/u.test(event.key) && bufferRef.current.length < 3) {
      update(bufferRef.current + event.key);
      return true;
    }
    if (event.key === "Enter" && bufferRef.current) {
      const position = Number(bufferRef.current);
      update("");
      if (position > 0) onJump(position);
      return true;
    }
    return false;
  }, [onJump]);

  return { buffer, handleKey };
}

/* ── 터치 스와이프 ───────────────────────────────────────── */

export function useSwipeNavigation(onNext: () => void, onPrevious: () => void) {
  const startRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    startRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext();
    else onPrevious();
  }, [onNext, onPrevious]);
  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);
  return { onPointerDown, onPointerUp, onPointerCancel };
}
