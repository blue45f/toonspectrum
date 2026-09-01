/**
 * EditorClient — the single object every UI entry point receives.
 *
 * 2026-09-02 아키텍처 리뷰의 처방: 메뉴·단축키·툴레일·라디얼 HUD·모바일 독·AI 액션·컴패니언
 * 창은 각각 `Dispatch<SetStateAction<…>>` 뭉치를 받는 대신 **오직 이 클라이언트 하나**만
 * 받는다. UI 는 `getSnapshot()`/`subscribe()` 로 상태를 읽고(선택자 경유), 변경은 전부
 * `dispatch(request)` 라는 한 문을 통과한다. 그래서 "레일에서 누른 브러시 변경"과 "단축키로
 * 누른 브러시 변경"이 물리적으로 같은 경로를 탄다.
 *
 * 이 파일은 계약 + 참조 구현만 담는다. 호스트 배선(StudioCuttoonEditorHost 등)은 별도 레인이다.
 */

import type { CommandRegistry } from "./registry";
import type { Availability, CommandContext, CommandId, UndoEntry } from "./types";

/** 명령을 발사한 표면. 리시트에 그대로 실려 원격 진단/텔레메트리에서 원인 표면을 구분한다. */
export type EditorCommandSource =
  | "menu"
  | "shortcut"
  | "palette"
  | "rail"
  | "radial"
  | "mobile-dock"
  | "inspector"
  | "companion"
  | "ai"
  | "test";

export interface EditorCommandRequest {
  id: CommandId;
  /** 명령별 인자. 레지스트리는 들여다보지 않고 컨텍스트로 실어 나른다. */
  payload?: unknown;
  source: EditorCommandSource;
}

/**
 * DOM `AbortSignal` 중 이 계약이 읽는 부분만 구조적으로 선언한다.
 *
 * studio-command-registry 는 DOM lib 없이(`lib: ["ES2022"]`) 타입체크되는 패키지라 전역
 * `AbortSignal` 을 참조할 수 없다. 실제 `AbortSignal` 은 이 형태에 구조적으로 할당 가능하므로
 * 호출자는 `controller.signal` 을 그대로 넘기면 된다.
 */
export interface DispatchAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

export interface DispatchOptions {
  /** 이미 abort 된 신호면 실행 없이 `aborted` 리시트를 돌려준다. */
  signal?: DispatchAbortSignal;
  /** 같은 키의 dispatch 가 비행 중이면 같은 promise 를 돌려준다(중복 발사 합치기). */
  coalesceKey?: string;
  /** 진단용 자유 문자열. 리시트 message 의 기본값으로 쓰이지는 않는다. */
  reason?: string;
}

/** 커밋이 더럽힌 화면 영역(문서 좌표계). 렌더러가 부분 재합성 범위를 잡는 데 쓴다. */
export interface TileRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CommandReceiptStatus =
  | "applied"
  | "rejected"
  | "unavailable"
  | "failed"
  | "aborted";

/** 이 리시트 시점에 결과가 어디까지 내려갔는지. */
export type CommandDurableState = "memory" | "opfs" | "server";

export interface CommandReceipt {
  requestId: string;
  commandId: CommandId;
  status: CommandReceiptStatus;
  /** 실행 뒤 편집기 리비전. 낙관적 UI 가 자기 예측을 폐기할 기준점이다. */
  acceptedRevision: number;
  message?: string;
  dirtyRegions: readonly TileRegion[];
  durableState: CommandDurableState;
  undo?: UndoEntry;
}

/**
 * 명령이 `CommandResult.payload` 에 이 모양을 실어 보내면 리시트로 승격된다.
 * 실지 않으면 `dirtyRegions: []`, `durableState: "memory"` 로 남는다.
 */
export interface EditorCommandOutcomeHints {
  dirtyRegions?: readonly TileRegion[];
  durableState?: CommandDurableState;
}

