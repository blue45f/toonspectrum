import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioP2pHuddleController, type HuddleDependencies } from "./studio-p2p-huddle-controller";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";

const A: StudioLiveParticipant = { sessionId: "a", displayName: "작가 A", role: "editor" };
const B: StudioLiveParticipant = { sessionId: "b", displayName: "작가 B", role: "editor" };
const C: StudioLiveParticipant = { sessionId: "c", displayName: "작가 C", role: "editor" };
const sessions: StudioP2pHuddleController[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.close()); vi.useRealTimers(); });
function track(kind: string) { return { kind, stop: vi.fn(), onended: null } as unknown as MediaStreamTrack; }
function stream(tracks: MediaStreamTrack[]) { return { getTracks: () => tracks } as MediaStream; }
function single(deps: HuddleDependencies = {}, role = A.role) {
  const send = vi.fn(() => false);
  const port: StudioLiveDirectPort = { getPeers: () => [], send, subscribe: () => () => undefined };
  const controller = new StudioP2pHuddleController({ ...A, role }, port, { createStream: stream, ...deps });
  sessions.push(controller); controller.start(); return { controller, send };
}
function pair() {
  const listeners = new Map<string, (sender: StudioLiveParticipant, raw: string) => void>();
  const packets: { from: string; raw: string }[] = [];
  let failChat = false;
  function port(self: StudioLiveParticipant, other: StudioLiveParticipant): StudioLiveDirectPort {
    return { getPeers: () => [other], subscribe: (listener) => {
      listeners.set(self.sessionId, listener); return () => { listeners.delete(self.sessionId); };
    }, send: (target, raw) => {
      packets.push({ from: self.sessionId, raw });
      if (failChat && JSON.parse(raw).kind === "chat") return false;
      listeners.get(target)?.(self, raw); return true;
    } };
  }
  const a = new StudioP2pHuddleController(A, port(A, B));
  const b = new StudioP2pHuddleController(B, port(B, A));
  sessions.push(a, b); a.start(); b.start();
  return { a, b, packets, listeners, fail: () => { failChat = true; } };
}
describe("P2P huddle consent and delivery", () => {
  it("starts text-only without requesting devices or creating media peers", () => {
    const getUserMedia = vi.fn(); const createPeerConnection = vi.fn();
    const { controller } = single({ getUserMedia, createPeerConnection });
    expect(controller.snapshot().muted).toBe(true);
    expect(controller.snapshot().localStream).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled(); expect(createPeerConnection).not.toHaveBeenCalled();
  });
  it("discovers consented peers and confirms actual reception", () => {
    const { a, b } = pair();
    expect(a.snapshot().peers).toHaveLength(1);
    expect(b.snapshot().peers).toHaveLength(1);
    expect(a.sendChat("함께 그려요")).toBe(true);
    expect(b.snapshot().messages[0]?.text).toBe("함께 그려요");
    expect(a.snapshot().messages[0]?.received).toEqual(["b"]);
  });
  it("keeps a proximity-scoped huddle limited to eligible direct peers", () => {
    let receive: ((sender: StudioLiveParticipant, raw: string) => void) | null = null;
    const send = vi.fn(() => true);
    const port: StudioLiveDirectPort = {
      getPeers: () => [B, C],
      send,
      subscribe: (listener) => { receive = listener; return () => undefined; },
    };
    const controller = new StudioP2pHuddleController(A, port, {
      peerFilter: (peer) => peer.sessionId === B.sessionId,
    });
    sessions.push(controller);
    controller.start();
    const state = (epoch: string) => JSON.stringify({
      kind: "state", epoch, muted: true, camera: false, sharing: false, hand: false,
    });
    receive?.(B, state("peer-b"));
    receive?.(C, state("peer-c"));
    controller.refreshPeers();

    expect(controller.snapshot().availablePeers).toBe(1);
    expect(controller.snapshot().peers.map((peer) => peer.participant.sessionId)).toEqual(["b"]);
    expect(send.mock.calls.every(([target]) => target === "b")).toBe(true);
  });
  it("deduplicates replays but acknowledges them again", () => {
    const { a, b, packets, listeners } = pair(); a.sendChat("한 번만");
    const raw = packets.find((p) => p.from === "a" && JSON.parse(p.raw).kind === "chat")!.raw;
    listeners.get("b")!(A, raw);
    expect(b.snapshot().messages).toHaveLength(1);
    expect(a.snapshot().messages[0]?.received).toEqual(["b"]);
  });
  it("reports transport failure instead of inventing a receipt", () => {
    const { a, b, fail } = pair(); fail();
    expect(a.sendChat("실패 확인")).toBe(false);
    expect(a.snapshot().messages[0]?.sent).toEqual([]);
    expect(a.snapshot().messages[0]?.received).toEqual([]);
    expect(b.snapshot().messages).toHaveLength(0);
  });
  it("rejects messages without a participant and limits chat bursts", () => {
    expect(single().controller.sendChat("대기")).toBe(false);
    const { a, b } = pair();
    for (let i = 0; i < 20; i++) expect(a.sendChat(`message-${i}`)).toBe(true);
    expect(a.sendChat("too fast")).toBe(false);
    expect(b.snapshot().messages).toHaveLength(20);
  });
  it("isolates old epochs and locally blocked participants", () => {
    const { a, b, packets, listeners } = pair(); a.sendChat("before");
    const packet = JSON.parse(packets.find((p) => p.from === "a" && JSON.parse(p.raw).kind === "chat")!.raw);
    listeners.get("b")!(A, JSON.stringify({ ...packet, epoch: "stale", id: "new-id" }));
    expect(b.snapshot().messages).toHaveLength(1);
    b.block("a");
    listeners.get("b")!(A, JSON.stringify({ ...packet, id: "blocked-id" }));
    expect(b.snapshot().peers).toHaveLength(0);
    expect(b.snapshot().messages).toHaveLength(1);
  });
  it("sends hand and bounded reactions over the direct lane", () => {
    const { a, b } = pair(); a.setHand(true); a.react("👍");
    expect(b.snapshot().peers[0]?.hand).toBe(true);
    expect(b.snapshot().peers[0]?.reaction).toBe("👍");
  });
  it("stops a late permission result after leaving", async () => {
    let resolve!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((done) => { resolve = done; }));
    const { controller } = single({ getUserMedia });
    const pending = controller.setMicrophone(true);
    const microphone = track("audio"); controller.close(); resolve(stream([microphone])); await pending;
    expect(microphone.stop).toHaveBeenCalledOnce();
    expect(controller.snapshot().localStream).toBeNull();
    expect(controller.snapshot().closed).toBe(true);
  });
  it("stops a late camera result after cancelling capture", async () => {
    let resolve!: (value: MediaStream) => void;
    const { controller } = single({ getUserMedia: () => new Promise((done) => { resolve = done; }) });
    const pending = controller.setVideo("camera"); await controller.setVideo(null);
    const camera = track("video"); resolve(stream([camera])); await pending;
    expect(camera.stop).toHaveBeenCalledOnce(); expect(controller.snapshot().camera).toBe(false);
  });
  it("stops the camera when replacing it with screen sharing, and releases every track", async () => {
    const microphone = track("audio"); const camera = track("video"); const screen = track("video");
    const { controller } = single({ getUserMedia: async (constraints) => stream([constraints.audio ? microphone : camera]),
      getDisplayMedia: async () => stream([screen]) });
    await controller.setMicrophone(true); await controller.setVideo("camera");
    await controller.setVideo("screen");
    expect(camera.stop).toHaveBeenCalledOnce(); expect(controller.snapshot().sharing).toBe(true);
    expect(controller.snapshot().camera).toBe(false); controller.close();
    expect(microphone.stop).toHaveBeenCalledOnce(); expect(screen.stop).toHaveBeenCalledOnce();
  });
  it("does not activate capture for a viewer or after closing", async () => {
    const getUserMedia = vi.fn();
    const { controller } = single({ getUserMedia }, "viewer");
    await controller.setMicrophone(true); await controller.setVideo("camera");
    expect(getUserMedia).not.toHaveBeenCalled();
    controller.close(); await controller.setMicrophone(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it("leaves text chat usable after permission denial", async () => {
    const { controller } = single({ getUserMedia: async () => { throw new Error("denied"); } });
    await controller.setMicrophone(true);
    expect(controller.snapshot().muted).toBe(true);
    expect(controller.snapshot().closed).toBe(false);
    expect(controller.snapshot().error).toContain("권한");
  });
  it("prefers the front camera without requiring an exact mobile device match", async () => {
    const camera = track("video");
    const getUserMedia = vi.fn(async () => stream([camera]));
    const { controller } = single({ getUserMedia });

    await controller.setVideo("camera");

    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({
        facingMode: { ideal: "user" },
      }),
      audio: false,
    });
    expect(controller.snapshot().camera).toBe(true);
  });

  it("switches mobile camera facing without overlapping video tracks", async () => {
    const front = track("video");
    const rear = track("video");
    let request = 0;
    const getUserMedia = vi.fn(async () => stream([request++ === 0 ? front : rear]));
    const { controller } = single({ getUserMedia });

    await controller.setVideo("camera", "user");
    expect(controller.snapshot().cameraFacing).toBe("user");
    expect(front.stop).not.toHaveBeenCalled();

    await controller.setVideo("camera", "environment");
    expect(front.stop).toHaveBeenCalledOnce();
    expect(rear.stop).not.toHaveBeenCalled();
    expect(controller.snapshot().cameraFacing).toBe("environment");
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 360, max: 720 },
        frameRate: { ideal: 15, max: 24 },
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
  });

  it("restarts ICE after a disconnected media link and keeps the session alive", () => {
    let inbound: ((sender: StudioLiveParticipant, raw: string) => void) | null = null;
    let connectionState: RTCPeerConnectionState = "new";
    const restartIce = vi.fn();
    const replaceTrack = vi.fn(async () => undefined);
    const peer = {
      get connectionState() { return connectionState; },
      signalingState: "stable",
      localDescription: null,
      remoteDescription: null,
      addTransceiver: vi.fn(() => ({ sender: { replaceTrack } })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      restartIce,
      close: vi.fn(),
      onicecandidate: null,
      ontrack: null,
      onnegotiationneeded: null,
      onconnectionstatechange: null,
    } as unknown as RTCPeerConnection;
    const port: StudioLiveDirectPort = {
      getPeers: () => [B],
      subscribe: (listener) => { inbound = listener; return () => { inbound = null; }; },
      send: () => true,
    };
    const controller = new StudioP2pHuddleController(A, port, {
      createPeerConnection: () => peer,
    });
    sessions.push(controller);
    controller.start();
    inbound?.(B, JSON.stringify({
      kind: "state", epoch: "epoch-b", muted: false, camera: false, sharing: false, hand: false,
    }));

    connectionState = "disconnected";
    peer.onconnectionstatechange?.(new Event("connectionstatechange"));

    expect(restartIce).toHaveBeenCalledOnce();
    expect(controller.snapshot().closed).toBe(false);
    expect(controller.snapshot().error).toContain("복구");
  });

  it("creates media peer connections only for the current proximity scope", () => {
    let inbound: ((sender: StudioLiveParticipant, raw: string) => void) | null = null;
    const close = vi.fn();
    const replaceTrack = vi.fn(async () => undefined);
    const peer = {
      connectionState: "new",
      signalingState: "stable",
      localDescription: null,
      remoteDescription: null,
      addTransceiver: vi.fn(() => ({ sender: { replaceTrack } })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      close,
      onicecandidate: null,
      ontrack: null,
      onnegotiationneeded: null,
      onconnectionstatechange: null,
    } as unknown as RTCPeerConnection;
    const createPeerConnection = vi.fn(() => peer);
    const port: StudioLiveDirectPort = {
      getPeers: () => [B],
      subscribe: (listener) => { inbound = listener; return () => { inbound = null; }; },
      send: () => true,
    };
    const controller = new StudioP2pHuddleController(A, port, { createPeerConnection });
    sessions.push(controller);
    controller.start();
    controller.setMediaPeerScope([]);
    inbound?.(B, JSON.stringify({
      kind: "state", epoch: "epoch-b", muted: false, camera: false, sharing: false, hand: false,
    }));
    expect(createPeerConnection).not.toHaveBeenCalled();

    controller.setMediaPeerScope(["b"]);
    expect(createPeerConnection).toHaveBeenCalledOnce();

    controller.setMediaPeerScope([]);
    expect(close).toHaveBeenCalledOnce();
    expect(controller.snapshot().peers[0]?.connection).toBe("idle");
  });
});
