import {
  buildNaturalSpeechPlan,
  estimateNaturalSpeechDurationMs,
  naturalSpeechVoiceKey,
  rankNaturalKoreanVoices,
  type NaturalBrowserSpeechSequenceItem,
  type NaturalPronunciation,
  type NaturalSpeechSegment,
} from "../../../shared/lib/natural-browser-speech";
import { PROMO_FPS, promoTimeline } from "./promo-model";
import { promoVoicePreset } from "./promo-voice-director";

import type { PromoProject } from "./promo-model";
import type {
  PromoPronunciation,
  PromoVoiceClip,
  PromoVoiceSpeaker,
  PromoVoiceStudio,
} from "./promo-voice-studio-model";

export interface PromoVoiceClipPlan {
  clip: PromoVoiceClip;
  speaker: PromoVoiceSpeaker;
  plan: NaturalSpeechSegment[];
  estimatedDurationMs: number;
  slotDurationMs: number;
  overrunMs: number;
}

export interface PromoVoiceSequencePlan {
  items: NaturalBrowserSpeechSequenceItem[];
  clips: PromoVoiceClipPlan[];
  durationMs: number;
  overrunCount: number;
  overlapCount: number;
}

const DEFAULT_SPEAKER_ID = "speaker-narrator";

function narrationText(project: PromoProject, panelId: string): string {
  const panel = project.panels.find((candidate) => candidate.id === panelId);
  return (panel?.caption || panel?.description || "").trim();
}

export function createPromoVoiceStudio(project: PromoProject): PromoVoiceStudio {
  const existing = project.voiceStudio;
  if (existing) return existing;
  const speaker: PromoVoiceSpeaker = {
    id: DEFAULT_SPEAKER_ID,
    name: "나레이션",
    gender: "neutral",
    voiceKey: "",
    presetId: "natural",
    rate: 1,
    pitch: 1,
    volume: 0.9,
  };
  const clips = promoTimeline(project).flatMap(({ panel, from, duration }): PromoVoiceClip[] => {
    const text = narrationText(project, panel.id);
    if (!text) return [];
    return [{
      id: `voice-${panel.id}`,
      speakerId: speaker.id,
      panelId: panel.id,
      text,
      startSec: from / PROMO_FPS,
      durationSec: duration / PROMO_FPS,
    }];
  });
  if (project.cta.trim()) {
    clips.push({
      id: "voice-ending-cta",
      speakerId: speaker.id,
      text: project.cta.trim(),
      startSec: Math.max(0, project.seconds - 2),
      durationSec: Math.min(2, project.seconds),
    });
  }
  return {
    version: 1,
    speakers: [speaker],
    clips,
    pronunciations: [],
    captionMode: "scene",
  };
}

export function syncPromoVoiceStudio(
  project: PromoProject,
  current: PromoVoiceStudio = createPromoVoiceStudio(project),
): PromoVoiceStudio {
  const timeline = new Map(
    promoTimeline(project).map((scene) => [scene.panel.id, scene]),
  );
  const clips = current.clips.flatMap((clip): PromoVoiceClip[] => {
    if (!clip.panelId) {
      if (clip.id === "voice-ending-cta") {
        return [{
          ...clip,
          text: clip.text || project.cta,
          startSec: Math.max(0, project.seconds - 2),
          durationSec: Math.min(2, project.seconds),
        }];
      }
      const startSec = Math.min(project.seconds, clip.startSec);
      const durationSec = Math.max(
        0.1,
        Math.min(clip.durationSec, project.seconds - startSec),
      );
      return startSec >= project.seconds ? [] : [{ ...clip, startSec, durationSec }];
    }
    const scene = timeline.get(clip.panelId);
    if (!scene) return [];
    return [{
      ...clip,
      startSec: scene.from / PROMO_FPS,
      durationSec: scene.duration / PROMO_FPS,
    }];
  });

  const representedPanels = new Set(clips.map((clip) => clip.panelId).filter(Boolean));
  const fallbackSpeaker = current.speakers[0]?.id ?? DEFAULT_SPEAKER_ID;
  for (const [panelId, scene] of timeline) {
    if (representedPanels.has(panelId)) continue;
    const text = narrationText(project, panelId);
    if (!text) continue;
    clips.push({
      id: `voice-${panelId}`,
      speakerId: fallbackSpeaker,
      panelId,
      text,
      startSec: scene.from / PROMO_FPS,
      durationSec: scene.duration / PROMO_FPS,
    });
  }
  clips.sort((left, right) => left.startSec - right.startSec || left.id.localeCompare(right.id));
  return { ...current, clips };
}

