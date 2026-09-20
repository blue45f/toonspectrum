import { STUDIO_AMBIENT_TRACKS, type StudioAmbientTrackId } from "./studio-virtual-space-ambient-tracks";

export type StudioAmbientPauseReason = "world" | "focus" | "away" | "hidden" | "blur" | null;
export interface StudioAmbientAudioSnapshot {
  readonly enabled: boolean;
  readonly phase: "off" | "loading" | "playing" | "paused" | "error";
  readonly trackId: StudioAmbientTrackId;
  readonly volume: number;
  readonly ducked: boolean;
  readonly pauseReason: StudioAmbientPauseReason;
}
export interface StudioAmbientAudioDependencies {
  createContext(): AudioContext;
  load(track: typeof STUDIO_AMBIENT_TRACKS[number], signal: AbortSignal): Promise<ArrayBuffer>;
}
const browserDependencies: StudioAmbientAudioDependencies = {
  createContext: () => new AudioContext(),
  async load(track, signal) {
    const response = await fetch(track.src, { signal, credentials: "omit" });
    if (!response.ok) throw new Error("Ambient recording unavailable");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== track.bytes) throw new Error("Ambient recording size mismatch");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== track.sha256 || signal.aborted) throw new Error("Ambient recording integrity mismatch");
    return bytes;
  },
};

/** Owns one selected local-output recording. Never creates a media stream or a capture track. */
export class StudioVirtualAmbientAudioController {
  private state: StudioAmbientAudioSnapshot = { enabled: false, phase: "off", trackId: "gentle-rain", volume: .6, ducked: false, pauseReason: null };
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  constructor(private readonly dependencies: StudioAmbientAudioDependencies = browserDependencies) {}
  snapshot = (): StudioAmbientAudioSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<StudioAmbientAudioSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.update({ enabled });
    if (!enabled) { this.release(); this.update({ phase: "off" }); }
    else if (!this.state.pauseReason) void this.start();
    else this.update({ phase: "paused" });
  }
  selectTrack(trackId: StudioAmbientTrackId): void {
    if (this.disposed || !STUDIO_AMBIENT_TRACKS.some((track) => track.id === trackId) || trackId === this.state.trackId) return;
    this.release(); this.update({ trackId, phase: this.state.pauseReason ? "paused" : "off" });
    if (this.state.enabled && !this.state.pauseReason) void this.start();
  }
  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.update({ volume: Math.min(1, Math.max(0, volume)) }); this.applyGain();
  }
  setEnvironment(pauseReason: StudioAmbientPauseReason, ducked: boolean): void {
    if (this.disposed) return;
    const previous = this.state.pauseReason;
    this.update({ pauseReason, ducked }); this.applyGain();
    if (!this.state.enabled) return;
    if (pauseReason) {
      this.generation++; this.loading?.abort(); this.loading = null;
      this.stopSource(); void this.context?.suspend().catch(() => undefined);
      this.update({ phase: "paused" });
    } else if (previous) void this.start();
  }
  private applyGain(): void {
    if (!this.context || !this.gain) return;
    const parameter = this.gain.gain;
    parameter.cancelScheduledValues(this.context.currentTime);
    parameter.setTargetAtTime(this.state.volume * (this.state.ducked ? .15 : 1), this.context.currentTime, this.state.ducked ? .04 : .18);
  }
  private async start(): Promise<void> {
    if (this.disposed || this.state.pauseReason || !this.state.enabled || this.source || this.loading) return;
    const generation = ++this.generation;
    const loading = new AbortController(); this.loading = loading;
    try {
      // create/resume executes in the explicit enable/select gesture, before fetch awaits.
      const context = this.context ??= this.dependencies.createContext();
      this.update({ phase: "loading" });
      await context.resume();
      if (generation !== this.generation) return;
      if (!this.buffer) {
        const track = STUDIO_AMBIENT_TRACKS.find((item) => item.id === this.state.trackId)!;
        const bytes = await this.dependencies.load(track, loading.signal);
        if (generation !== this.generation) return;
        const buffer = await context.decodeAudioData(bytes);
        if (generation !== this.generation) return;
        if (buffer.numberOfChannels !== 2 || Math.abs(buffer.duration - track.duration) > .05) throw new Error("Ambient recording format mismatch");
        this.buffer = buffer;
      }
      if (generation !== this.generation || this.disposed || this.state.pauseReason || !this.state.enabled) return;
      this.loading = null;
      this.gain = context.createGain(); this.gain.gain.value = 0;
      this.gain.connect(context.destination);
      const source = context.createBufferSource(); source.buffer = this.buffer; source.loop = true;
      source.connect(this.gain); this.source = source; this.applyGain(); source.start();
      this.update({ phase: "playing" });
    } catch {
      if (generation !== this.generation || this.disposed) return;
      this.release(); this.update({ enabled: false, phase: "error" });
    }
  }
  private stopSource(): void {
    if (this.source) { try { this.source.stop(); } catch { /* Already stopped by context shutdown. */ } this.source.disconnect(); this.source = null; }
    this.gain?.disconnect(); this.gain = null;
  }
  private release(): void {
    this.generation++; this.loading?.abort(); this.loading = null; this.stopSource();
    const context = this.context; this.context = null; this.buffer = null;
    if (context) void context.close().catch(() => undefined);
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.release(); this.listeners.clear(); }
}
