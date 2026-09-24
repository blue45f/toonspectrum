import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { loadPromoDraft, savePromoDraft } from "./promo-draft";
import { directPromo, emptyPromoProject, parsePromoProject, PROMO_DEFAULT_PRESENTATION, PROMO_DIRECTOR_TEMPLATES, promoMusicGain, promoShotList, promoTimeline, promoVoiceGain, promoVtt, type PromoProject } from "./promo-model";
import { promoRemotionFiles } from "./promo-remotion";
import { createPromoSoundtrack } from "./promo-soundtrack";

function fixture(): PromoProject {
  return { ...emptyPromoProject(), panels: [0, 1, 2].map((index) => ({ id: `p-${index}`, src: "data:image/png;base64,aGVsbG8=", description: "긴 이야기 속의 만남", caption: index === 1 ? "한글 대사와 영어 Hello" : "", motion: "still", fit: "contain", weight: 1 })) };
}
describe("local comic director", () => {
  for (const template of PROMO_DIRECTOR_TEMPLATES) it(`${template.id} is deterministic, portable and preserves the original story`, () => {
    const project = fixture();
    const result = directPromo(project, template.id);
    expect(result).toEqual(directPromo(project, template.id));
    expect(parsePromoProject(result)).toEqual(result);
    expect(result.panels.map(({ id, src }) => ({ id, src }))).toEqual(project.panels.map(({ id, src }) => ({ id, src })));
    expect(result.panels[1]?.caption).toBe(project.panels[1]?.caption);
    expect(project.panels.every((panel) => panel.motion === "still")).toBe(true);
    expect(promoTimeline(result).reduce((sum, scene) => sum + scene.duration, 60)).toBe(450);
  });
  it("round-trips optional foreground and presentation while rejecting unsafe settings", () => {
    const project = fixture();
    project.panels[0] = { ...project.panels[0]!, foregroundSrc: project.panels[0]!.src, focusX: 0, focusY: 1, intensity: 2, transition: "wipe", effect: "snow" };
    project.presentation = { ...PROMO_DEFAULT_PRESENTATION, brandText: "나의 브랜드", reducedMotion: true };
    expect(parsePromoProject(project)).toEqual(project);
    for (const patch of [{ foregroundSrc: "https://untrusted.invalid/a.png" }, { focusX: -0.01 }, { intensity: Number.NaN }, { effect: "script" }]) {
      expect(() => parsePromoProject({ ...project, panels: [{ ...project.panels[0], ...patch }] })).toThrow();
    }
    expect(() => parsePromoProject({ ...project, presentation: { ...project.presentation, brandColor: "url(https://untrusted.invalid)" } })).toThrow();
  });
  it("WebVTT escapes markup without corrupting timestamps and shot list omits media", () => {
    const project = fixture(); project.panels[0]!.caption = "<b>안녕</b> & 환영";
    expect(promoVtt(project)).toMatch(/^WEBVTT\n\n/u);
    expect(promoVtt(project)).toContain("-->");
    expect(promoVtt(project)).toContain("&lt;b&gt;안녕&lt;/b&gt; &amp;");
    const shots = JSON.parse(promoShotList(project));
    expect(shots.fps).toBe(30); expect(shots.ending.startFrame).toBe(390);
    expect(promoShotList(project)).not.toContain("base64");
  });
  it("narration ducks music only over its scheduled window and muted speech never ducks", () => {
    const project: PromoProject = { ...fixture(), audio: { src: "data:audio/wav;base64,aGVsbG8=", volume: 0.5 }, voiceover: { src: "data:audio/wav;base64,aGVsbG8=", volume: 0.9, startSec: 3, durationSec: 2 } };
    expect(parsePromoProject(project)).toEqual(project);
    expect(promoMusicGain(project, 60)).toBe(0.5);
    expect(promoMusicGain(project, 120)).toBeCloseTo(0.14);
    expect(promoMusicGain(project, 180)).toBe(0.5);
    expect(promoVoiceGain(project, 60)).toBe(0);
    expect(promoVoiceGain(project, 120)).toBe(0.9);
    expect(promoVoiceGain(project, 150)).toBe(0);
    expect(promoMusicGain({ ...project, voiceover: { ...project.voiceover!, volume: 0 } }, 120)).toBe(0.5);
  });
  it("render kit extracts foreground/narration as real local assets and keeps shared rendering", () => {
    const project = directPromo(fixture(), "anime");
    project.panels[0]!.foregroundSrc = project.panels[0]!.src;
    project.voiceover = { src: "data:audio/wav;base64,aGVsbG8=", volume: 0.9, startSec: 2, durationSec: 4 };
    const files = promoRemotionFiles(project, {
      model: "shared-model",
      canvas: "shared-canvas",
      voiceStudioModel: "shared-voice-studio-model",
    });
    expect(files["public/foreground-1.png"]).toBeInstanceOf(Uint8Array);
    expect(files["public/narration.wav"]).toBeInstanceOf(Uint8Array);
    expect(files["project.json"]).not.toContain("base64");
    expect(files["src/Promo.tsx"]).toContain("promoVoiceGain");
    expect(files["src/Promo.tsx"]).toContain("promoMusicGain");
    expect(files["captions.vtt"]).toContain("WEBVTT");
  });
});
describe("original local synthesized audio", () => {
  for (const style of ["ambient", "pulse", "suspense"] as const) it(`${style} emits deterministic bounded PCM WAV`, () => {
    const bytes = createPromoSoundtrack(2, style); const view = new DataView(bytes);
    expect(bytes).toEqual(createPromoSoundtrack(2, style));
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(64000);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(bytes.byteLength - 2, true)).toBe(0);
    let peak = 0; for (let i = 44; i < bytes.byteLength; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
    expect(peak).toBeGreaterThan(1000); expect(peak).toBeLessThan(32767);
  });
  it("rejects unbounded allocations", () => { for (const duration of [0, -1, 61, Infinity, NaN]) expect(() => createPromoSoundtrack(duration, "ambient")).toThrow(); });
});
describe("transactional local draft", () => {
  beforeEach(async () => { await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("toonstudio-promo-drafts"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); });
  it("restores actual media and persists removal of the last cut", async () => {
    expect(await loadPromoDraft()).toBeNull();
    const project = fixture(); expect(await savePromoDraft(project, 0)).toBe(1);
    expect((await loadPromoDraft())?.project).toEqual(project);
    await savePromoDraft({ ...project, panels: [] }, 1);
    expect((await loadPromoDraft())?.project.panels).toEqual([]);
  });
  it("never overwrites a draft saved by a different tab", async () => {
    await savePromoDraft(fixture(), 0);
    await expect(savePromoDraft({ ...fixture(), title: "stale writer" }, 0)).rejects.toThrow("다른 탭");
    expect((await loadPromoDraft())?.project.title).toBe("나의 웹툰");
  });
});
