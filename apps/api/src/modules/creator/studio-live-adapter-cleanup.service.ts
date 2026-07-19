import { Injectable } from "@nestjs/common";

export interface StudioLiveCleanupSocket {
  leave(room: string): void | Promise<void>;
  disconnect(close?: boolean): void;
}

interface StudioLiveCloseRoomInput {
  readonly socket: StudioLiveCleanupSocket | undefined;
  readonly room: string;
  readonly finalizeLocalState: () => void;
}

/**
 * Starts best-effort adapter cleanup, commits caller-owned local cleanup synchronously, and closes
 * the transport without ever waiting for the adapter. Participant and public revocation policy
 * deliberately remain in the gateway callback.
 */
@Injectable()
export class StudioLiveAdapterCleanupService {
  closeRoomTransport(input: StudioLiveCloseRoomInput): void {
    if (input.socket) this.startRoomLeaveBestEffort(input.socket, input.room);
    try {
      input.finalizeLocalState();
    } finally {
      input.socket?.disconnect(true);
    }
  }

  private startRoomLeaveBestEffort(
    socket: StudioLiveCleanupSocket,
    room: string
  ): void {
    try {
      const leaveResult = socket.leave(room);
      if (leaveResult) void Promise.resolve(leaveResult).catch(() => undefined);
    } catch {
      // Local cleanup plus transport closure are the authoritative fail-closed boundary.
    }
  }
}
