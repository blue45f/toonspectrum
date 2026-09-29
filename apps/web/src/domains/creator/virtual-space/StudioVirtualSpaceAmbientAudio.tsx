import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioHuddleAudioFocusSnapshot, subscribeStudioHuddleAudioFocus } from "../live/huddle/studio-p2p-huddle-audio-focus";
import { StudioVirtualAmbientAudioController, type StudioAmbientAudioSnapshot, type StudioAmbientPauseReason } from "./studio-virtual-space-ambient-audio";
import { STUDIO_AMBIENT_TRACKS, STUDIO_AMBIENT_SOURCE, STUDIO_AMBIENT_LICENSE, type StudioAmbientTrackId } from "./studio-virtual-space-ambient-tracks";
import {
  STUDIO_PROXIMITY_PRESETS, resolveStudioProximityPreset, selectStudioProximityPreset, setStudioProximityRadiusVisible,
  studioProximityCurveSamples, studioProximityDisplaySnapshot, subscribeStudioProximityDisplay, type StudioProximityDisplaySnapshot,
} from "./studio-virtual-space-acoustics";

export interface StudioVirtualSpaceAmbientAudioProps {
  readonly scope: unknown;
  readonly ready: boolean;
  readonly focused: boolean;
  readonly away: boolean;
}

function useStudioProximityDisplay(): StudioProximityDisplaySnapshot {
  return useSyncExternalStore(subscribeStudioProximityDisplay, studioProximityDisplaySnapshot, studioProximityDisplaySnapshot);
}

