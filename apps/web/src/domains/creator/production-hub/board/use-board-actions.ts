import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBoardActions, type BoardActionContext } from "./board-actions";
import type { BoardToastMessage } from "./BoardToast";

export type BoardActionOptions = Omit<BoardActionContext, "show" | "announce">;

/**
 * 보드 저장 동작과 알림 상태. 동작 구현은 `createBoardActions`이고, 이 훅은 최신 옵션을 ref로 이어 주고
 * 알림(토스트)과 스크린 리더용 상태 문구를 보관한다.
 */
export function useBoardActions(options: BoardActionOptions) {
  const [toast, setToast] = useState<BoardToastMessage | null>(null);
  const [notice, setNotice] = useState("");
  const counter = useRef(0);
  const show = useCallback((message: Omit<BoardToastMessage, "id">) => {
    counter.current += 1;
    setToast({ id: counter.current, ...message });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const announce = useCallback((message: string) => setNotice(message), []);
  const context = useRef<BoardActionContext>({ ...options, show, announce });
  useEffect(() => {
    context.current = { ...options, show, announce };
  }, [options, show, announce]);
  const actions = useMemo(() => createBoardActions(() => context.current), []);
  return { ...actions, toast, dismissToast, show, notice, announce };
}
