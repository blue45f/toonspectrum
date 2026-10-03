/**
 * 모션 웹툰 에디터.
 *
 * 컷 목록·연출·BGM·대사·캐릭터를 편집하고 "AI 자동 연출" 버튼으로
 * 일괄 연출을 입힌 뒤, 플레이어로 미리보며 다듬는다.
 *
 * 사용성 원칙: 처음 보는 유저가 10초 안에 할 일을 알 수 있게
 * 히어로의 핵심 액션 1개(✨ AI 자동 연출)만 강조하고, 복잡한 설정은
 * <details> 고급 설정으로 접는다. 빈 상태마다 다음 행동을 안내한다.
 */

import type { JSX } from "react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { VOICE_CHARACTER_PRESET_IDS, getVoiceCharacterPreset } from "@/shared/voice/voice-character-presets";

import { MotionWebtoonPlayer } from "./MotionWebtoonPlayer";
import {
  autoDirectEpisode,
  analyzeDialogueEmotion,
  emotionToSceneMood,
} from "./motion-webtoon-ai-director";
import {
  CAMERA_MOVES,
  CUT_TRANSITIONS,
  MOTION_SCENE_MOODS,
  buildTimeline,
  clampCutDuration,
  clampIntensity,
  createMotionId,
  defaultCutBgmCue,
  defaultCutDirection,
  episodeDurationSeconds,
  validateMotionEpisode,
  type CameraMove,
  type CutTransition,
  type DialogueLine,
  type MotionCharacter,
  type MotionCut,
  type MotionEpisode,
  type MotionSceneMood,
} from "./motion-webtoon-model";
import {
  CAMERA_MOVE_LABELS,
  CUT_TRANSITION_LABELS,
  DETECTED_EMOTION_LABELS,
  MOTION_SCENE_MOOD_LABELS,
  MOTION_WEBTOON_UI_LABELS,
} from "./motion-webtoon-labels";
import {
  DialogueEmptyIllustration,
  EditorEmptyIllustration,
  StepCutIllustration,
  StepDirectIllustration,
  StepPreviewIllustration,
} from "./motion-webtoon-illustrations";
import { useMotionWebtoonCountUp } from "./useMotionWebtoonCountUp";
import { sampleCutImageUri } from "./motion-webtoon-sample-art";
import "./motion-webtoon.css";

export interface MotionWebtoonEditorProps {
  readonly initialEpisode: MotionEpisode;
  readonly onChange?: (episode: MotionEpisode) => void;
}

const L = MOTION_WEBTOON_UI_LABELS;

function emptyCut(index: number): MotionCut {
  return {
    id: createMotionId("cut"),
    imageUrl: "",
    altKo: `컷 ${index + 1}`,
    altEn: `Cut ${index + 1}`,
    direction: defaultCutDirection(),
    transitionIn: "cut",
    bgm: defaultCutBgmCue(),
    dialogues: [],
  };
}

/** 샘플 컷 — 히어로 CTA·맛보기 버튼용. 대사 분위기와 어울리는 로컬 SVG 아트. */
function sampleEpisode(): MotionEpisode {
  const character: MotionCharacter = {
    id: createMotionId("char"),
    nameKo: "주인공",
    nameEn: "Hero",
    presetId: "narrator",
  };
  const dialogues: Array<[string, string]> = [
    ["두근거려… 오늘은 고백하는 날이야.", "My heart is pounding… today I confess."],
    ["조심해! 뒤에 뭔가 있어!", "Watch out! Something is behind you!"],
    ["정말 행복해! 우리가 해냈어!", "I'm so happy! We did it!"],
  ];
  const cuts = dialogues.map(([ko], index): MotionCut => ({
    id: createMotionId("cut"),
    imageUrl: sampleCutImageUri(index),
    altKo: `샘플 컷 ${index + 1}`,
    altEn: `Sample cut ${index + 1}`,
    direction: defaultCutDirection(),
    transitionIn: "cut",
    bgm: defaultCutBgmCue(),
    dialogues: [
      {
        id: createMotionId("dlg"),
        text: ko,
        characterId: character.id,
        startOffsetSeconds: 1,
      },
    ],
  }));
  return {
    id: createMotionId("episode"),
    titleKo: "샘플 회차",
    titleEn: "Sample episode",
    characters: [character],
    cuts,
  };
}

