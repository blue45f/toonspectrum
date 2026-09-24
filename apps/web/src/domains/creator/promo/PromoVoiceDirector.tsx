import { useEffect, useMemo, useRef, useState } from "react";

import {
  isNaturalBrowserSpeechSupported,
  isNaturalSpeechRecordingSupported,
  naturalSpeechVoiceKey,
  rankNaturalKoreanVoices,
  speakNaturalBrowserSpeech,
  speakNaturalBrowserSpeechSequence,
  type NaturalBrowserSpeechSequenceItem,
  type NaturalBrowserSpeechSequenceSession,
  type NaturalBrowserSpeechSession,
} from "../../../shared/lib/natural-browser-speech";
import { downloadPromoBlob } from "./promo-media";
import { PROMO_VOICE_PRESETS } from "./promo-voice-director";
import {
  buildPromoVoiceSequence,
  createPromoVoiceStudio,
  promoVoiceTranscript,
  syncPromoVoiceStudio,
} from "./promo-voice-studio";

import type { PromoProject } from "./promo-model";
import type {
  PromoPronunciation,
  PromoVoiceCaptionMode,
  PromoVoiceClip,
  PromoVoiceGender,
  PromoVoicePresetId,
  PromoVoiceSpeaker,
  PromoVoiceStudio,
} from "./promo-voice-studio-model";

export type PromoVoiceGenerationRequest = {
  items: readonly NaturalBrowserSpeechSequenceItem[];
  durationMs: number;
};

type PreviewSession = NaturalBrowserSpeechSession | NaturalBrowserSpeechSequenceSession;

const GENDER_LABELS: Record<PromoVoiceGender, string> = {
  female: "여성 음색 우선",
  male: "남성 음색 우선",
  neutral: "자동 선택",
};

