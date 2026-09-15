import {
  STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH,
  STUDIO_LIVE_SDP_MAX_LENGTH,
  STUDIO_LIVE_SDP_MID_MAX_LENGTH,
  STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
  createStudioLiveEnvelope,
  type StudioLiveParticipant,
  type StudioLiveWebRtcIcePayload,
} from "./studio-live-collaboration-protocol";
import type {
  StudioLivePeer,
  StudioLiveRoomEvent,
  StudioLiveSignalEnvelope,
} from "./studio-live-collaboration-room";
import type { StudioPeerFabricEvent, StudioPeerFabricPort } from "./studio-peer-fabric";
import type {
  StudioRemoteScreenShare,
  StudioScreenShareRoom,
} from "../studio-screen-share";

export const STUDIO_PEER_SCREEN_SIGNAL_WIRE = "studio-peer-screen-signal-v2" as const;

type StudioPeerScreenSignalPacket =
  | {
      readonly wire: typeof STUDIO_PEER_SCREEN_SIGNAL_WIRE;
      readonly workId: string;
      readonly targetSessionId: string;
      readonly type: "description";
      readonly shareId: string;
      readonly descriptionType: "offer" | "answer";
      readonly sdp: string;
    }
  | {
      readonly wire: typeof STUDIO_PEER_SCREEN_SIGNAL_WIRE;
      readonly workId: string;
      readonly targetSessionId: string;
      readonly type: "ice";
      readonly shareId: string;
      readonly candidate: string;
      readonly sdpMid: string | null;
      readonly sdpMLineIndex: number | null;
      readonly usernameFragment: string | null;
    };

export interface StudioPeerScreenSignalingRoom extends StudioScreenShareRoom {
  closePeerSignaling(): void;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableBounded(value: unknown, maximum: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maximum);
}

function parsePacket(value: unknown): StudioPeerScreenSignalPacket | null {
  if (!isRecord(value)
    || value.wire !== STUDIO_PEER_SCREEN_SIGNAL_WIRE
    || typeof value.workId !== "string" || !ID_PATTERN.test(value.workId)
    || typeof value.targetSessionId !== "string" || !ID_PATTERN.test(value.targetSessionId)
    || typeof value.shareId !== "string" || !ID_PATTERN.test(value.shareId)) return null;
  if (value.type === "description") {
    return Object.keys(value).length === 7
      && (value.descriptionType === "offer" || value.descriptionType === "answer")
      && typeof value.sdp === "string" && value.sdp.length > 0
      && value.sdp.length <= STUDIO_LIVE_SDP_MAX_LENGTH
      ? {
          wire: STUDIO_PEER_SCREEN_SIGNAL_WIRE,
          workId: value.workId,
          targetSessionId: value.targetSessionId,
          type: "description",
          shareId: value.shareId,
          descriptionType: value.descriptionType,
          sdp: value.sdp,
        }
      : null;
  }
  if (value.type === "ice") {
    if (Object.keys(value).length !== 9
      || typeof value.candidate !== "string" || value.candidate.length < 1
      || value.candidate.length > STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH
      || !nullableBounded(value.sdpMid, STUDIO_LIVE_SDP_MID_MAX_LENGTH)
      || !(value.sdpMLineIndex === null
        || (Number.isInteger(value.sdpMLineIndex)
          && Number(value.sdpMLineIndex) >= 0
          && Number(value.sdpMLineIndex) <= 65_535))
      || !nullableBounded(value.usernameFragment, STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH)) return null;
    return {
      wire: STUDIO_PEER_SCREEN_SIGNAL_WIRE,
      workId: value.workId,
      targetSessionId: value.targetSessionId,
      type: "ice",
      shareId: value.shareId,
      candidate: value.candidate,
      sdpMid: value.sdpMid,
      sdpMLineIndex: value.sdpMLineIndex === null ? null : Number(value.sdpMLineIndex),
      usernameFragment: value.usernameFragment,
    };
  }
  return null;
}

function approvalKey(sessionId: string, shareId: string): string {
  return `${sessionId}\u0000${shareId}`;
}

export class StudioPeerScreenSignalingRoomAdapter implements StudioPeerScreenSignalingRoom {
  readonly participant: StudioLiveParticipant;
  private readonly listeners = new Set<(event: StudioLiveRoomEvent) => void>();
  private readonly approvals = new Set<string>();
  private readonly unsubscribeRoom: () => void;
  private readonly unsubscribeFabric: () => void;
  private sequence = 0;
  private closed = false;

