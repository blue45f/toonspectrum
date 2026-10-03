import { useCallback, useEffect, useRef, useState } from "react";

export type SpaceToastTone = "info" | "success" | "warn" | "error";

export interface SpaceToast {
  readonly id: string;
  readonly message: string;
  readonly tone: SpaceToastTone;
  readonly createdAt: number;
}

/** 동시에 보이는 알림 수와 자동 닫힘 시간. */
export const SPACE_TOAST_LIMIT = 3;
export const SPACE_TOAST_DURATION_MS = 5_000;

/** 같은 문구가 이미 떠 있으면 새로 쌓지 않고 최신 것만 남긴다. 최대 개수를 넘으면 오래된 것부터 뺀다. */
export function pushSpaceToast(current: readonly SpaceToast[], toast: SpaceToast, limit = SPACE_TOAST_LIMIT): readonly SpaceToast[] {
  const message = toast.message.trim();
  if (!message) return current;
  const next = [...current.filter((item) => item.message !== message), { ...toast, message }];
  return next.slice(Math.max(0, next.length - Math.max(1, limit)));
}

export function dismissSpaceToast(current: readonly SpaceToast[], id: string): readonly SpaceToast[] {
  return current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : current;
}

/** HUD 알림 큐. 하나의 문자열 상태(setSocialNotice)를 대체한다. */
export function useSpaceToasts(durationMs = SPACE_TOAST_DURATION_MS) {
  const [toasts, setToasts] = useState<readonly SpaceToast[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => dismissSpaceToast(current, id));
  }, []);
  const notify = useCallback((message: string, tone: SpaceToastTone = "info") => {
    if (!message.trim()) return;
    sequence.current += 1;
    const id = `space-toast-${sequence.current}`;
    setToasts((current) => pushSpaceToast(current, { id, message, tone, createdAt: Date.now() }));
    timers.current.set(id, globalThis.setTimeout(() => {
      timers.current.delete(id);
      setToasts((current) => dismissSpaceToast(current, id));
    }, durationMs));
  }, [durationMs]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) globalThis.clearTimeout(timer);
      pending.clear();
    };
  }, []);
  return { toasts, notify, dismiss };
}
/**
 * 프라이빗 구역 진입 안내: 바깥→안으로 들어간 순간에만 청취 범위를 한 번 알린다.
 * 안에 머무는 동안에는 다시 띄우지 않고, 나갔다가 다시 들어오면 새로 알린다.
 * 형식(format)은 bt로 만든 한국어·영어 문구를 돌려준다.
 */
export function useSpacePrivateZoneNotice(
  inside: boolean,
  notify: (message: string, tone?: SpaceToastTone) => void,
  format: () => string,
): void {
  const latest = useRef({ notify, format });
  latest.current = { notify, format };
  const wasInside = useRef(false);
  useEffect(() => {
    if (inside && !wasInside.current) latest.current.notify(latest.current.format(), "info");
    wasInside.current = inside;
  }, [inside]);
}

/**
 * 프라이빗 구역 진입 안내: 바깥→안으로 들어간 순간에만 청취 범위를 한 번 알린다.
 * 안에 머무는 동안에는 다시 띄우지 않고, 나갔다가 다시 들어오면 새로 알린다.
 * 형식(format)은 bt로 만든 한국어·영어 문구를 돌려준다.
 */
