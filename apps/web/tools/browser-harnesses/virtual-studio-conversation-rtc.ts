import { StudioP2pCreativeHuddleController } from "../../src/domains/creator/live/huddle/studio-p2p-creative-huddle-controller";
import { StudioVirtualConversationController, type StudioConversationScope } from "../../src/domains/creator/virtual-space/studio-virtual-space-conversation";

import type { StudioLiveParticipant } from "../../src/domains/creator/live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../src/domains/creator/live/studio-live-direct-port";

/** Dev QA only: five logical identities in one browser, native RTC, no production admission or device capture. */
export async function verifyNativeFourPersonConversation() {
  const peers: StudioLiveParticipant[] = ["a", "b", "c", "d", "outsider"].map((id) => ({ sessionId: `rtc-${id}`, displayName: id, role: "editor" }));
  const pcs: RTCPeerConnection[] = [], mediaPcs: RTCPeerConnection[] = [];
  const channels = peers.map(() => new Map<string, RTCDataChannel>());
  const listeners = peers.map(() => new Set<(sender: StudioLiveParticipant, raw: string) => void>());
  const ready = new Map<string, StudioConversationScope>();
  const huddles = new Map<string, StudioP2pCreativeHuddleController>();
  const conversations: StudioVirtualConversationController[] = [];
  const streams: MediaStream[] = [];
  const draws: ReturnType<typeof setInterval>[] = [];
  let captureCalls = 0, packets = 0;
  const require = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
  const until = async (check: () => boolean, label: string, ms = 12_000) => {
    const deadline = performance.now() + ms;
    while (!check()) { if (performance.now() > deadline) throw new Error(`RTC QA timed out: ${label}`); await new Promise((done) => setTimeout(done, 30)); }
  };
  const ports: StudioLiveDirectPort[] = peers.map((_, index) => ({
    getPeers: () => peers.filter((peer) => channels[index]!.get(peer.sessionId)?.readyState === "open"),
    send: (target, raw) => {
      const channel = channels[index]!.get(target);
      if (channel?.readyState !== "open" || channel.bufferedAmount > 131_072) return false;
      ++packets; channel.send(raw); return true;
    },
    subscribe: (listener) => { listeners[index]!.add(listener); return () => { listeners[index]!.delete(listener); }; },
  }));
  const register = (index: number, other: number, channel: RTCDataChannel) => {
    channels[index]!.set(peers[other]!.sessionId, channel);
    channel.onmessage = (event: MessageEvent<string>) => { for (const listener of listeners[index]!) listener(peers[other]!, event.data); };
  };
  try {
    for (let i = 0; i < peers.length; ++i) for (let j = i + 1; j < peers.length; ++j) {
      const a = new RTCPeerConnection({ iceServers: [] }), b = new RTCPeerConnection({ iceServers: [] }); pcs.push(a, b);
      a.onicecandidate = (event) => { if (event.candidate) void b.addIceCandidate(event.candidate); };
      b.onicecandidate = (event) => { if (event.candidate) void a.addIceCandidate(event.candidate); };
      register(i, j, a.createDataChannel("scoped-control", { ordered: true }));
      b.ondatachannel = (event) => register(j, i, event.channel);
      await a.setLocalDescription(await a.createOffer()); await b.setRemoteDescription(a.localDescription!);
      await b.setLocalDescription(await b.createAnswer()); await a.setRemoteDescription(b.localDescription!);
    }
    await until(() => channels.every((map) => map.size === 4 && [...map.values()].every((channel) => channel.readyState === "open")), "control mesh");
    for (const [index, peer] of peers.entries()) {
      const controller = new StudioVirtualConversationController(peer, ports[index]!, { worldId: "qa-world", contentRevision: "a".repeat(64) }, {
        onReady: (scope) => ready.set(peer.sessionId, scope),
        onClosed: () => huddles.get(peer.sessionId)?.close(),
      });
      conversations.push(controller); controller.start();
    }
    await until(() => conversations.every((controller) => controller.snapshot().readyPeers.length === 4), "identity handshakes");
    const members = peers.slice(0, 4).map((peer) => peer.sessionId).sort();
    const id = conversations[0]!.propose(members); require(id, "proposal was not created");
    await until(() => conversations.slice(1, 4).every((controller) => controller.snapshot().records.some((record) => record.id === id)), "proposal delivery");
    require(ready.size === 0 && captureCalls === 0, "proposal started a session without consent");
    for (const controller of conversations.slice(1, 4)) require(controller.respond(id!, "accept"), "explicit acceptance failed");
    await until(() => ready.size === 4, "all four accepted the exact roster");
    require(conversations[4]!.snapshot().records.length === 0, "outsider received a private roster");
    require([...ready.values()].every((scope) => scope.id === id && JSON.stringify(scope.memberIds) === JSON.stringify(members)), "members disagreed");
    for (const [index, peer] of peers.slice(0, 4).entries()) {
      const huddle = new StudioP2pCreativeHuddleController(peer, ports[index]!, {
        conversation: { id: id!, peerIds: members.filter((member) => member !== peer.sessionId) },
        createPeerConnection: () => { const pc = new RTCPeerConnection({ iceServers: [] }); mediaPcs.push(pc); return pc; },
        getUserMedia: async () => {
          ++captureCalls;
          const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
          const ctx = canvas.getContext("2d")!; ctx.fillStyle = ["#a33", "#3a3", "#33a", "#aa3"][index]!; ctx.fillRect(0, 0, 96, 64);
          let frame = 0; draws.push(setInterval(() => { ctx.fillStyle = ++frame % 2 ? "#fff" : "#111"; ctx.fillRect(4, 4, 8, 8); }, 200));
          const stream = canvas.captureStream(5); streams.push(stream); return stream;
        },
      });
      huddles.set(peer.sessionId, huddle); huddle.start();
    }
    await until(() => [...huddles.values()].every((huddle) => huddle.snapshot().peers.length === 3), "four-member media scope");
    require(captureCalls === 0, "starting the media panel requested capture");
    const beforeOutsider = mediaPcs.length;
    ports[4]!.send(peers[0]!.sessionId, JSON.stringify({ kind: "state", epoch: "outsider-epoch", muted: false, camera: true, sharing: false, hand: false, conversationId: id, memberIds: members }));
    await new Promise((done) => setTimeout(done, 100));
    require(mediaPcs.length === beforeOutsider, "outsider created a media connection");
    // Four explicit test operations supply generated canvas video; physical device APIs are never called.
    await Promise.all([...huddles.values()].map((huddle) => huddle.setVideo("camera")));
    await until(() => [...huddles.values()].every((huddle) => huddle.snapshot().peers.every((peer) => peer.stream?.getVideoTracks().length === 1)), "four native video streams");
    require(mediaPcs.length === 12, `expected twelve native peer connections, got ${mediaPcs.length}`);
    require(captureCalls === 4, "capture count must match the four explicit operations");
    let decodedFrames = 0, decodedDirections = 0;
    await until(() => mediaPcs.every((pc) => pc.connectionState === "connected"), "native media connectivity");
    await new Promise((done) => setTimeout(done, 1_000));
    for (const pc of mediaPcs) {
      let frames = 0;
      (await pc.getStats()).forEach((stat) => { if (stat.type === "inbound-rtp" && stat.kind === "video") frames += Number(stat.framesDecoded ?? 0); });
      decodedFrames += frames; if (frames > 0) ++decodedDirections;
    }
    require(decodedDirections === 12, `only ${decodedDirections} of twelve video directions decoded frames`);
    const remoteTracks = [...huddles.values()].flatMap((huddle) => huddle.snapshot().peers.flatMap((peer) => peer.stream?.getTracks() ?? []));
    conversations[3]!.leave(id!);
    await until(() => [...huddles.values()].every((huddle) => huddle.snapshot().closed), "member leave cleanup");
    require(mediaPcs.every((pc) => pc.connectionState === "closed"), "media connection survived leave");
    require(remoteTracks.every((track) => track.readyState === "ended"), "remote video survived leave");
    require(streams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")), "local video survived leave");
    return { logicalParticipants: 5, consentedMembers: members, privateRosterRecipients: 4, nativeControlLinks: 10, nativeMediaLinks: 6,
      outsiderMediaLinks: 0, captureBeforeExplicitAction: 0, generatedCanvasVideoSources: captureCalls, decodedFrames, decodedDirections, stoppedRemoteTracks: remoteTracks.length, packets,
      allMediaClosed: true, physicalDeviceCapture: false, productionAdmission: false, network: "one Chromium process, loopback ICE, no STUN/TURN" };
  } finally {
    for (const timer of draws) clearInterval(timer);
    for (const controller of conversations) controller.close();
    for (const huddle of huddles.values()) huddle.close();
    for (const stream of streams) for (const track of stream.getTracks()) track.stop();
    for (const pc of [...mediaPcs, ...pcs]) pc.close();
  }
}
