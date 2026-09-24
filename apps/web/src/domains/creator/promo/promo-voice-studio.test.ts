import { describe, expect, it } from "vitest";

import {
  emptyPromoProject,
  parsePromoProject,
  PROMO_FPS,
  promoCaptionEntries,
  promoKaraokeVtt,
  promoMusicGain,
  promoSrt,
  promoVoiceGain,
} from "./promo-model";
import {
  buildPromoVoiceClipPlan,
  buildPromoVoiceSequence,
  createPromoVoiceStudio,
  promoVoiceTranscript,
  syncPromoVoiceStudio,
} from "./promo-voice-studio";

import type { PromoProject, PromoVoiceStudio } from "./promo-model";

const image = "data:image/png;base64,aGVsbG8=";
function fixture(): PromoProject {
  return {
    ...emptyPromoProject(),
    title: "별빛의 문",
    seconds: 15,
    cta: "지금 감상하세요",
    panels: [
      {
        id: "cut-1",
        src: image,
        description: "밤의 문이 열린다",
        caption: "문이 열렸어.",
        motion: "push-in",
        fit: "contain",
        weight: 1,
      },
      {
        id: "cut-2",
        src: image,
        description: "주인공이 돌아본다",
        caption: "누구지?",
        motion: "pan-left",
        fit: "contain",
        weight: 1,
      },
    ],
  };
}

describe("promo voice studio planning", () => {
  it("builds scene-aligned narration clips and preserves manual voice settings", () => {
    const project = fixture();
    const created = createPromoVoiceStudio(project);
    expect(created.speakers).toHaveLength(1);
    expect(created.clips.map((clip) => clip.panelId)).toEqual([
      "cut-1",
      "cut-2",
      undefined,
    ]);
    expect(created.clips.at(-1)).toMatchObject({
      id: "voice-ending-cta",
      startSec: 13,
      durationSec: 2,
    });

    const current: PromoVoiceStudio = {
      ...created,
      pronunciations: [{ id: "p-1", source: "Liora", spoken: "리오라" }],
      speakers: [{ ...created.speakers[0]!, name: "예고편 성우", rate: 1.1 }],
      clips: [
        { ...created.clips[0]!, text: "수정된 대사", startSec: 9 },
        ...created.clips.slice(1),
      ],
    };
    const synced = syncPromoVoiceStudio(project, current);
    expect(synced.speakers[0]).toMatchObject({ name: "예고편 성우", rate: 1.1 });
    expect(synced.pronunciations).toEqual(current.pronunciations);
    expect(synced.clips[0]).toMatchObject({
      panelId: "cut-1",
      text: "수정된 대사",
      startSec: 0,
    });
    expect(synced.clips[1]?.startSec).toBeGreaterThan(0);
  });

  it("applies the work pronunciation dictionary without changing display text", () => {
    const studio = createPromoVoiceStudio(fixture());
    const speaker = studio.speakers[0]!;
    const clip = {
      ...studio.clips[0]!,
      text: "Liora가 ToonStudio를 시작한다.",
      durationSec: 5,
    };
    const plan = buildPromoVoiceClipPlan(
      clip,
      speaker,
      [{ id: "p-1", source: "Liora", spoken: "리오라" }],
    );
    expect(plan.plan.map((segment) => segment.spokenText).join(" ")).toContain("리오라");
    expect(plan.clip.text).toContain("Liora");
  });

  it("detects clips that overrun their slot or overlap earlier speech", () => {
    const project = fixture();
    const studio = createPromoVoiceStudio(project);
    const speakerId = studio.speakers[0]!.id;
    project.voiceStudio = {
      ...studio,
      clips: [
        {
          id: "voice-a",
          speakerId,
          text: "아주 긴 첫 번째 문장입니다. 장면을 천천히 설명합니다.",
          startSec: 0,
          durationSec: 0.2,
        },
        {
          id: "voice-b",
          speakerId,
          text: "두 번째 대사입니다.",
          startSec: 0.1,
          durationSec: 3,
        },
      ],
    };
    const sequence = buildPromoVoiceSequence(project, []);
    expect(sequence.overrunCount).toBeGreaterThan(0);
    expect(sequence.overlapCount).toBeGreaterThan(0);
    expect(sequence.items.map((item) => item.id)).toEqual(["voice-a", "voice-b"]);
    expect(sequence.durationMs).toBeGreaterThan(sequence.items[1]!.startMs);
  });

  it("exports speaker-aware transcript and voice captions", () => {
    const project = fixture();
    const base = createPromoVoiceStudio(project);
    const narrator = base.speakers[0]!;
    const hero = { ...narrator, id: "speaker-hero", name: "주인공" };
    project.voiceStudio = {
      ...base,
      captionMode: "voice",
      speakers: [{ ...narrator, name: "나레이터" }, hero],
      clips: [
        { ...base.clips[0]!, speakerId: narrator.id, text: "문이 열렸다." },
        { ...base.clips[1]!, speakerId: hero.id, text: "거기 누구야?" },
      ],
    };
    const entries = promoCaptionEntries(project);
    expect(entries[0]?.caption).toBe("나레이터: 문이 열렸다.");
    expect(entries[1]?.caption).toBe("주인공: 거기 누구야?");
    expect(promoSrt(project)).toContain("주인공: 거기 누구야?");
    expect(promoVoiceTranscript(project)).toContain("[00:00.0] 나레이터");
    expect(promoVoiceTranscript(project)).toContain("주인공\n거기 누구야?");
  });
});

describe("promo voice project contract", () => {
  it("round-trips multi-speaker data and rejects broken speaker references", () => {
    const project = fixture();
    project.voiceStudio = createPromoVoiceStudio(project);
    project.mixer = {
      masterVolume: 0.8,
      ducking: 0.5,
      attackSec: 0.1,
      releaseSec: 0.6,
    };
    expect(parsePromoProject(JSON.parse(JSON.stringify(project)))).toEqual(project);

    const broken = JSON.parse(JSON.stringify(project)) as PromoProject;
    broken.voiceStudio!.clips[0]!.speakerId = "missing-speaker";
    expect(() => parsePromoProject(broken)).toThrow(/화자/u);
  });

  it("produces word-level VTT and can explicitly disable captions", () => {
    const project = fixture();
    project.voiceStudio = {
      ...createPromoVoiceStudio(project),
      captionMode: "karaoke",
    };
    const vtt = promoKaraokeVtt(project);
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("문이");
    expect(vtt).toContain("열렸어.");
    project.voiceStudio = { ...project.voiceStudio, captionMode: "none" };
    expect(promoCaptionEntries(project)).toEqual([]);
    expect(promoSrt(project)).toBe("");
  });

  it("applies master gain and configurable BGM ducking", () => {
    const project = fixture();
    project.audio = {
      src: "data:audio/wav;base64,aGVsbG8=",
      volume: 0.5,
    };
    project.voiceover = {
      src: "data:audio/wav;base64,aGVsbG8=",
      volume: 0.8,
      startSec: 1,
      durationSec: 5,
    };
    project.mixer = {
      masterVolume: 0.8,
      ducking: 0.5,
      attackSec: 0.1,
      releaseSec: 0.1,
    };
    const frame = 3 * PROMO_FPS;
    expect(promoMusicGain(project, frame)).toBeCloseTo(0.2, 4);
    expect(promoVoiceGain(project, frame)).toBeCloseTo(0.64, 4);
  });
});