export function MotionWebtoonEditor(props: MotionWebtoonEditorProps): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const [episode, setEpisode] = useState<MotionEpisode>(props.initialEpisode);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(
    props.initialEpisode.cuts[0]?.id ?? null,
  );
  const [aiNotice, setAiNotice] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const update = (next: MotionEpisode) => {
    setEpisode(next);
    props.onChange?.(next);
  };

  const updateCut = (cutId: string, patch: Partial<MotionCut>) => {
    update({
      ...episode,
      cuts: episode.cuts.map((cut) => (cut.id === cutId ? { ...cut, ...patch } : cut)),
    });
  };

  const selectedCut: MotionCut | null =
    episode.cuts.find((cut) => cut.id === selectedCutId) ?? episode.cuts[0] ?? null;

  const timeline = useMemo(() => buildTimeline(episode), [episode]);
  const issues = useMemo(() => validateMotionEpisode(episode), [episode]);
  const totalSeconds = useMemo(() => episodeDurationSeconds(episode), [episode]);
  const animatedTotal = useMotionWebtoonCountUp(totalSeconds);

  const labelOf = (table: Record<string, { titleKo: string; titleEn: string }>, key: string): string => {
    const entry = table[key];
    return entry ? t(entry.titleKo, entry.titleEn) : key;
  };

  const runAiDirectOn = (target: MotionEpisode) => {
    const directed = autoDirectEpisode(target);
    update(directed);
    setAiNotice(true);
    window.setTimeout(() => setAiNotice(false), 5000);
  };

  /** 히어로 핵심 액션: 컷이 없으면 샘플을 깔고 AI 연출까지 한 번에. */
  const handleHeroCta = () => {
    if (episode.cuts.length === 0) {
      const samples = sampleEpisode();
      setSelectedCutId(samples.cuts[0]?.id ?? null);
      runAiDirectOn(samples);
    } else {
      runAiDirectOn(episode);
    }
  };

  const loadSamples = () => {
    const samples = sampleEpisode();
    update(samples);
    setSelectedCutId(samples.cuts[0]?.id ?? null);
  };

  const addCut = () => {
    const cut = emptyCut(episode.cuts.length);
    update({ ...episode, cuts: [...episode.cuts, cut] });
    setSelectedCutId(cut.id);
  };

  const removeCut = (cutId: string) => {
    const cuts = episode.cuts.filter((cut) => cut.id !== cutId);
    update({ ...episode, cuts });
    if (selectedCutId === cutId) setSelectedCutId(cuts[0]?.id ?? null);
  };

  const addDialogue = (cutId: string) => {
    const cut = episode.cuts.find((c) => c.id === cutId);
    if (!cut) return;
    const firstCharacter = episode.characters[0];
    const line: DialogueLine = {
      id: createMotionId("dlg"),
      text: "",
      characterId: firstCharacter?.id ?? "",
      startOffsetSeconds: cut.dialogues.length * 2.5,
    };
    updateCut(cutId, { dialogues: [...cut.dialogues, line] });
  };

  const updateDialogue = (cutId: string, dialogueId: string, patch: Partial<DialogueLine>) => {
    const cut = episode.cuts.find((c) => c.id === cutId);
    if (!cut) return;
    updateCut(cutId, {
      dialogues: cut.dialogues.map((d) => (d.id === dialogueId ? { ...d, ...patch } : d)),
    });
  };

  const removeDialogue = (cutId: string, dialogueId: string) => {
    const cut = episode.cuts.find((c) => c.id === cutId);
    if (!cut) return;
    updateCut(cutId, { dialogues: cut.dialogues.filter((d) => d.id !== dialogueId) });
  };

  const addCharacter = () => {
    const character: MotionCharacter = {
      id: createMotionId("char"),
      nameKo: `캐릭터 ${episode.characters.length + 1}`,
      nameEn: `Character ${episode.characters.length + 1}`,
      presetId: "narrator",
    };
    update({ ...episode, characters: [...episode.characters, character] });
  };

  const updateCharacter = (characterId: string, patch: Partial<MotionCharacter>) => {
    update({
      ...episode,
      characters: episode.characters.map((c) => (c.id === characterId ? { ...c, ...patch } : c)),
    });
  };

  const steps = [
    { num: "01", title: L.step1Title, desc: L.step1Desc, Illustration: StepCutIllustration },
    { num: "02", title: L.step2Title, desc: L.step2Desc, Illustration: StepDirectIllustration },
    { num: "03", title: L.step3Title, desc: L.step3Desc, Illustration: StepPreviewIllustration },
  ];

  return (
    <div className="mw-editor">
      {/* 히어로 — 핵심 액션 1개만 강조 */}
      <header className="mw-hero">
        <div className="mw-hero-orb mw-hero-orb-a" aria-hidden="true" />
        <div className="mw-hero-orb mw-hero-orb-b" aria-hidden="true" />
        <div className="mw-hero-orb mw-hero-orb-c" aria-hidden="true" />
        <div className="mw-hero-inner">
          <span className="mw-hero-badge">{t(L.heroBadge.titleKo, L.heroBadge.titleEn)}</span>
          <h1 className="mw-hero-title">{t(L.heroTitle.titleKo, L.heroTitle.titleEn)}</h1>
          <p className="mw-hero-subtitle">{t(L.heroSubtitle.titleKo, L.heroSubtitle.titleEn)}</p>
          <button type="button" className="mw-cta-primary" onClick={handleHeroCta}>
            {t(L.heroCta.titleKo, L.heroCta.titleEn)}
          </button>
          <span className="mw-cta-hint">{t(L.heroCtaHint.titleKo, L.heroCtaHint.titleEn)}</span>
          <button type="button" className="mw-hero-ghost" onClick={loadSamples}>
            {t(L.heroSecondary.titleKo, L.heroSecondary.titleEn)}
          </button>
        </div>
      </header>

      {/* 3단계 안내 — 도식 카드 */}
      <ol className="mw-steps" aria-label={t("사용 방법", "How to use")}>
        {steps.map(({ num, title, desc, Illustration }) => (
          <li key={num} className="mw-step-card">
            <span className="mw-step-num">{num}</span>
            <Illustration />
            <h2 className="mw-step-title">{t(title.titleKo, title.titleEn)}</h2>
            <p className="mw-step-desc">{t(desc.titleKo, desc.titleEn)}</p>
          </li>
        ))}
      </ol>

      {aiNotice && (
        <p className="mw-ai-notice" role="status">
          {t(L.aiDirectDone.titleKo, L.aiDirectDone.titleEn)}
        </p>
      )}

      {issues.length > 0 && (
        <div className="mw-issues" role="alert">
          <p className="mw-issues-title">
            {t(L.issuesFound.titleKo, L.issuesFound.titleEn)} ({issues.length})
          </p>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setSelectedCutId(episode.cuts[issue.cutIndex]?.id ?? null)}
                >
                  {t(`컷 ${issue.cutIndex + 1}: `, `Cut ${issue.cutIndex + 1}: `)}
                  {t(issue.messageKo, issue.messageEn)}
                  {" → "}
                  {t(L.jumpToCut.titleKo, L.jumpToCut.titleEn)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mw-editor-grid">
        <div className="mw-editor-left">
          <section className="mw-panel" aria-label={t("회차 정보", "Episode info")}>
            <label className="mw-field">
              <span>{t("제목", "Title")}</span>
              <input
                type="text"
                value={episode.titleKo}
                onChange={(e) => update({ ...episode, titleKo: e.target.value })}
                placeholder={t("회차 제목", "Episode title")}
              />
            </label>
          </section>

          <section className="mw-panel" aria-label={t(L.characterLabel.titleKo, L.characterLabel.titleEn)}>
            <div className="mw-panel-head">
              <h2>{t(L.characterLabel.titleKo, L.characterLabel.titleEn)}</h2>
              <button type="button" className="mw-btn mw-btn-small" onClick={addCharacter}>
                {"+ "}
                {t(L.addCharacter.titleKo, L.addCharacter.titleEn)}
              </button>
            </div>
            {episode.characters.map((character) => (
              <div key={character.id} className="mw-charrow">
                <input
                  type="text"
                  value={character.nameKo}
                  onChange={(e) => updateCharacter(character.id, { nameKo: e.target.value })}
                  aria-label={t("캐릭터 이름", "Character name")}
                />
                <select
                  value={character.presetId}
                  onChange={(e) => updateCharacter(character.id, { presetId: e.target.value as MotionCharacter["presetId"] })}
                  aria-label={t(L.voicePresetLabel.titleKo, L.voicePresetLabel.titleEn)}
                >
                  {VOICE_CHARACTER_PRESET_IDS.map((presetId) => {
                    const preset = getVoiceCharacterPreset(presetId);
                    return (
                      <option key={presetId} value={presetId}>
                        {t(preset.nameKo, preset.nameEn)}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </section>

          <section className="mw-panel" aria-label={t(L.cutLabel.titleKo, L.cutLabel.titleEn)}>
            <div className="mw-panel-head">
              <h2>
                {t(L.cutLabel.titleKo, L.cutLabel.titleEn)}
                {t(` (${episode.cuts.length})`, ` (${episode.cuts.length})`)}
              </h2>
              <button type="button" className="mw-btn mw-btn-small" onClick={addCut}>
                {"+ "}
                {t(L.addCut.titleKo, L.addCut.titleEn)}
              </button>
            </div>
            {episode.cuts.length === 0 ? (
              <p className="mw-empty-hint">{t(L.emptyEpisode.titleKo, L.emptyEpisode.titleEn)}</p>
            ) : (
              <ol className="mw-cutlist">
                {episode.cuts.map((cut, index) => (
                  <li key={cut.id}>
                    <button
                      type="button"
                      className={`mw-cutlist-item${cut.id === selectedCutId ? " mw-cutlist-item-active" : ""}`}
                      onClick={() => setSelectedCutId(cut.id)}
                      aria-current={cut.id === selectedCutId}
                    >
                      <span className="mw-cutlist-thumb" aria-hidden="true">
                        {cut.imageUrl ? (
                          <img src={cut.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="mw-cutlist-thumb-fallback">{index + 1}</span>
                        )}
                      </span>
                      <span className="mw-cutlist-meta">
                        {t(`컷 ${index + 1}`, `Cut ${index + 1}`)}
                        {" · "}
                        {labelOf(MOTION_SCENE_MOOD_LABELS, cut.bgm.sceneMood)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="mw-editor-middle">
          {selectedCut ? (
            <section className="mw-panel" aria-label={t("컷 편집", "Edit cut")}>
              <div className="mw-panel-head">
                <h2>{t("컷 편집", "Edit cut")}</h2>
                <button type="button" className="mw-btn mw-btn-small mw-btn-danger" onClick={() => removeCut(selectedCut.id)}>
                  {t(L.removeCut.titleKo, L.removeCut.titleEn)}
                </button>
              </div>
              <label className="mw-field">
                <span>{t(L.imageUrlLabel.titleKo, L.imageUrlLabel.titleEn)}</span>
                <input
                  type="url"
                  value={selectedCut.imageUrl}
                  onChange={(e) => updateCut(selectedCut.id, { imageUrl: e.target.value })}
                  placeholder="https://…"
                />
              </label>
              {selectedCut.imageUrl && (
                <div className="mw-cut-preview">
                  <img src={selectedCut.imageUrl} alt={t(selectedCut.altKo, selectedCut.altEn)} />
                </div>
              )}

              {/* 복잡한 설정은 고급 설정으로 접기 */}
              <details className="mw-details">
                <summary>{t(L.advancedSettings.titleKo, L.advancedSettings.titleEn)}</summary>
                <div className="mw-details-body">
                  <h3 className="mw-details-title">{t(L.cameraSection.titleKo, L.cameraSection.titleEn)}</h3>
                  <div className="mw-fieldrow">
                    <label className="mw-field">
                      <span>{t("카메라 무브", "Camera move")}</span>
                      <select
                        value={selectedCut.direction.cameraMove}
                        onChange={(e) => updateCut(selectedCut.id, {
                          direction: { ...selectedCut.direction, cameraMove: e.target.value as CameraMove },
                        })}
                      >
                        {CAMERA_MOVES.map((move) => (
                          <option key={move} value={move}>{labelOf(CAMERA_MOVE_LABELS, move)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mw-field">
                      <span>{t(L.transitionLabel.titleKo, L.transitionLabel.titleEn)}</span>
                      <select
                        value={selectedCut.transitionIn}
                        onChange={(e) => updateCut(selectedCut.id, { transitionIn: e.target.value as CutTransition })}
                      >
                        {CUT_TRANSITIONS.map((tr) => (
                          <option key={tr} value={tr}>{labelOf(CUT_TRANSITION_LABELS, tr)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mw-fieldrow">
                    <label className="mw-field">
                      <span>{t(L.durationLabel.titleKo, L.durationLabel.titleEn)}</span>
                      <input
                        type="number"
                        min={2}
                        max={30}
                        step={1}
                        value={selectedCut.direction.durationSeconds}
                        onChange={(e) => updateCut(selectedCut.id, {
                          direction: { ...selectedCut.direction, durationSeconds: clampCutDuration(Number(e.target.value)) },
                        })}
                      />
                    </label>
                    <label className="mw-field">
                      <span>{t(L.intensityLabel.titleKo, L.intensityLabel.titleEn)}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedCut.direction.intensity}
                        onChange={(e) => updateCut(selectedCut.id, {
                          direction: { ...selectedCut.direction, intensity: clampIntensity(Number(e.target.value)) },
                        })}
                      />
                    </label>
                  </div>
                  <label className="mw-field">
                    <span>{t(L.bgmLabel.titleKo, L.bgmLabel.titleEn)}</span>
                    <select
                      value={selectedCut.bgm.sceneMood}
                      onChange={(e) => updateCut(selectedCut.id, {
                        bgm: { ...selectedCut.bgm, sceneMood: e.target.value as MotionSceneMood },
                      })}
                    >
                      {MOTION_SCENE_MOODS.map((mood) => (
                        <option key={mood} value={mood}>{labelOf(MOTION_SCENE_MOOD_LABELS, mood)}</option>
                      ))}
                    </select>
                  </label>
                  <p className="mw-empty-hint">
                    {t(
                      "크기·밝기·색감 보정은 AI 자동 연출이 대사 감정에 맞춰 이미 적용했습니다.",
                      "Size, brightness, and tone were already tuned by AI auto-direction from dialogue emotion.",
                    )}
                  </p>
                </div>
              </details>

              <div className="mw-panel-head">
                <h3>{t(L.dialogueLabel.titleKo, L.dialogueLabel.titleEn)}</h3>
                <button type="button" className="mw-btn mw-btn-small" onClick={() => addDialogue(selectedCut.id)}>
                  {"+ "}
                  {t(L.addDialogue.titleKo, L.addDialogue.titleEn)}
                </button>
              </div>
              {episode.characters.length === 0 && (
                <div className="mw-empty mw-empty-compact" role="note">
                  <p className="mw-empty-desc">{t(L.noCharacterHint.titleKo, L.noCharacterHint.titleEn)}</p>
                  <button type="button" className="mw-empty-action" onClick={addCharacter}>
                    {t(L.addCharacterFirst.titleKo, L.addCharacterFirst.titleEn)}
                  </button>
                </div>
              )}
              {selectedCut.dialogues.length === 0 ? (
                <div className="mw-empty mw-empty-compact">
                  <DialogueEmptyIllustration />
                  <p className="mw-empty-title">{t(L.emptyDialogueTitle.titleKo, L.emptyDialogueTitle.titleEn)}</p>
                  <button type="button" className="mw-empty-action" onClick={() => addDialogue(selectedCut.id)}>
                    {t(L.emptyDialogueAction.titleKo, L.emptyDialogueAction.titleEn)}
                  </button>
                </div>
              ) : (
                selectedCut.dialogues.map((dialogue) => {
                  const emotion = analyzeDialogueEmotion(dialogue.text);
                  return (
                    <div key={dialogue.id} className="mw-dlgrow">
                      <select
                        value={dialogue.characterId}
                        onChange={(e) => updateDialogue(selectedCut.id, dialogue.id, { characterId: e.target.value })}
                        aria-label={t(L.characterLabel.titleKo, L.characterLabel.titleEn)}
                      >
                        {episode.characters.map((c) => (
                          <option key={c.id} value={c.id}>{t(c.nameKo, c.nameEn)}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={dialogue.text}
                        onChange={(e) => updateDialogue(selectedCut.id, dialogue.id, { text: e.target.value })}
                        placeholder={t("대사를 입력하세요", "Enter dialogue")}
                        aria-label={t("대사", "Dialogue")}
                      />
                      <span className="mw-emotion-chip" title={t("AI 감정 분석", "AI emotion analysis")}>
                        {labelOf(DETECTED_EMOTION_LABELS, emotion)}
                        {" → "}
                        {labelOf(MOTION_SCENE_MOOD_LABELS, emotionToSceneMood(emotion))}
                      </span>
                      <button
                        type="button"
                        className="mw-btn mw-btn-small"
                        onClick={() => removeDialogue(selectedCut.id, dialogue.id)}
                        aria-label={t("대사 삭제", "Delete dialogue")}
                      >
                        {"✕"}
                      </button>
                    </div>
                  );
                })
              )}
            </section>
          ) : (
            <div className="mw-empty">
              <EditorEmptyIllustration />
              <p className="mw-empty-title">{t(L.emptyEpisodeTitle.titleKo, L.emptyEpisodeTitle.titleEn)}</p>
              <p className="mw-empty-desc">{t(L.emptyEpisode.titleKo, L.emptyEpisode.titleEn)}</p>
              <button type="button" className="mw-empty-action" onClick={addCut}>
                {t(L.emptyEpisodeAction.titleKo, L.emptyEpisodeAction.titleEn)}
              </button>
              <p className="mw-empty-desc">{t(L.emptyEpisodeAlt.titleKo, L.emptyEpisodeAlt.titleEn)}</p>
            </div>
          )}

          <section className="mw-panel" aria-label={t(L.timelineTitle.titleKo, L.timelineTitle.titleEn)}>
            <div className="mw-panel-head">
              <h2>{t(L.timelineTitle.titleKo, L.timelineTitle.titleEn)}</h2>
            </div>
            <div className="mw-total-row">
              <span className="mw-total-num">{Math.round(animatedTotal)}</span>
              <span className="mw-total">{t(L.secondsUnit.titleKo, L.secondsUnit.titleEn)} · {t(L.totalDuration.titleKo, L.totalDuration.titleEn)}</span>
            </div>
            {episode.cuts.length > 0 && (
              <div className="mw-tl-visual" role="group" aria-label={t(L.timelineTitle.titleKo, L.timelineTitle.titleEn)}>
                {(() => {
                  const maxDuration = Math.max(...episode.cuts.map((c) => c.direction.durationSeconds));
                  return episode.cuts.map((cut, index) => (
                    <button
                      key={cut.id}
                      type="button"
                      className={`mw-tl-bar${cut.id === selectedCutId ? " mw-tl-bar-active" : ""}`}
                      style={{
                        height: `${Math.max(24, (cut.direction.durationSeconds / maxDuration) * 100)}%`,
                        ["--mw-bar-index" as string]: index,
                      }}
                      onClick={() => setSelectedCutId(cut.id)}
                      aria-label={t(`컷 ${index + 1} 선택`, `Select cut ${index + 1}`)}
                      title={t(`컷 ${index + 1} · ${Math.round(cut.direction.durationSeconds)}초`, `Cut ${index + 1} · ${Math.round(cut.direction.durationSeconds)}s`)}
                    />
                  ));
                })()}
              </div>
            )}
            <ol className="mw-timeline">
              {timeline.map((event, index) => (
                <li key={index} className={`mw-tl-${event.kind}`}>
                  <span className="mw-tl-time">{event.atSeconds.toFixed(1)}s</span>
                  <span className="mw-tl-desc">
                    {event.kind === "cut-start" && t(`컷 ${event.cutIndex + 1} 시작`, `Cut ${event.cutIndex + 1} starts`)}
                    {event.kind === "bgm-change" && t("BGM 전환", "BGM change")}
                    {event.kind === "dialogue-start" && t("대사 시작", "Dialogue starts")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="mw-editor-right">
          <section className="mw-panel" aria-label={t(L.previewTitle.titleKo, L.previewTitle.titleEn)}>
            <div className="mw-panel-head">
              <h2>{t(L.previewTitle.titleKo, L.previewTitle.titleEn)}</h2>
            </div>
            <MotionWebtoonPlayer
              episode={episode}
              bgmEnabled={bgmEnabled}
              voiceEnabled={voiceEnabled}
              onBgmEnabledChange={setBgmEnabled}
              onVoiceEnabledChange={setVoiceEnabled}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
