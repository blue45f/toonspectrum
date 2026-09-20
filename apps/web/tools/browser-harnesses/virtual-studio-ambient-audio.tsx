import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { studioHuddleAudioFocusSnapshot } from "../../src/domains/creator/live/huddle/studio-p2p-huddle-audio-focus";
import StudioP2pHuddleLauncher from "../../src/domains/creator/live/huddle/StudioP2pHuddleLauncher";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "../../src/domains/creator/live/studio-live-collaboration-context";
import { StudioVirtualSpaceAmbientAudio } from "../../src/domains/creator/virtual-space/StudioVirtualSpaceAmbientAudio";

import type { StudioLiveRoom } from "../../src/domains/creator/live/studio-live-collaboration-room";

import "../../src/styles/globals.css";

if (!import.meta.env.DEV) throw new Error("Ambient acceptance is development-only");
// Actual Web Audio decode/graph/playback and Huddle controller, with an empty synthetic room.
// The instrumentation observes local audio ownership; it never supplies an audio fixture.
const telemetry = { contexts: [] as AudioContext[], buffers: [] as AudioBuffer[], gains: [] as GainNode[], started: 0, stopped: 0, captures: 0, streamDestinations: 0, loops: [] as boolean[], lifecycle: [] as { event: string; hidden: boolean; huddle: boolean; phase: string | undefined }[] };
const NativeAudioContext = window.AudioContext;
window.AudioContext = class extends NativeAudioContext {
  constructor(options?: AudioContextOptions) { super(options); telemetry.contexts.push(this); }
  createBufferSource(): AudioBufferSourceNode {
    const node = super.createBufferSource(), start = node.start.bind(node), stop = node.stop.bind(node);
    node.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => { telemetry.started++; telemetry.loops.push(node.loop); if (node.buffer) telemetry.buffers.push(node.buffer); start(...args); };
    node.stop = (...args: Parameters<AudioBufferSourceNode["stop"]>) => { telemetry.stopped++; stop(...args); };
    return node;
  }
  createGain(): GainNode { const gain = super.createGain(); telemetry.gains.push(gain); return gain; }
  createMediaStreamDestination(): MediaStreamAudioDestinationNode { telemetry.streamDestinations++; throw new Error("Ambient must not create a capture destination"); }
};
Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => { telemetry.captures++; return Promise.reject(new Error("No device consent in this fixture")); } } });
for (const event of ["blur", "focus", "visibilitychange"]) {
  (event === "visibilitychange" ? document : window).addEventListener(event, () => {
    setTimeout(() => telemetry.lifecycle.push({ event, hidden: document.hidden, huddle: studioHuddleAudioFocusSnapshot(), phase: document.querySelector<HTMLElement>("[data-ambient-phase]")?.dataset.ambientPhase }), 50);
  });
}
Object.assign(window, { ambientAudioQA: () => ({
  contexts: telemetry.contexts.map((context) => ({ state: context.state, time: context.currentTime })),
  decoded: telemetry.buffers.map((buffer) => ({ duration: buffer.duration, channels: buffer.numberOfChannels,
    seamJump: Math.max(...Array.from({ length: buffer.numberOfChannels }, (_, channel) => { const pcm = buffer.getChannelData(channel); return Math.abs(pcm[0] - pcm[pcm.length - 1]); })) })),
  gain: telemetry.gains.at(-1)?.gain.value ?? null, started: telemetry.started, stopped: telemetry.stopped,
  captures: telemetry.captures, streamDestinations: telemetry.streamDestinations, huddle: studioHuddleAudioFocusSnapshot(),
  loops: telemetry.loops, lifecycle: telemetry.lifecycle,
  audioRequests: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/ambient-audio/")).length,
}) });
const room = { workId: "ambient-fixture", ready: true, participant: { sessionId: "fixture-self", role: "editor", displayName: "Ambient QA" },
  direct: { getPeers: () => [], send: () => false, subscribe: () => () => undefined },
  subscribe: () => () => undefined, subscribeVoice: () => () => undefined,
} as unknown as StudioLiveRoom;
function Fixture() {
  const [scope, setScope] = useState(0), [mode, setMode] = useState("balanced"), [mounted, setMounted] = useState(true);
  return <StudioLiveCollaborationContext.Provider value={{ ...EMPTY_STUDIO_LIVE_CONTEXT, room, canChat: true, availability: "ready" }}>
    <main className="mx-auto max-w-xl space-y-4 p-5 text-fg">
      <h1>Virtual Studio environment sound</h1>
      <label>Activity <select aria-label="Activity" value={mode} onChange={(event) => setMode(event.target.value)}>
        {["balanced", "lively", "focus", "away", "authoring"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <button type="button" onClick={() => setScope((value) => value + 1)}>Change world</button>
      <button type="button" onClick={() => setMounted((value) => !value)}>Toggle surface</button>
      {mounted ? <StudioVirtualSpaceAmbientAudio scope={scope} ready={mode !== "authoring"} focused={mode === "focus"} away={mode === "away"} /> : null}
      <StudioP2pHuddleLauncher />
    </main>
  </StudioLiveCollaborationContext.Provider>;
}
createRoot(document.getElementById("test-root")!).render(<StrictMode><Fixture /></StrictMode>);
