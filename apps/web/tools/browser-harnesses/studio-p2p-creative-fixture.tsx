import { createRoot } from "react-dom/client";

import StudioP2pHuddleLauncher from "../../src/domains/creator/live/huddle/StudioP2pHuddleLauncher";
import { StudioLiveCollaborationContext, EMPTY_STUDIO_LIVE_CONTEXT } from "../../src/domains/creator/live/studio-live-collaboration-context";
import { createStudioLiveEnvelope, type StudioLiveEnvelope } from "../../src/domains/creator/live/studio-live-collaboration-protocol";
import { applyStudioLiveP2pOverlay } from "../../src/domains/creator/live/studio-live-p2p-overlay-transport";

import type { StudioLiveRoom } from "../../src/domains/creator/live/studio-live-collaboration-room";
import type { StudioLiveTransport } from "../../src/domains/creator/live/studio-live-collaboration-transport";
import "../../src/styles/globals.css";

// Local fixture only: real RTC/SCTP/RTP and product UI, NOT production authentication/signaling.
export const primaryPackets: StudioLiveEnvelope[] = [];
export const directPackets: Array<{ direction: "in" | "out"; peer: string; kind: string | null; epoch?: string; toEpoch?: string; type?: string }> = [];
(globalThis as unknown as { qaDirectPackets: typeof directPackets }).qaDirectPackets = directPackets;
const listeners = new Set<(packet: StudioLiveEnvelope) => void>();
const terminalListeners = new Set<(event: { type: string }) => void>();
let transport: StudioLiveTransport | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let sequence = 0;
let hello: () => void = () => undefined;
let unmount: () => void = () => undefined;
export function signal(packet: StudioLiveEnvelope): void { for (const listener of listeners) listener(packet); }
export function announce(): void { hello(); }
export function terminate(): void { for (const listener of [...terminalListeners]) listener({ type: "terminal" }); }
export function peerCount(): number { return transport?.direct?.getPeers().length ?? 0; }
export function cleanup(): void { if (heartbeat) clearInterval(heartbeat); unmount(); transport?.close(); listeners.clear(); terminalListeners.clear(); }
export async function mount(index: number): Promise<void> {
  const participant = { sessionId: `00000000-0000-4000-8000-00000000000${index + 1}`, displayName: `작가 ${index + 1}`, role: "editor" as const };
  const relay = (globalThis as unknown as { qaRelay: (packet: StudioLiveEnvelope) => Promise<void> }).qaRelay;
  let ready = true;
  const primary = { mode: "server", get ready() { return ready; }, crdtFanout: "authoritative", connect: async () => undefined,
    send: (packet: StudioLiveEnvelope) => { primaryPackets.push(packet); void relay(packet); return true; },
    subscribe: (listener: (packet: StudioLiveEnvelope) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close: () => { ready = false; listeners.clear(); },
  } as StudioLiveTransport;
  transport = applyStudioLiveP2pOverlay(() => primary)({ workId: "creative-qa", roomName: "creative-qa", participant });
  await transport.connect();
  const baseDirect = transport.direct!;
  const direct = {
    getPeers: () => baseDirect.getPeers(),
    send: (targetSessionId: string, payload: string) => {
      let packet: { kind?: unknown; epoch?: unknown; toEpoch?: unknown; type?: unknown } = {};
      try { packet = JSON.parse(payload) as typeof packet; } catch { /* QA diagnostics only */ }
      directPackets.push({ direction: "out", peer: targetSessionId, kind: typeof packet.kind === "string" ? packet.kind : null,
        epoch: typeof packet.epoch === "string" ? packet.epoch : undefined,
        toEpoch: typeof packet.toEpoch === "string" ? packet.toEpoch : undefined,
        type: typeof packet.type === "string" ? packet.type : undefined });
      return baseDirect.send(targetSessionId, payload);
    },
    subscribe: (listener: (sender: StudioLiveParticipant, payload: string) => void) => baseDirect.subscribe((sender, payload) => {
      let packet: { kind?: unknown; epoch?: unknown; toEpoch?: unknown; type?: unknown } = {};
      try { packet = JSON.parse(payload) as typeof packet; } catch { /* QA diagnostics only */ }
      directPackets.push({ direction: "in", peer: sender.sessionId, kind: typeof packet.kind === "string" ? packet.kind : null,
        epoch: typeof packet.epoch === "string" ? packet.epoch : undefined,
        toEpoch: typeof packet.toEpoch === "string" ? packet.toEpoch : undefined,
        type: typeof packet.type === "string" ? packet.type : undefined });
      listener(sender, payload);
    }),
  };
  const room = { ready: true, workId: "creative-qa", participant, direct,
    subscribe: () => () => undefined,
    subscribeVoice: (listener: (event: { type: string }) => void) => {
      terminalListeners.add(listener); return () => { terminalListeners.delete(listener); };
    },
  } as unknown as StudioLiveRoom;
  hello = () => { transport?.send(createStudioLiveEnvelope({ workId: "creative-qa", sender: participant,
    kind: sequence ? "presence:heartbeat" : "presence:hello", payload: { visibility: "active", pageId: "page-1" }, sentAt: Date.now(), sequence: ++sequence })); };
  heartbeat = setInterval(hello, 3000);
  const element = document.getElementById("test-root");
  if (!element) throw new Error("Missing fixture root");
  const root = createRoot(element); unmount = () => root.unmount();
  root.render(<StudioLiveCollaborationContext.Provider value={{ ...EMPTY_STUDIO_LIVE_CONTEXT, room, canChat: true, availability: "ready" }}>
    <StudioP2pHuddleLauncher />
  </StudioLiveCollaborationContext.Provider>);
}

/** WebKit QA only: generated tracks exercise native RTP without opening physical devices. */
export function installGeneratedMedia(): void {
  const qa = globalThis as unknown as { qaCaptureCalls: number; qaTracks: MediaStreamTrack[] };
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    qa.qaCaptureCalls++;
    const stream = new MediaStream(); let audio: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let canvas: HTMLCanvasElement | null = null;
    if (constraints?.audio) {
      audio = new AudioContext(); oscillator = audio.createOscillator();
      const gain = audio.createGain(); gain.gain.value = 0.05;
      const destination = audio.createMediaStreamDestination(); oscillator.connect(gain); gain.connect(destination);
      oscillator.start(); await audio.resume(); destination.stream.getTracks().forEach((track) => stream.addTrack(track));
    }
    if (constraints?.video) {
      canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
      canvas.captureStream(12).getTracks().forEach((track) => stream.addTrack(track));
    }
    let frame = 0;
    const tick = setInterval(() => {
      if (stream.getTracks().every((track) => track.readyState === "ended")) {
        clearInterval(tick); oscillator?.stop(); if (audio) void audio.close(); return;
      }
      const context = canvas?.getContext("2d");
      if (context) { context.fillStyle = "#18212b"; context.fillRect(0, 0, 320, 180);
        context.fillStyle = "#ffffff"; context.font = "22px sans-serif"; context.fillText(`Synthetic QA ${++frame}`, 18, 90); }
    }, 80);
    qa.qaTracks.push(...stream.getTracks()); return stream;
  };
}