function pronunciationsForSpeech(
  pronunciations: readonly PromoPronunciation[],
): NaturalPronunciation[] {
  return pronunciations
    .filter(({ source, spoken }) => source.trim() && spoken.trim())
    .map(({ source, spoken }) => ({ source, spoken }));
}

export function buildPromoVoiceClipPlan(
  clip: PromoVoiceClip,
  speaker: PromoVoiceSpeaker,
  pronunciations: readonly PromoPronunciation[],
): PromoVoiceClipPlan {
  const preset = promoVoicePreset(speaker.presetId);
  const slotDurationMs = Math.max(100, Math.round(clip.durationSec * 1_000));
  const options = {
    style: preset.style,
    rate: speaker.rate,
    pitch: speaker.pitch,
    volume: speaker.volume,
    maxSegmentChars: preset.id === "cinematic" ? 54 : 66,
    pronunciations: pronunciationsForSpeech(pronunciations),
  } as const;
  let plan = buildNaturalSpeechPlan(clip.text, options);
  let estimatedDurationMs = estimateNaturalSpeechDurationMs(plan);
  if (estimatedDurationMs > slotDurationMs) {
    const fit = Math.min(1.24, Math.max(1, estimatedDurationMs / slotDurationMs));
    plan = buildNaturalSpeechPlan(clip.text, {
      ...options,
      rate: Math.min(1.55, speaker.rate * fit),
    });
    estimatedDurationMs = estimateNaturalSpeechDurationMs(plan);
  }
  return {
    clip,
    speaker,
    plan,
    estimatedDurationMs,
    slotDurationMs,
    overrunMs: Math.max(0, estimatedDurationMs - slotDurationMs),
  };
}

function voiceForSpeaker(
  speaker: PromoVoiceSpeaker,
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (speaker.voiceKey) {
    const selected = voices.find(
      (voice) => naturalSpeechVoiceKey(voice) === speaker.voiceKey,
    );
    if (selected) return selected;
  }
  return rankNaturalKoreanVoices(voices, {
    gender: speaker.gender,
    preferLocal: true,
  })[0] ?? null;
}

export function buildPromoVoiceSequence(
  project: PromoProject,
  voices: readonly SpeechSynthesisVoice[],
): PromoVoiceSequencePlan {
  const studio = project.voiceStudio ?? createPromoVoiceStudio(project);
  const speakers = new Map(studio.speakers.map((speaker) => [speaker.id, speaker]));
  const clips = studio.clips
    .flatMap((clip): PromoVoiceClipPlan[] => {
      const speaker = speakers.get(clip.speakerId);
      if (!speaker || !clip.text.trim()) return [];
      return [buildPromoVoiceClipPlan(clip, speaker, studio.pronunciations)];
    })
    .sort((left, right) => (
      left.clip.startSec - right.clip.startSec
      || left.clip.id.localeCompare(right.clip.id)
    ));
  const items = clips.map(({ clip, speaker, plan }) => ({
    id: clip.id,
    startMs: Math.round(clip.startSec * 1_000),
    text: clip.text,
    plan,
    voice: voiceForSpeaker(speaker, voices),
  }));
  let overlapCount = 0;
  let playbackEndMs = 0;
  for (const clip of clips) {
    const requestedStartMs = Math.round(clip.clip.startSec * 1_000);
    if (requestedStartMs < playbackEndMs - 20) overlapCount += 1;
    playbackEndMs = Math.max(requestedStartMs, playbackEndMs) + clip.estimatedDurationMs;
  }
  return {
    items,
    clips,
    durationMs: playbackEndMs,
    overrunCount: clips.filter((clip) => clip.overrunMs > 0).length,
    overlapCount,
  };
}

function transcriptTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 10));
  const minutes = Math.floor(total / 600);
  const rest = (total % 600) / 10;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
}

export function promoVoiceTranscript(project: PromoProject): string {
  const studio = project.voiceStudio ?? createPromoVoiceStudio(project);
  const speakers = new Map(studio.speakers.map((speaker) => [speaker.id, speaker.name]));
  return [...studio.clips]
    .sort((left, right) => left.startSec - right.startSec || left.id.localeCompare(right.id))
    .map((clip) => {
      const speaker = speakers.get(clip.speakerId) ?? "화자";
      return `[${transcriptTime(clip.startSec)}] ${speaker}\n${clip.text.trim()}`;
    })
    .join("\n\n");
}
