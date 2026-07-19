import { Injectable } from "@nestjs/common";

export type StudioLiveRoomTransitionState =
  | "current"
  | "socket_stale"
  | "generation_stale";

export interface StudioLiveRoomAdapterSocket {
  join(room: string): void | Promise<void>;
  leave(room: string): void | Promise<void>;
}

interface StudioLiveEnterRoomInput {
  readonly socket: StudioLiveRoomAdapterSocket;
  readonly nextRoom: string;
  readonly joinNextRoom: boolean;
  readonly currentState: () => StudioLiveRoomTransitionState;
  readonly onIsolationFailure: () => void;
}

interface StudioLiveLeavePreviousRoomInput {
  readonly socket: StudioLiveRoomAdapterSocket;
  readonly previousRoom: string;
  readonly speculativeNextRoom: string | null;
  readonly currentState: () => StudioLiveRoomTransitionState;
  readonly onIsolationFailure: () => void;
}

/**
 * Owns only adapter-room I/O ordering. Session/ACL policy, socket identity, participant state and
 * presence fan-out remain gateway responsibilities and are supplied as synchronous boundaries.
 */
@Injectable()
export class StudioLiveRoomTransitionCoordinator {
  async enterNextRoom(
    input: StudioLiveEnterRoomInput
  ): Promise<StudioLiveRoomTransitionState> {
    if (input.joinNextRoom) await input.socket.join(input.nextRoom);
    const state = input.currentState();
    if (state === "current" || !input.joinNextRoom) return state;
    await this.rollbackEnteredRoom(
      input.socket,
      input.nextRoom,
      input.onIsolationFailure
    );
    return state;
  }

  async leavePreviousRoom(
    input: StudioLiveLeavePreviousRoomInput
  ): Promise<StudioLiveRoomTransitionState> {
    try {
      await input.socket.leave(input.previousRoom);
    } catch (error) {
      if (input.speculativeNextRoom) {
        await this.rollbackEnteredRoom(
          input.socket,
          input.speculativeNextRoom,
          input.onIsolationFailure
        );
      }
      throw error;
    }

    const state = input.currentState();
    if (state === "current" || !input.speculativeNextRoom) return state;
    await this.rollbackEnteredRoom(
      input.socket,
      input.speculativeNextRoom,
      input.onIsolationFailure
    );
    return state;
  }

  leaveJoinedRoomBestEffort(
    socket: StudioLiveRoomAdapterSocket,
    room: string
  ): void {
    try {
      const leaveResult = socket.leave(room);
      if (leaveResult) void Promise.resolve(leaveResult).catch(() => undefined);
    } catch {
      // The caller has already closed the transport, which is the authoritative isolation path.
    }
  }

  async rollbackEnteredRoom(
    socket: StudioLiveRoomAdapterSocket,
    room: string,
    onIsolationFailure: () => void
  ): Promise<void> {
    try {
      await socket.leave(room);
    } catch {
      // A failed rollback cannot guarantee adapter isolation. The gateway owns authentication and
      // transport policy, so it supplies the fail-closed action without leaking that policy here.
      onIsolationFailure();
    }
  }
}
