import { creatorMeetingClient, meetingIsTerminal } from "./creator-meeting-client";

import type { MeetingCommand } from "./creator-meeting-client";
import type { CreatorRoom, CreatorRoomMessage } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/infrastructure/api";

export interface MeetingSessionState {
  phase: "loading" | "ready" | "paused" | "error";
  room: CreatorRoom | null;
  messages: CreatorRoomMessage[];
  checking: boolean;
  busy: boolean;
  error: string;
  notice: string;
  lastCheckedAt: number | null;
}
export interface MeetingSessionOptions {
  client?: typeof creatorMeetingClient;
  available?: () => boolean;
  now?: () => number;
}
const initial = (): MeetingSessionState => ({ phase: "loading", room: null, messages: [], checking: false, busy: false, error: "", notice: "", lastCheckedAt: null });

/** Ephemeral, room/account-scoped state. Never persists interview data or retries writes. */
export function createCreatorMeetingSession(id: string, actor: string, options: MeetingSessionOptions = {}) {
  const client = options.client ?? creatorMeetingClient;
  const available = options.available ?? (() => document.visibilityState !== "hidden" && navigator.onLine !== false);
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let state = initial();
  let running = false;
  let readController: AbortController | null = null;
  let writeController: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (patch: Partial<MeetingSessionState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const cancelRead = () => {
    clearTimeout(timer); timer = undefined;
    readController?.abort(); readController = null;
  };
  const pause = () => {
    cancelRead();
    const uncertain = Boolean(writeController);
    writeController?.abort(); writeController = null;
    emit({ phase: "paused", room: null, messages: [], checking: false, busy: false, error: "",
      notice: uncertain ? "진행 중 요청의 결과는 아직 확인되지 않았어요. 돌아오면 최신 대화를 먼저 확인해 주세요." : state.notice });
  };
  async function read() {
    if (!running) return;
    if (!available()) { pause(); return; }
    if (writeController || readController) return;
    clearTimeout(timer); timer = undefined;
    const controller = new AbortController(); readController = controller;
    emit({ checking: true, phase: state.room ? "ready" : "loading", error: "" });
    try {
      const next = await client.read(id, actor, controller.signal);
      if (!running || readController !== controller || controller.signal.aborted) return;
      readController = null;
      emit({ ...next, phase: "ready", checking: false, lastCheckedAt: now() });
      if (!meetingIsTerminal(next.room)) timer = setTimeout(() => { void read(); }, 5000);
    } catch (cause) {
      const error = await getApiErrorMessage(cause, "방 상태를 확인하지 못했어요.");
      if (!running || readController !== controller || controller.signal.aborted) return;
      readController = null;
      emit({ phase: "error", room: null, messages: [], checking: false, error });
      // An error requires a manual refresh or a genuine visibility/network recovery.
    }
  }
  const permitted = (room: CreatorRoom, command: MeetingCommand) => {
    if (room.status === "ended" || room.myStatus === "removed") return false;
    if (command.type === "host") return room.hostId === actor;
    if (command.type === "enter") return room.myStatus === "invited" || room.myStatus === "left";
    if (command.type === "leave") return room.hostId !== actor && ["waiting", "admitted"].includes(room.myStatus);
    return command.text.trim().length > 0 && command.text.length <= 2000 &&
      (room.myStatus === "admitted" || (room.myStatus === "waiting" && command.audience === "lobby"));
  };
  async function send(command: MeetingCommand): Promise<boolean> {
    const room = state.room;
    if (!running || !available() || writeController || state.phase !== "ready" || !room || !permitted(room, command)) return false;
    cancelRead();
    const controller = new AbortController(); writeController = controller;
    emit({ busy: true, checking: false, error: "", notice: "" });
    try {
      await client.send(id, room.epoch, command, controller.signal);
      if (!running || writeController !== controller || controller.signal.aborted) return false;
      writeController = null;
      emit({ phase: "loading", room: null, messages: [], busy: false,
        notice: command.type === "messages" ? "서버에서 메시지 저장을 확인했어요." : "요청 처리를 확인했어요. 최신 방 상태를 확인합니다." });
      void read();
      return true;
    } catch (cause) {
      const error = await getApiErrorMessage(cause, "요청 결과를 확인하지 못했어요.");
      if (!running || writeController !== controller || controller.signal.aborted) return false;
      writeController = null;
      emit({ phase: "error", room: null, messages: [], busy: false, error,
        notice: "자동으로 다시 전송하지 않습니다. 처리가 완료됐을 수도 있으니 최신 상태를 확인한 후 다시 시도해 주세요." });
      return false;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() { if (running) return; running = true; void read(); },
    dispose() {
      running = false; cancelRead(); writeController?.abort(); writeController = null;
      state = initial();
    },
    refresh: () => { void read(); },
    suspend: pause,
    resume: () => { if (running && state.phase === "paused") void read(); },
    send,
  };
}