/** `CommandContext.services` 에서 현재 요청을 꺼내는 키. */
export const EDITOR_REQUEST_SERVICE_KEY = "editor.request";
/** `CommandContext.services` 에서 현재 dispatch 옵션을 꺼내는 키. */
export const EDITOR_DISPATCH_OPTIONS_SERVICE_KEY = "editor.dispatch-options";

/**
 * `useSyncExternalStore` 와 바로 맞물리는 최소 스토어.
 *
 * 참조 동등이면 통지하지 않는다 — 그래야 선택자 훅이 "바뀌지 않은 선택"에 대해 리렌더를
 * 만들지 않는다.
 */
export interface EditorSnapshotStore<S> {
  getSnapshot(): S;
  subscribe(listener: () => void): () => void;
  set(next: S): void;
  update(fn: (prev: S) => S): void;
}

export function createEditorSnapshotStore<S>(initial: S): EditorSnapshotStore<S> {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  const set = (next: S): void => {
    if (Object.is(next, snapshot)) return;
    snapshot = next;
    // 통지 중 구독 해제가 일어나도 안전하도록 사본을 순회한다.
    for (const listener of [...listeners]) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    update: (fn) => {
      set(fn(snapshot));
    },
  };
}

export interface EditorClient<S> {
  getSnapshot(): S;
  subscribe(listener: () => void): () => void;
  dispatch(
    request: EditorCommandRequest,
    options?: DispatchOptions,
  ): Promise<CommandReceipt>;
  availability(id: CommandId): Availability;
  ids(): readonly CommandId[];
}

export interface EditorClientOptions<S> {
  registry: CommandRegistry;
  store: EditorSnapshotStore<S>;
  /** 매 dispatch 마다 새로 읽는다 — 워크스페이스/권한/플래그가 그 사이 바뀔 수 있다. */
  context: () => CommandContext;
  /**
   * 실행 직후의 편집기 리비전. 생략하면 내부 카운터를 쓰며, 문서를 실제로 바꾼 실행
   * (`CommandResult.status === "ok"`) 마다 1 씩 올라간다. `noop` 은 수락되었지만 리비전을
   * 움직이지 않는다.
   */
  revision?: () => number;
  /** 성공·실패·불가·중단 — 모든 결말에 대해 정확히 한 번 호출된다. */
  onReceipt?: (receipt: CommandReceipt) => void;
  /** 기본 requestId 에 찍히는 시각. 테스트에서 고정하려고 주입한다. 기본값 `Date.now`. */
  now?: () => number;
  /** 기본값은 `req-<순번>-<now()>`. 원격 진단이 요청을 추적할 유일 키다. */
  requestId?: () => string;
}

function isTileRegion(value: unknown): value is TileRegion {
  if (typeof value !== "object" || value === null) return false;
  const region = value as Record<string, unknown>;
  return (
    typeof region.x === "number"
    && typeof region.y === "number"
    && typeof region.width === "number"
    && typeof region.height === "number"
  );
}

function readOutcomeHints(payload: unknown): Required<EditorCommandOutcomeHints> {
  const empty = {
    dirtyRegions: [] as readonly TileRegion[],
    durableState: "memory" as CommandDurableState,
  };
  if (typeof payload !== "object" || payload === null) return empty;
  const hints = payload as Record<string, unknown>;
  const regions = Array.isArray(hints.dirtyRegions)
    ? hints.dirtyRegions.filter(isTileRegion)
    : empty.dirtyRegions;
  const durable = hints.durableState;
  const durableState =
    durable === "memory" || durable === "opfs" || durable === "server"
      ? durable
      : empty.durableState;
  return { dirtyRegions: regions, durableState };
}