  constructor(
    private readonly room: StudioScreenShareRoom,
    private readonly fabric: StudioPeerFabricPort,
    private readonly workId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!ID_PATTERN.test(workId)) throw new TypeError("화면 공유 P2P work ID가 올바르지 않습니다.");
    this.participant = room.participant;
    this.unsubscribeRoom = room.subscribe((event) => this.receiveRoom(event));
    this.unsubscribeFabric = fabric.subscribe("screen-signal-v2", (event) => {
      this.receivePeer(event);
    });
  }

  subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPeers(): StudioLivePeer[] {
    return this.room.getPeers();
  }

  getScreenShares(): StudioRemoteScreenShare[] {
    return this.room.getScreenShares?.() ?? [];
  }

  announceScreen(payload: { shareId: string; label: string }): boolean {
    return this.room.announceScreen(payload);
  }

  requestScreen(targetSessionId: string, payload: { shareId: string }): boolean {
    return this.room.requestScreen(targetSessionId, payload);
  }

  respondScreen(
    targetSessionId: string,
    payload: { shareId: string; decision: "approved" | "rejected" | "ended" },
  ): boolean {
    const sent = this.room.respondScreen(targetSessionId, payload);
    if (!sent) return false;
    const key = approvalKey(targetSessionId, payload.shareId);
    if (payload.decision === "approved") this.approvals.add(key);
    else this.approvals.delete(key);
    return true;
  }

  sendWebRtcDescription(
    targetSessionId: string,
    payload: { shareId: string; type: "offer" | "answer"; sdp: string },
  ): boolean {
    const packet: StudioPeerScreenSignalPacket = {
      wire: STUDIO_PEER_SCREEN_SIGNAL_WIRE,
      workId: this.workId,
      targetSessionId,
      type: "description",
      shareId: payload.shareId,
      descriptionType: payload.type,
      sdp: payload.sdp,
    };
    if (this.canSendDirect(targetSessionId, payload.shareId)
      && parsePacket(packet)
      && this.fabric.send(targetSessionId, "screen-signal-v2", JSON.stringify(packet), {
        trafficClass: "control",
        ttlMs: 30_000,
      })) return true;
    return this.room.sendWebRtcDescription(targetSessionId, payload);
  }

  sendWebRtcIce(
    targetSessionId: string,
    payload: StudioLiveWebRtcIcePayload,
  ): boolean {
    const packet: StudioPeerScreenSignalPacket = {
      wire: STUDIO_PEER_SCREEN_SIGNAL_WIRE,
      workId: this.workId,
      targetSessionId,
      type: "ice",
      shareId: payload.shareId,
      candidate: payload.candidate,
      sdpMid: payload.sdpMid ?? null,
      sdpMLineIndex: payload.sdpMLineIndex ?? null,
      usernameFragment: payload.usernameFragment ?? null,
    };
    if (this.canSendDirect(targetSessionId, payload.shareId)
      && parsePacket(packet)
      && this.fabric.send(targetSessionId, "screen-signal-v2", JSON.stringify(packet), {
        trafficClass: "control",
        ttlMs: 30_000,
      })) return true;
    return this.room.sendWebRtcIce(targetSessionId, payload);
  }

  stopScreen(payload: { shareId: string }): boolean {
    for (const key of [...this.approvals]) {
      if (key.endsWith(`\u0000${payload.shareId}`)) this.approvals.delete(key);
    }
    return this.room.stopScreen(payload);
  }

  closePeerSignaling(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeRoom();
    this.unsubscribeFabric();
    this.listeners.clear();
    this.approvals.clear();
  }

  private canSendDirect(targetSessionId: string, shareId: string): boolean {
    return this.approvals.has(approvalKey(targetSessionId, shareId))
      && this.fabric.getPeers("screen-signal-v2").some(
        (peer) => peer.sessionId === targetSessionId,
      );
  }

  private receiveRoom(event: StudioLiveRoomEvent): void {
    if (this.closed) return;
    if (event.type === "signal") this.observePrimarySignal(event.envelope);
    if (event.type === "presence") {
      const active = new Set(event.peers.map((peer) => peer.sessionId));
      for (const key of [...this.approvals]) {
        const sessionId = key.slice(0, key.indexOf("\u0000"));
        if (!active.has(sessionId)) this.approvals.delete(key);
      }
    }
    this.emit(event);
  }

  private observePrimarySignal(envelope: StudioLiveSignalEnvelope): void {
    const key = approvalKey(envelope.sender.sessionId, envelope.payload.shareId);
    if (envelope.kind === "screen:access") {
      if (envelope.payload.decision === "approved") this.approvals.add(key);
      else this.approvals.delete(key);
    } else if (envelope.kind === "screen:stop") {
      this.approvals.delete(key);
    }
  }

  private receivePeer(event: StudioPeerFabricEvent): void {
    if (this.closed) return;
    let candidate: unknown;
    try {
      candidate = JSON.parse(event.payload) as unknown;
    } catch {
      return;
    }
    const packet = parsePacket(candidate);
    if (!packet || packet.workId !== this.workId
      || packet.targetSessionId !== this.participant.sessionId
      || !this.approvals.has(approvalKey(event.sender.sessionId, packet.shareId))) return;
    try {
      const envelope = packet.type === "description"
        ? createStudioLiveEnvelope({
            workId: this.workId,
            sender: event.sender,
            sentAt: this.now(),
            sequence: ++this.sequence,
            kind: "webrtc:description",
            targetSessionId: this.participant.sessionId,
            payload: {
              shareId: packet.shareId,
              type: packet.descriptionType,
              sdp: packet.sdp,
            },
          })
        : createStudioLiveEnvelope({
            workId: this.workId,
            sender: event.sender,
            sentAt: this.now(),
            sequence: ++this.sequence,
            kind: "webrtc:ice",
            targetSessionId: this.participant.sessionId,
            payload: {
              shareId: packet.shareId,
              candidate: packet.candidate,
              sdpMid: packet.sdpMid,
              sdpMLineIndex: packet.sdpMLineIndex,
              usernameFragment: packet.usernameFragment,
            },
          });
      this.emit({ type: "signal", envelope });
    } catch {
      // The collaboration protocol remains the final validation boundary.
    }
  }

  private emit(event: StudioLiveRoomEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Screen observers never own either transport.
      }
    }
  }
}

export function createStudioPeerScreenSignalingRoom(
  room: StudioScreenShareRoom,
  fabric: StudioPeerFabricPort,
  workId: string,
  now: () => number = Date.now,
): StudioPeerScreenSignalingRoom {
  return new StudioPeerScreenSignalingRoomAdapter(room, fabric, workId, now);
}