export function StudioVirtualSpaceAmbientAudio({ scope, ready, focused, away }: StudioVirtualSpaceAmbientAudioProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpaceAmbientAudio");
  const controller = useRef<StudioVirtualAmbientAudioController | null>(null);
  const [audio, setAudio] = useState<StudioAmbientAudioSnapshot>({ enabled: false, phase: "off", trackId: "gentle-rain", volume: .6, ducked: false, pauseReason: null });
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const [blurred, setBlurred] = useState(false);
  const ducked = useSyncExternalStore(subscribeStudioHuddleAudioFocus, studioHuddleAudioFocusSnapshot, () => false);
  const proximity = useStudioProximityDisplay();
  const [debugVisible, setDebugVisible] = useState(false);
  const proximityPreset = resolveStudioProximityPreset(proximity.presetId);
  const curveSamples = debugVisible
    ? studioProximityCurveSamples(proximity.presetId).map((sample) => `${sample.distance}px → ${Math.round(sample.gain * 100)}%`).join(" · ")
    : null;
  const pauseReason: StudioAmbientPauseReason = !ready ? "world" : away ? "away" : focused ? "focus" : hidden ? "hidden" : blurred ? "blur" : null;
  useEffect(() => {
    const visibility = () => setHidden(document.visibilityState === "hidden");
    const blur = () => setBlurred(true); const focus = () => setBlurred(false);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur); window.addEventListener("focus", focus);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); };
  }, []);
  useEffect(() => {
    const owner = new StudioVirtualAmbientAudioController(); controller.current = owner;
    const off = owner.subscribe(() => setAudio(owner.snapshot())); setAudio(owner.snapshot());
    return () => { off(); owner.dispose(); if (controller.current === owner) controller.current = null; };
  }, [scope]);
  useEffect(() => { controller.current?.setEnvironment(pauseReason, ducked); }, [scope, pauseReason, ducked]);
  const status = audio.phase === "error" ? bt("환경음을 재생하지 못했어요. 다시 켜서 시도할 수 있어요.", "Could not play the recording. Turn it on to try again.")
    : audio.phase === "loading" ? bt("빗소리를 불러오는 중…", "Loading rain…")
    : audio.enabled && pauseReason ? bt("지금은 환경음을 잠시 멈췄어요. 돌아오면 이어집니다.", "Ambient sound is paused and resumes when you return.")
    : audio.phase === "playing" && ducked ? bt("대화 중이라 환경음 음량을 낮췄어요.", "Ambient volume is lower while your huddle is active.")
    : audio.phase === "playing" ? bt("이 기기에서만 재생 중", "Playing on this device only")
    : bt("환경음 꺼짐", "Ambient sound off");
  return <section className="vs2-panel studio-vspace-ambient" data-space-interactive="true" data-ambient-phase={audio.phase} data-ambient-ducked={ducked}>
    <h2>{bt("환경음", "Ambient sound")}</h2>
    <p>{bt("직접 켠 빗소리는 내 기기에서만 들려요. 마이크·통화 오디오에 섞어 보내지 않습니다.", "Rain plays only when you turn it on, on your device. It is never mixed into microphone or call audio.")}</p>
    <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
      {bt("녹음 선택", "Recording")}
      <select className="min-h-11 rounded-lg border border-line bg-panel px-2" value={audio.trackId} onChange={(event) => controller.current?.selectTrack(event.target.value as StudioAmbientTrackId)}>
        {STUDIO_AMBIENT_TRACKS.map((track) => <option key={track.id} value={track.id}>{bt(track.labelKo, track.labelEn)}</option>)}
      </select>
    </label>
    <label className="flex min-h-11 items-center gap-2 text-sm">
      {bt("환경음 음량", "Ambient volume")}
      <input type="range" min="0" max="100" step="5" value={Math.round(audio.volume * 100)} onChange={(event) => controller.current?.setVolume(Number(event.target.value) / 100)} />
      <output>{Math.round(audio.volume * 100)}%</output>
    </label>
    <button className="min-h-11 rounded-lg border border-line px-3 text-sm" type="button" aria-pressed={audio.enabled} disabled={!audio.enabled && Boolean(pauseReason)} onClick={() => controller.current?.setEnabled(!audio.enabled)}>
      {audio.enabled ? bt("환경음 끄기", "Turn ambient sound off") : bt("환경음 켜기", "Turn ambient sound on")}
    </button>
    <p role="status" className="text-xs">{status}</p>
    <div className="mt-2 border-t border-line pt-2">
      <p className="text-sm font-medium">{bt("근접 음성", "Proximity voice")}</p>
      <p className="text-xs">{bt("가까운 팀원의 목소리는 거리에 따라 자연스럽게 작아져요. 가까울수록 또렷하게 들립니다.", "Nearby teammates fade naturally with distance — clearer the closer they are.")}</p>
      <div className="my-2 flex flex-wrap gap-2" role="group" aria-label={bt("대화 거리", "Conversation distance")}>
        {STUDIO_PROXIMITY_PRESETS.map((preset) => (
          <button key={preset.id} type="button" aria-pressed={proximity.presetId === preset.id}
            className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => selectStudioProximityPreset(preset.id)}>
            {bt(preset.labelKo, preset.labelEn)}
          </button>
        ))}
      </div>
      <div className="my-2 flex flex-wrap gap-2">
        <button type="button" aria-pressed={proximity.radiusVisible} className="min-h-11 rounded-lg border border-line px-3 text-sm"
          onClick={() => setStudioProximityRadiusVisible(!proximity.radiusVisible)}>
          {proximity.radiusVisible ? bt("속삭임 반경 숨기기", "Hide whisper radius") : bt("속삭임 반경 표시", "Show whisper radius")}
        </button>
        <button type="button" aria-pressed={debugVisible} aria-expanded={debugVisible} className="min-h-11 rounded-lg border border-line px-3 text-sm"
          onClick={() => setDebugVisible((visible) => !visible)}>
          {bt("곡선 디버그", "Curve debug")}
        </button>
      </div>
      <p className="text-xs">{bt("대화 반경", "Conversation radius")}: {proximityPreset.nearRadius}px</p>
      {curveSamples ? (
        <div className="text-xs" data-proximity-debug="true" data-proximity-preset={proximityPreset.id}
          data-proximity-curve={proximityPreset.curve} data-proximity-near={proximityPreset.nearRadius} data-proximity-far={proximityPreset.farRadius}>
          <p>{bt("거리 → 음량", "Distance → gain")}: {curveSamples}</p>
        </div>
      ) : null}
    </div>
    <p className="text-xs"><a href={STUDIO_AMBIENT_SOURCE} target="_blank" rel="noreferrer">{bt("Ylmir의 창가 녹음", "Window recording by Ylmir")}</a>{" · "}<a href={STUDIO_AMBIENT_LICENSE} target="_blank" rel="noreferrer">CC0</a></p>
  </section>;
}
