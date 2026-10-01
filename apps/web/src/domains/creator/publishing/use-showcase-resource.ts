import { useCallback, useEffect, useEffectEvent, useState } from "react";

/**
 * 창작 갤러리·챌린지 목록 요청 상태.
 * 로딩·성공·실패를 하나의 판별 유니온으로 좁혀, 화면이 "로딩인데 오류도 있는" 모순 상태를 만들지 않게 한다.
 */
export type ShowcaseResourceState<T> =
  | { readonly status: "idle"; readonly data: null; readonly error: null }
  | { readonly status: "loading"; readonly data: null; readonly error: null }
  | { readonly status: "ready"; readonly data: T; readonly error: null }
  | { readonly status: "error"; readonly data: null; readonly error: string };

export type ShowcaseResource<T> = ShowcaseResourceState<T> & {
  /** 같은 요청을 다시 보낸다(재시도 버튼). */
  readonly reload: () => void;
};

const IDLE = { status: "idle", data: null, error: null } as const;
const LOADING = { status: "loading", data: null, error: null } as const;

/**
 * 취소 가능한 목록 요청 훅.
 *
 * - `requestKey`가 바뀌면 이전 요청을 취소하고 새로 요청한다. `null`이면 요청하지 않는다(비로그인 탭 등).
 * - 응답이 늦게 도착해도 취소된 요청은 상태를 덮어쓰지 않는다.
 * - 실패 메시지는 서버/클라이언트가 준 사용자용 문장을 우선하고, 없으면 `fallbackError`를 쓴다.
 */
export function useShowcaseResource<T>(
  requestKey: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  fallbackError: string,
): ShowcaseResource<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ShowcaseResourceState<T>>(requestKey === null ? IDLE : LOADING);
  const runLoad = useEffectEvent((signal: AbortSignal) => load(signal));
  const failureText = useEffectEvent((cause: unknown) =>
    cause instanceof Error && cause.message.trim() ? cause.message : fallbackError,
  );

  useEffect(() => {
    if (requestKey === null) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState(LOADING);
    runLoad(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data, error: null });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", data: null, error: failureText(cause) });
      },
    );
    return () => controller.abort();
  }, [requestKey, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  return { ...state, reload };
}
