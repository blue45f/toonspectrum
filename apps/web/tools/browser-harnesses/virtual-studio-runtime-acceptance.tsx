import { StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { StudioVirtualSpaceEngineBridge } from "../../src/domains/creator/virtual-space/studio-virtual-space-engine-bridge";
import { studioVirtualSpaceState, type StudioVirtualSpacePoint } from "../../src/domains/creator/virtual-space/studio-virtual-space-model";
import { StudioVirtualSpacePresenceController } from "../../src/domains/creator/virtual-space/studio-virtual-space-presence";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldPresenceState, type StudioVirtualSpaceWorldManifest } from "../../src/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import { StudioVirtualSpaceJoystick } from "../../src/domains/creator/virtual-space/StudioVirtualSpaceJoystick";
import { StudioVirtualSpacePhaserCanvas } from "../../src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas";

import type { StudioLiveParticipant } from "../../src/domains/creator/live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../src/domains/creator/live/studio-live-direct-port";
import "../../src/styles/globals.css";
import "../../src/domains/creator/virtual-space/studio-virtual-space.css";

/** Dev-only harness: real RTCDataChannels with in-page offer/answer, not production admission/signaling. */
const A: StudioLiveParticipant = { sessionId: "qa-local", displayName: "Local creator", role: "editor" };
const B: StudioLiveParticipant = { sessionId: "qa-peer", displayName: "RTC creator", role: "editor" };
const emptyPort: StudioLiveDirectPort = { getPeers: () => [], send: () => false, subscribe: () => () => undefined };
let root: Root | null = null;
let bridge = new StudioVirtualSpaceEngineBridge();
let controller = new StudioVirtualSpacePresenceController(A, emptyPort, { x: 425, y: 680 });
let remote: StudioVirtualSpacePresenceController | null = null;
let disposeRtc: (() => void) | null = null;
let currentWorld = DEFAULT_STUDIO_WORLD_MANIFEST;
const events: string[] = [];
let packets = 0;
let localPackets = 0;
let remotePackets = 0;
let publishes = 0;

function Harness() {
  const [snapshot, setSnapshot] = useState(() => controller.snapshot());
  useEffect(() => controller.subscribe(() => setSnapshot(controller.snapshot())), []);
  return <>
    <div style={{ position: "relative", width: "100%", height: "75vh", minHeight: 480 }}>
      <StudioVirtualSpacePhaserCanvas manifest={currentWorld} bridge={bridge} snapshot={snapshot} selfIdentity={A.sessionId} renderer="canvas"
        onLocalState={(state) => {
          publishes++;
          controller.update(state.point, state.facing, controller.snapshot().self.activity, state.moving, controller.snapshot().self.avatarIndex, state.zoneId);
        }}
        onInteract={(interaction) => events.push(`interact:${interaction?.id ?? "room"}`)}
        onPeerSelect={(id) => events.push(`peer:${id}`)}
        onCancelFollow={() => bridge.setFollowingPeer(null)}
        onPortal={(portal) => events.push(`portal:${portal.id}`)} />
      <div style={{ position: "absolute", bottom: 18, right: 18, zIndex: 10 }}>
        <StudioVirtualSpaceJoystick onVectorChange={(vector) => bridge.setJoystick(vector)} />
      </div>
    </div>
    <label>Chat draft <input id="chat-draft" aria-label="Chat draft" /></label>
    <button id="stop" type="button" onClick={() => bridge.clearMovement()}>Stop</button>
  </>;
}

export function cleanup(): void {
  root?.unmount(); root = null; controller.close(); remote?.close(); remote = null;
  disposeRtc?.(); disposeRtc = null;
}

export function mount(world?: StudioVirtualSpaceWorldManifest, point = { x: 425, y: 680 }): void {
  cleanup(); currentWorld = world ?? DEFAULT_STUDIO_WORLD_MANIFEST;
  events.length = 0; publishes = 0; packets = 0; localPackets = 0; remotePackets = 0;
  bridge = new StudioVirtualSpaceEngineBridge();
  const self = studioWorldPresenceState(currentWorld, { ...studioVirtualSpaceState(point), ...point, avatarIndex: 0 });
  controller = new StudioVirtualSpacePresenceController(A, emptyPort, self);
  const host = document.getElementById("test-root");
  if (!host) throw new Error("Fixture root is missing");
  root = createRoot(host); root.render(<StrictMode><Harness /></StrictMode>);
}