const CAPTION_LABELS: Record<PromoVoiceCaptionMode, string> = {
  scene: "장면 자막",
  voice: "대사 클립 자막",
  karaoke: "단어별 하이라이트",
  none: "자막 없음",
};

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function PromoVoiceDirector({
  project,
  disabled,
  onChange,
  onGenerate,
}: {
  project: PromoProject;
  disabled: boolean;
  onChange: (studio: PromoVoiceStudio) => void;
  onGenerate: (request: PromoVoiceGenerationRequest) => void;
}) {
  const generatedStudio = useMemo(
    () => createPromoVoiceStudio({ ...project, voiceStudio: undefined }),
    [project],
  );
  const studio = project.voiceStudio ?? generatedStudio;
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [allowOnlineVoices, setAllowOnlineVoices] = useState(false);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const previewRef = useRef<PreviewSession | null>(null);
  const supported = isNaturalBrowserSpeechSupported();
  const recordingSupported = isNaturalSpeechRecordingSupported();

  useEffect(() => {
    if (!supported) return;
    const synthesis = window.speechSynthesis;
    const load = () => {
      try {
        setAllVoices(Array.from(synthesis.getVoices()));
      } catch {
        setAllVoices([]);
      }
    };
    load();
    synthesis.addEventListener("voiceschanged", load);
    return () => {
      synthesis.removeEventListener("voiceschanged", load);
      previewRef.current?.cancel();
      previewRef.current = null;
    };
  }, [supported]);

  const localVoices = useMemo(
    () => rankNaturalKoreanVoices(allVoices, { localOnly: true, preferLocal: true }),
    [allVoices],
  );
  const rankedVoices = useMemo(
    () => rankNaturalKoreanVoices(allVoices, { preferLocal: !allowOnlineVoices }),
    [allVoices, allowOnlineVoices],
  );
  const selectableVoices = allowOnlineVoices ? rankedVoices : localVoices;
  const onlineVoiceCount = rankedVoices.filter(
    (voice) => voice.localService !== true,
  ).length;
  const voiceProject = useMemo(
    () => ({ ...project, voiceStudio: studio }),
    [project, studio],
  );
  const sequence = useMemo(
    () => buildPromoVoiceSequence(voiceProject, selectableVoices),
    [selectableVoices, voiceProject],
  );
  const planByClipId = useMemo(
    () => new Map(sequence.clips.map((clip) => [clip.clip.id, clip])),
    [sequence.clips],
  );

  const stopPreview = () => {
    previewRef.current?.cancel();
    previewRef.current = null;
    setActivePreview(null);
  };

  const previewTimeline = () => {
    stopPreview();
    setNotice("");
    const session = speakNaturalBrowserSpeechSequence({
      items: sequence.items,
      onEnd: () => {
        previewRef.current = null;
        setActivePreview(null);
        setNotice("전체 음성 타임라인 미리듣기를 마쳤어요.");
      },
      onError: (error) => {
        previewRef.current = null;
        setActivePreview(null);
        setNotice(error.message);
      },
    });
    if (!session) {
      setNotice("재생할 대사 클립이 없거나 시스템 음성을 시작하지 못했어요.");
      return;
    }
    previewRef.current = session;
    setActivePreview("timeline");
  };

  const previewClip = (clipId: string) => {
    stopPreview();
    setNotice("");
    const clipPlan = planByClipId.get(clipId);
    const item = sequence.items.find((candidate) => candidate.id === clipId);
    if (!clipPlan || !item) {
      setNotice("미리 들을 대사를 찾지 못했어요.");
      return;
    }
    const session = speakNaturalBrowserSpeech({
      text: clipPlan.clip.text,
      plan: clipPlan.plan,
      voice: item.voice,
      onEnd: () => {
        previewRef.current = null;
        setActivePreview(null);
      },
      onError: (error) => {
        previewRef.current = null;
        setActivePreview(null);
        setNotice(error.message);
      },
    });
    if (!session) {
      setNotice("이 브라우저에서 대사 미리듣기를 시작하지 못했어요.");
      return;
    }
    previewRef.current = session;
    setActivePreview(clipId);
  };

  const updateSpeaker = (
    speakerId: string,
    patch: Partial<PromoVoiceSpeaker>,
  ) => {
    onChange({
      ...studio,
      speakers: studio.speakers.map((speaker) => (
        speaker.id === speakerId ? { ...speaker, ...patch } : speaker
      )),
    });
  };

  const addSpeaker = () => {
    if (studio.speakers.length >= 12) return;
    onChange({
      ...studio,
      speakers: [...studio.speakers, {
        id: createId("speaker"),
        name: `화자 ${studio.speakers.length + 1}`,
        gender: "neutral",
        voiceKey: "",
        presetId: "natural",
        rate: 1,
        pitch: 1,
        volume: 0.9,
      }],
    });
  };

  const removeSpeaker = (speakerId: string) => {
    if (studio.speakers.length <= 1) return;
    const replacement = studio.speakers.find((speaker) => speaker.id !== speakerId);
    if (!replacement) return;
    onChange({
      ...studio,
      speakers: studio.speakers.filter((speaker) => speaker.id !== speakerId),
      clips: studio.clips.map((clip) => (
        clip.speakerId === speakerId
          ? { ...clip, speakerId: replacement.id }
          : clip
      )),
    });
  };

  const updateClip = (
    clipId: string,
    patch: Partial<Omit<PromoVoiceClip, "panelId">> & { panelId?: string | null },
  ) => {
    onChange({
      ...studio,
      clips: studio.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const startSec = Math.max(
          0,
          Math.min(project.seconds - 0.1, patch.startSec ?? clip.startSec),
        );
        const durationSec = Math.max(
          0.1,
          Math.min(patch.durationSec ?? clip.durationSec, project.seconds - startSec),
        );
        const next = {
          ...clip,
          ...patch,
          startSec: rounded(startSec),
          durationSec: rounded(durationSec),
        };
        if (patch.panelId !== null) return next as PromoVoiceClip;
        const { panelId: _removed, ...unlinked } = next;
        return unlinked as PromoVoiceClip;
      }),
    });
  };

  const addClip = () => {
    if (studio.clips.length >= 48) return;
    const speakerId = studio.speakers[0]?.id;
    if (!speakerId) return;
    onChange({
      ...studio,
      clips: [...studio.clips, {
        id: createId("voice"),
        speakerId,
        text: "새 대사를 입력하세요.",
        startSec: 0,
        durationSec: Math.min(2, project.seconds),
      }],
    });
  };

  const removeClip = (clipId: string) => {
    stopPreview();
    onChange({ ...studio, clips: studio.clips.filter((clip) => clip.id !== clipId) });
  };

  const resetFromScenes = () => {
    const speakerId = studio.speakers[0]?.id;
    if (!speakerId) return;
    onChange({
      ...generatedStudio,
      speakers: studio.speakers,
      pronunciations: studio.pronunciations,
      captionMode: studio.captionMode,
      clips: generatedStudio.clips.map((clip) => ({ ...clip, speakerId })),
    });
    setNotice("현재 장면 자막과 CTA에서 대사 클립을 다시 만들었어요.");
  };

  const syncWithScenes = () => {
    onChange(syncPromoVoiceStudio(voiceProject, studio));
    setNotice("장면 순서와 길이에 맞춰 연결된 대사 시간을 다시 맞췄어요.");
  };

  const addPronunciation = () => {
    if (studio.pronunciations.length >= 64) return;
    onChange({
      ...studio,
      pronunciations: [...studio.pronunciations, {
        id: createId("pronunciation"),
        source: "",
        spoken: "",
      }],
    });
  };

  const updatePronunciation = (
    id: string,
    patch: Partial<PromoPronunciation>,
  ) => {
    onChange({
      ...studio,
      pronunciations: studio.pronunciations.map((entry) => (
        entry.id === id ? { ...entry, ...patch } : entry
      )),
    });
  };

  const downloadTranscript = () => {
    const transcript = promoVoiceTranscript(voiceProject);
    downloadPromoBlob(
      new Blob([transcript], { type: "text/plain;charset=utf-8" }),
      "toonstudio-voice-transcript.txt",
    );
  };

  const generate = () => {
    stopPreview();
    setNotice("");
    onChange(studio);
    onGenerate({ items: sequence.items, durationMs: sequence.durationMs });
  };

  const timelineSeconds = sequence.durationMs / 1_000;

  return (
    <section className="promo-voice-director" aria-labelledby="promo-voice-director-title">
      <div className="promo-section-head">
        <h3 id="promo-voice-director-title">무료 로컬 Voice Studio</h3>
        <span>API 과금 0원</span>
      </div>
      <p className="promo-muted">
        캐릭터별 화자·대사 시간·발음·자막을 편집하고 브라우저 시스템 음성으로
        전체 타임라인을 미리듣거나 영상용 음성 파일로 만듭니다.
      </p>

      <div className="promo-button-row">
        <button type="button" disabled={disabled} onClick={resetFromScenes}>
          장면에서 대사 다시 만들기
        </button>
        <button type="button" disabled={disabled} onClick={syncWithScenes}>
          장면 타이밍 맞춤
        </button>
      </div>

      <label htmlFor="promo-voice-caption-mode">
        영상 자막 원본
        <select
          id="promo-voice-caption-mode"
          value={studio.captionMode}
          disabled={disabled}
          onChange={(event) => onChange({
            ...studio,
            captionMode: event.target.value as PromoVoiceCaptionMode,
          })}
        >
          {Object.entries(CAPTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <div className="promo-voice-summary" aria-live="polite">
        <strong>{studio.speakers.length}명 · {studio.clips.length}개 대사</strong>
        <span>
          예상 {timelineSeconds.toFixed(1)}초
          {sequence.overrunCount > 0
            ? ` · 구간 초과 ${sequence.overrunCount}개`
            : " · 모든 대사가 배정 구간 안에 있음"}
          {sequence.overlapCount > 0
            ? ` · 음성 겹침 ${sequence.overlapCount}개`
            : ""}
        </span>
      </div>

      <div className="promo-voice-subhead">
        <h4>화자</h4>
        <button
          type="button"
          disabled={disabled || studio.speakers.length >= 12}
          onClick={addSpeaker}
        >
          화자 추가
        </button>
      </div>
      <div className="promo-voice-speakers">
        {studio.speakers.map((speaker, index) => (
          <fieldset className="promo-voice-speaker" key={speaker.id} disabled={disabled}>
            <legend>화자 {index + 1}</legend>
            <div className="promo-inline-grid">
              <label htmlFor={`promo-speaker-name-${speaker.id}`}>
                이름
                <input
                  id={`promo-speaker-name-${speaker.id}`}
                  value={speaker.name}
                  maxLength={50}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    name: event.target.value,
                  })}
                />
              </label>
              <label htmlFor={`promo-speaker-gender-${speaker.id}`}>
                음색 방향
                <select
                  id={`promo-speaker-gender-${speaker.id}`}
                  value={speaker.gender}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    gender: event.target.value as PromoVoiceGender,
                  })}
                >
                  {Object.entries(GENDER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label htmlFor={`promo-speaker-preset-${speaker.id}`}>
                말하는 느낌
                <select
                  id={`promo-speaker-preset-${speaker.id}`}
                  value={speaker.presetId}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    presetId: event.target.value as PromoVoicePresetId,
                  })}
                >
                  {PROMO_VOICE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label htmlFor={`promo-speaker-voice-${speaker.id}`}>
              시스템 음성
              <select
                id={`promo-speaker-voice-${speaker.id}`}
                value={speaker.voiceKey}
                onChange={(event) => updateSpeaker(speaker.id, {
                  voiceKey: event.target.value,
                })}
              >
                <option value="">자동 선택</option>
                {selectableVoices.map((voice) => (
                  <option
                    key={naturalSpeechVoiceKey(voice)}
                    value={naturalSpeechVoiceKey(voice)}
                  >
                    {voice.name} · {voice.localService === true ? "기기 내" : "온라인 가능"}
                  </option>
                ))}
              </select>
            </label>

            <div className="promo-voice-sliders">
              <label htmlFor={`promo-speaker-rate-${speaker.id}`}>
                속도 {speaker.rate.toFixed(2)}×
                <input
                  id={`promo-speaker-rate-${speaker.id}`}
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={speaker.rate}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    rate: Number(event.target.value),
                  })}
                />
              </label>
              <label htmlFor={`promo-speaker-pitch-${speaker.id}`}>
                높낮이 {speaker.pitch.toFixed(2)}×
                <input
                  id={`promo-speaker-pitch-${speaker.id}`}
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={speaker.pitch}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    pitch: Number(event.target.value),
                  })}
                />
              </label>
              <label htmlFor={`promo-speaker-volume-${speaker.id}`}>
                음량 {Math.round(speaker.volume * 100)}%
                <input
                  id={`promo-speaker-volume-${speaker.id}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={speaker.volume}
                  onChange={(event) => updateSpeaker(speaker.id, {
                    volume: Number(event.target.value),
                  })}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={studio.speakers.length <= 1}
              onClick={() => removeSpeaker(speaker.id)}
            >
              화자 제거
            </button>
          </fieldset>
        ))}
      </div>

      {onlineVoiceCount > 0 ? (
        <label className="promo-toggle">
          <input
            type="checkbox"
            checked={allowOnlineVoices}
            disabled={disabled}
            onChange={(event) => setAllowOnlineVoices(event.target.checked)}
          />
          운영체제 온라인 한국어 음성도 허용 · 별도 결제는 없지만 대본이 OS 음성
          서비스로 전송될 수 있음
        </label>
      ) : null}

      <div className="promo-voice-subhead">
        <h4>대사 타임라인</h4>
        <button
          type="button"
          disabled={disabled || studio.clips.length >= 48}
          onClick={addClip}
        >
          대사 추가
        </button>
      </div>
      {studio.clips.length === 0 ? (
        <p className="promo-empty">장면 자막을 입력하거나 대사를 직접 추가하세요.</p>
      ) : null}
      <div className="promo-voice-clips">
        {studio.clips.map((clip, index) => {
          const clipPlan = planByClipId.get(clip.id);
          return (
            <fieldset className="promo-voice-clip" key={clip.id} disabled={disabled}>
              <legend>대사 {index + 1}</legend>
              <div className="promo-inline-grid">
                <label htmlFor={`promo-clip-speaker-${clip.id}`}>
                  화자
                  <select
                    id={`promo-clip-speaker-${clip.id}`}
                    value={clip.speakerId}
                    onChange={(event) => updateClip(clip.id, {
                      speakerId: event.target.value,
                    })}
                  >
                    {studio.speakers.map((speaker) => (
                      <option key={speaker.id} value={speaker.id}>
                        {speaker.name || "이름 없는 화자"}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor={`promo-clip-start-${clip.id}`}>
                  시작 · 초
                  <input
                    id={`promo-clip-start-${clip.id}`}
                    type="number"
                    min={0}
                    max={Math.max(0, project.seconds - 0.1)}
                    step={0.1}
                    value={clip.startSec}
                    onChange={(event) => updateClip(clip.id, {
                      startSec: Number(event.target.value),
                      ...(clip.panelId ? { panelId: null } : {}),
                    })}
                  />
                </label>
                <label htmlFor={`promo-clip-duration-${clip.id}`}>
                  배정 길이 · 초
                  <input
                    id={`promo-clip-duration-${clip.id}`}
                    type="number"
                    min={0.1}
                    max={Math.max(0.1, project.seconds - clip.startSec)}
                    step={0.1}
                    value={clip.durationSec}
                    onChange={(event) => updateClip(clip.id, {
                      durationSec: Number(event.target.value),
                    })}
                  />
                </label>
              </div>

              <label htmlFor={`promo-clip-text-${clip.id}`}>
                대사
                <textarea
                  id={`promo-clip-text-${clip.id}`}
                  rows={3}
                  maxLength={1_000}
                  value={clip.text}
                  onChange={(event) => updateClip(clip.id, {
                    text: event.target.value,
                  })}
                />
              </label>

              <div className="promo-voice-clip-status">
                <span>
                  {clip.panelId ? "장면 연결됨" : "자유 타이밍"}
                  {clipPlan ? ` · 예상 ${(clipPlan.estimatedDurationMs / 1_000).toFixed(1)}초` : ""}
                </span>
                {clipPlan && clipPlan.overrunMs > 0 ? (
                  <strong>
                    배정 구간보다 {(clipPlan.overrunMs / 1_000).toFixed(1)}초 길어요
                  </strong>
                ) : null}
              </div>
              <div className="promo-button-row">
                <button
                  type="button"
                  onClick={() => (
                    activePreview === clip.id ? stopPreview() : previewClip(clip.id)
                  )}
                  disabled={!supported || !clip.text.trim()}
                >
                  {activePreview === clip.id ? "미리듣기 정지" : "이 대사 미리듣기"}
                </button>
                {clip.panelId ? (
                  <button
                    type="button"
                    onClick={() => updateClip(clip.id, { panelId: null })}
                  >
                    장면 연결 해제
                  </button>
                ) : null}
                <button type="button" onClick={() => removeClip(clip.id)}>
                  대사 제거
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="promo-voice-subhead">
        <h4>작품 발음 사전</h4>
        <button
          type="button"
          disabled={disabled || studio.pronunciations.length >= 64}
          onClick={addPronunciation}
        >
          발음 추가
        </button>
      </div>
      {studio.pronunciations.length === 0 ? (
        <p className="promo-muted">
          작품명·인물명·영문 용어가 어색하면 화면 표기는 유지한 채 읽는 법만 등록하세요.
        </p>
      ) : null}
      <div className="promo-pronunciations">
        {studio.pronunciations.map((entry) => (
          <div className="promo-pronunciation" key={entry.id}>
            <label htmlFor={`promo-pronunciation-source-${entry.id}`}>
              화면 원문
              <input
                id={`promo-pronunciation-source-${entry.id}`}
                value={entry.source}
                maxLength={120}
                disabled={disabled}
                placeholder="예: Liora"
                onChange={(event) => updatePronunciation(entry.id, {
                  source: event.target.value,
                })}
              />
            </label>
            <label htmlFor={`promo-pronunciation-spoken-${entry.id}`}>
              읽는 법
              <input
                id={`promo-pronunciation-spoken-${entry.id}`}
                value={entry.spoken}
                maxLength={120}
                disabled={disabled}
                placeholder="예: 리오라"
                onChange={(event) => updatePronunciation(entry.id, {
                  spoken: event.target.value,
                })}
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({
                ...studio,
                pronunciations: studio.pronunciations.filter(
                  (candidate) => candidate.id !== entry.id,
                ),
              })}
            >
              제거
            </button>
          </div>
        ))}
      </div>

      <div className="promo-button-row promo-voice-actions">
        <button
          type="button"
          disabled={disabled || !supported || sequence.items.length === 0}
          onClick={activePreview === "timeline" ? stopPreview : previewTimeline}
        >
          {activePreview === "timeline" ? "전체 미리듣기 정지" : "전체 타임라인 미리듣기"}
        </button>
        <button
          type="button"
          className="promo-primary"
          disabled={
            disabled
            || !recordingSupported
            || sequence.items.length === 0
            || sequence.overrunCount > 0
            || sequence.overlapCount > 0
          }
          onClick={generate}
        >
          무료 전체 음성 파일 만들기
        </button>
        <button
          type="button"
          disabled={disabled || studio.clips.length === 0}
          onClick={downloadTranscript}
        >
          대사 TXT
        </button>
      </div>
      {sequence.overrunCount > 0 ? (
        <p className="promo-error">
          배정 구간을 넘는 대사가 {sequence.overrunCount}개 있어요. 문장을 줄이거나
          구간 길이·화자 속도를 조절한 뒤 음성 파일을 만들어 주세요.
        </p>
      ) : null}
      {sequence.overlapCount > 0 ? (
        <p className="promo-error">
          앞 대사가 끝나기 전에 시작하는 대사가 {sequence.overlapCount}개 있어요.
          시작 시간을 뒤로 옮기거나 문장을 줄여 음성 깨짐과 지연을 방지해 주세요.
        </p>
      ) : null}
      <p className="promo-muted">
        음성 파일 만들기에서는 공유창에서 <strong>현재 탭</strong>과
        <strong> 탭 오디오 공유</strong>를 선택하세요. 모든 화자를 시간 순서대로
        로컬 녹음해 하나의 영상 내레이션 트랙으로 연결하며 서버에 업로드하지 않습니다.
        {recordingSupported
          ? ""
          : " 현재 브라우저에서는 파일 만들기가 지원되지 않아 미리듣기와 기존 음성 업로드만 사용할 수 있습니다."}
      </p>
      {notice ? <p className="promo-muted" role="status">{notice}</p> : null}
    </section>
  );
}