export function createEditorClient<S>(
  options: EditorClientOptions<S>,
): EditorClient<S> {
  const { registry, store, context, onReceipt } = options;
  const now = options.now ?? (() => Date.now());

  let sequence = 0;
  const nextRequestId =
    options.requestId ?? (() => `req-${(sequence += 1)}-${now()}`);

  let internalRevision = 0;
  const readRevision = options.revision ?? (() => internalRevision);

  const inFlight = new Map<string, Promise<CommandReceipt>>();

  const availability = (id: CommandId): Availability => {
    const command = registry.get(id);
    if (!command) {
      return { state: "hidden", reason: `unknown command: ${id}` };
    }
    return registry.availabilityOf(id, context());
  };

  const settle = (receipt: CommandReceipt): CommandReceipt => {
    onReceipt?.(receipt);
    return receipt;
  };

  const run = async (
    request: EditorCommandRequest,
    dispatchOptions: DispatchOptions | undefined,
    requestId: string,
  ): Promise<CommandReceipt> => {
    const base: Omit<CommandReceipt, "status" | "acceptedRevision"> = {
      requestId,
      commandId: request.id,
      dirtyRegions: [],
      durableState: "memory",
    };

    const command = registry.get(request.id);
    if (!command) {
      return settle({
        ...base,
        status: "unavailable",
        acceptedRevision: readRevision(),
        message: `unknown command: ${request.id}`,
      });
    }

    const baseContext = context();
    const services = new Map(baseContext.services);
    services.set(EDITOR_REQUEST_SERVICE_KEY, request);
    if (dispatchOptions) {
      services.set(EDITOR_DISPATCH_OPTIONS_SERVICE_KEY, dispatchOptions);
    }
    const commandContext: CommandContext = { ...baseContext, services };

    const state = registry.availabilityOf(request.id, commandContext);
    if (state.state !== "enabled") {
      return settle({
        ...base,
        status: "unavailable",
        acceptedRevision: readRevision(),
        message: state.reason,
      });
    }

    try {
      // 레지스트리 경로를 그대로 탄다: 가용성 재확인 + `undo` 팩토리 부착까지 한 번에.
      const result = await registry.execute(request.id, commandContext);
      const hints = readOutcomeHints(result.payload);
      if (result.status === "ok") internalRevision += 1;
      const status: CommandReceiptStatus =
        result.status === "ok" || result.status === "noop"
          ? "applied"
          : result.status === "cancelled"
            ? "aborted"
            : "failed";
      return settle({
        ...base,
        status,
        acceptedRevision: readRevision(),
        message: result.message,
        dirtyRegions: hints.dirtyRegions,
        durableState: hints.durableState,
        undo: result.undo,
      });
    } catch (error) {
      return settle({
        ...base,
        status: "failed",
        acceptedRevision: readRevision(),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const dispatch = (
    request: EditorCommandRequest,
    dispatchOptions?: DispatchOptions,
  ): Promise<CommandReceipt> => {
    const requestId = nextRequestId();

    // 이미 취소된 신호는 실행 자체를 하지 않는다. 실행 중 취소는 시도하지 않는다 —
    // 명령이 문서를 반쯤 바꾼 상태에서 끊기는 것이 더 나쁘기 때문이다.
    if (dispatchOptions?.signal?.aborted) {
      return Promise.resolve(
        settle({
          requestId,
          commandId: request.id,
          status: "aborted",
          acceptedRevision: readRevision(),
          message: dispatchOptions.reason ?? "dispatch aborted before execute",
          dirtyRegions: [],
          durableState: "memory",
        }),
      );
    }

    const key = dispatchOptions?.coalesceKey;
    if (key !== undefined) {
      const pending = inFlight.get(key);
      // 합쳐진 호출은 원본과 같은 promise 를 받는다 = 리시트도 원본 것 하나뿐이고
      // `onReceipt` 도 한 번만 울린다.
      if (pending) return pending;
      const started = run(request, dispatchOptions, requestId).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, started);
      return started;
    }

    return run(request, dispatchOptions, requestId);
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    dispatch,
    availability,
    ids: () => registry.ids(),
  };
}