export function state() {
  return {
    snapshot: controller.snapshot(),
    events: [...events],
    publishes,
    packets,
    localPackets,
    remotePackets,
    rtcConnected: Boolean(remote),
    world: currentWorld,
  };
}
export function move(point: StudioVirtualSpacePoint) { bridge.requestMove(point); }
export function stop() { bridge.clearMovement(); }
export function follow() { bridge.setFollowingPeer(B.sessionId); }
export function movePeer(point: StudioVirtualSpacePoint, moving = true) { remote?.update(point, "right", "available", moving, 1, "lounge"); }
export function reactPeer() { remote?.sendReaction("heart"); }
export function setAvatar(index: number) { controller.setAvatarIndex(index); }
export function setActivity(activity: "focused" | "reviewing" | "available") { controller.setActivity(activity); }
export function reactSelf() { controller.sendReaction("wave"); }

export async function connectRtcPeer(): Promise<void> {
  const rtcA = new RTCPeerConnection({ iceServers: [] });
  const rtcB = new RTCPeerConnection({ iceServers: [] });
  rtcA.onicecandidate = (event) => { if (event.candidate) void rtcB.addIceCandidate(event.candidate).catch(() => undefined); };
  rtcB.onicecandidate = (event) => { if (event.candidate) void rtcA.addIceCandidate(event.candidate).catch(() => undefined); };
  const aChannel = rtcA.createDataChannel("spatial-presence", { ordered: false, maxRetransmits: 0 });
  const remoteChannel = new Promise<RTCDataChannel>((resolve) => { rtcB.ondatachannel = (event) => resolve(event.channel); });
  await rtcA.setLocalDescription(await rtcA.createOffer());
  await rtcB.setRemoteDescription(rtcA.localDescription!);
  await rtcB.setLocalDescription(await rtcB.createAnswer());
  await rtcA.setRemoteDescription(rtcB.localDescription!);
  const bChannel = await remoteChannel;
  const waitOpen = (channel: RTCDataChannel) => new Promise<void>((resolve, reject) => {
    if (channel.readyState === "open") { resolve(); return; }
    const timer = setTimeout(() => reject(new Error("RTC channel open timeout")), 8000);
    channel.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  await Promise.all([waitOpen(aChannel), waitOpen(bChannel)]);
  const port = (
    channel: RTCDataChannel,
    peer: StudioLiveParticipant,
    source: "local" | "remote",
  ): StudioLiveDirectPort => ({
    getPeers: () => channel.readyState === "open" ? [peer] : [],
    send: (id, payload) => {
      if (id !== peer.sessionId || channel.readyState !== "open" || channel.bufferedAmount > 131072) return false;
      packets++;
      if (source === "local") localPackets++;
      else remotePackets++;
      channel.send(payload);
      return true;
    },
    subscribe: (listener) => {
      const receive = (event: MessageEvent<string>) => listener(peer, event.data);
      channel.addEventListener("message", receive);
      return () => channel.removeEventListener("message", receive);
    },
  });
  const self = controller.snapshot().self;
  root?.unmount(); root = null; controller.close();
  controller = new StudioVirtualSpacePresenceController(A, port(aChannel, B, "local"), self);
  remote = new StudioVirtualSpacePresenceController(B, port(bChannel, A, "remote"), { x: self.x + 45, y: self.y });
  remote.setAvatarIndex(1);
  disposeRtc = () => { aChannel.close(); bChannel.close(); rtcA.close(); rtcB.close(); };
  controller.start(); remote.start(); controller.refresh(); remote.refresh();
  const host = document.getElementById("test-root")!;
  root = createRoot(host); root.render(<StrictMode><Harness /></StrictMode>);
}

mount();
