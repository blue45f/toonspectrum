import { describe, expect, it, vi } from "vitest";
import { StudioP2pCreativeHuddleController } from "../live/huddle/studio-p2p-creative-huddle-controller";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";

const participants: StudioLiveParticipant[] = ["a", "b", "c", "d", "e"].map((sessionId) => ({ sessionId, displayName: sessionId.toUpperCase(), role: "editor" }));
const stream = (tracks: MediaStreamTrack[]) => ({ getTracks: () => tracks }) as MediaStream;
const track = (kind: string) => ({ kind, stop: vi.fn() }) as unknown as MediaStreamTrack;

describe("four-person conversation applied to the real creative Huddle", () => {
  it("keeps outsider connections and tracks at zero, accepts exactly the consented roster, and stops all media on leave", async () => {
    const inbound = new Set<(sender: StudioLiveParticipant, raw: string) => void>();
    const send = vi.fn((_target: string, _raw: string) => true);
    const connections: RTCPeerConnection[] = [];
    const createPeerConnection = vi.fn(() => {
      const connection = { connectionState: "new", signalingState: "stable", localDescription: null, remoteDescription: null,
        addTransceiver: vi.fn(() => ({ sender: { replaceTrack: vi.fn(async () => undefined) } })),
        setLocalDescription: vi.fn(async () => undefined), setRemoteDescription: vi.fn(async () => undefined), addIceCandidate: vi.fn(async () => undefined),
        close: vi.fn(), ontrack: null, onicecandidate: null, onnegotiationneeded: null, onconnectionstatechange: null } as unknown as RTCPeerConnection;
      connections.push(connection); return connection;
    });
    const microphone = track("audio"); const getUserMedia = vi.fn(async () => stream([microphone]));
    const controller = new StudioP2pCreativeHuddleController(participants[0]!, {
      getPeers: () => participants.slice(1), send,
      subscribe: (listener) => { inbound.add(listener); return () => { inbound.delete(listener); }; },
    }, { conversation: { id: "consented-four", peerIds: ["b", "c", "d"] }, createPeerConnection, getUserMedia, createStream: stream, id: () => "local-epoch" });
    const receive = (sender: StudioLiveParticipant, packet: object) => { for (const listener of inbound) listener(sender, JSON.stringify(packet)); };
    const state = (id: string, members = ["a", "b", "c", "d"]) => ({ kind: "state", epoch: `epoch-${id}`, muted: false, camera: true, sharing: false, hand: false,
      conversationId: "consented-four", memberIds: members });
    try {
      controller.start();
      expect(getUserMedia).not.toHaveBeenCalled(); expect(createPeerConnection).not.toHaveBeenCalled();
      receive(participants[4]!, state("e"));
      receive(participants[1]!, state("b", ["a", "b", "c", "e"]));
      receive(participants[4]!, { ...state("e"), kind: "description", toEpoch: "local-epoch", type: "offer", sdp: "outsider" });
      expect(createPeerConnection).not.toHaveBeenCalled();
      for (const participant of participants.slice(1, 4)) receive(participant, state(participant.sessionId));
      expect(createPeerConnection).toHaveBeenCalledTimes(3);
      expect(controller.snapshot().peers.map((peer) => peer.participant.sessionId)).toEqual(["b", "c", "d"]);
      await controller.setMicrophone(true);
      expect(getUserMedia).toHaveBeenCalledOnce();
      const remoteTracks = connections.map((connection) => {
        const remote = track("audio"); connection.ontrack?.({ track: remote, streams: [stream([remote])] } as unknown as RTCTrackEvent); return remote;
      });
      controller.setMediaPeerScope(["b", "c", "d", "e"]); receive(participants[4]!, state("e"));
      expect(createPeerConnection).toHaveBeenCalledTimes(3);
      expect(send.mock.calls.every((call) => ["b", "c", "d"].includes(String(call[0])))).toBe(true);
      controller.close();
      expect(microphone.stop).toHaveBeenCalledOnce();
      for (const remote of remoteTracks) expect(remote.stop).toHaveBeenCalled();
      for (const connection of connections) expect(connection.close).toHaveBeenCalled();
      expect(inbound.size).toBe(0);
    } finally { controller.close(); }
  });
});
