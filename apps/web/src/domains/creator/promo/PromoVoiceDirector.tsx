import { useEffect, useMemo, useRef, useState } from "react";

import {
  isNaturalBrowserSpeechSupported,
  isNaturalSpeechRecordingSupported,
  naturalSpeechVoiceKey,
  rankNaturalKoreanVoices,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
  type NaturalSpeechSegment,
} from "../../../shared/lib/natural-browser-speech";
import { downloadPromoBlob } from "./promo-media";
import {
  buildPromoNarrationScript,
  buildPromoVoicePlan,
  PROMO_VOICE_PRESETS,
  promoVoicePreset,
  type PromoVoicePresetId,
} from "./promo-voice-director";

import type { PromoProject } from "./promo-model";

export type PromoVoiceGenerationRequest = {
  text: string;
  plan: readonly NaturalSpeechSegment[];
  voice: SpeechSynthesisVoice | null;
};

export function PromoVoiceDirector({
  project,
  disabled,
  onGenerate,
}: {
  project: PromoProject;
  disabled: boolean;
  onGenerate: (request: PromoVoiceGenerationRequest) => void;
}) {
  const generatedScript = useMemo(() => buildPromoNarrationScript(project), [project]);
  const [script, setScript] = useState(generatedScript);
  const [scriptEdited, setScriptEdited] = useState(false);
  const [presetId, setPresetId] = useState<PromoVoicePresetId>("natural");
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [allowOnlineVoices, setAllowOnlineVoices] = useState(false);
  const [voiceKey, setVoiceKey] = useState("");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "playing">("idle");
  const [notice, setNotice] = useState("");
  const previewRef = useRef<NaturalBrowserSpeechSession | null>(null);
  const supported = isNaturalBrowserSpeechSupported();
  const recordingSupported = isNaturalSpeechRecordingSupported();

  useEffect(() => {
    if (!scriptEdited) setScript(generatedScript);
  }, [generatedScript, scriptEdited]);

  useEffect(() => {
    if (!supported) return;
    const synthesis = window.speechSynthesis;
    const load = () => {
      try { setAllVoices(Array.from(synthesis.getVoices())); }
      catch { setAllVoices([]); }
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
    [allVoices]
  );
  const rankedVoices = useMemo(
    () => rankNaturalKoreanVoices(allVoices, { preferLocal: !allowOnlineVoices }),
    [allVoices, allowOnlineVoices]
  );
  const selectableVoices = allowOnlineVoices ? rankedVoices : localVoices;
  const onlineVoiceCount = rankedVoices.filter((voice) => voice.localService !== true).length;

  useEffect(() => {
    if (selectableVoices.some((voice) => naturalSpeechVoiceKey(voice) === voiceKey)) return;
    setVoiceKey(selectableVoices[0] ? naturalSpeechVoiceKey(selectableVoices[0]) : "");
  }, [selectableVoices, voiceKey]);

  const selectedVoice =
    selectableVoices.find((voice) => naturalSpeechVoiceKey(voice) === voiceKey) ?? null;
  const voicePlan = useMemo(
    () => buildPromoVoicePlan(script, presetId, project.seconds, true),
    [presetId, project.seconds, script]
  );
  const seconds = voicePlan.durationMs / 1_000;
  const preset = promoVoicePreset(presetId);

  const stopPreview = () => {
    previewRef.current?.cancel();
    previewRef.current = null;
    setPreviewStatus("idle");
  };

  const preview = () => {
    stopPreview();
    setNotice("");
    const session = speakNaturalBrowserSpeech({
      text: script,
      plan: voicePlan.plan,
      voice: selectedVoice,
      onEnd: () => {
        previewRef.current = null;
        setPreviewStatus("idle");
        setNotice("무료 시스템 음성 미리듣기를 마쳤어요.");
      },
      onError: (error) => {
        previewRef.current = null;
        setPreviewStatus("idle");
        setNotice(error.message);
      },
    });
    if (!session) {
      setNotice("이 브라우저에서 시스템 음성을 시작하지 못했어요.");
      return;
    }
    previewRef.current = session;
    setPreviewStatus("playing");
  };

  const generate = () => {
    stopPreview();
    setNotice("");
    onGenerate({ text: script, plan: voicePlan.plan, voice: selectedVoice });
  };

  return (
    <section className="promo-voice-director" aria-labelledby="promo-voice-director-title">
      <div className="promo-section-head">
        <h3 id="promo-voice-director-title">무료 로컬 Voice Director</h3>
        <span>API 과금 0원</span>
      </div>
      <p className="promo-muted">
        입력한 제목·자막만으로 음성용 대본을 만들고, 발음 보정·호흡 분할·문장별 속도와 피치를
        브라우저 안에서 적용합니다. ToonSpectrum의 유료 TTS API는 호출하지 않습니다.
      </p>

      <div className="promo-inline-grid">
        <label htmlFor="promo-voice-style">
          말하는 느낌
          <select
            id="promo-voice-style"
            value={presetId}
            disabled={disabled}
            onChange={(event) => setPresetId(event.target.value as PromoVoicePresetId)}
          >
            {PROMO_VOICE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label htmlFor="promo-system-voice">
          시스템 음성
          <select
            id="promo-system-voice"
            value={voiceKey}
            disabled={disabled || selectableVoices.length === 0}
            onChange={(event) => setVoiceKey(event.target.value)}
          >
            {selectableVoices.length === 0 ? <option value="">사용 가능한 기기 내 한국어 음성 없음</option> : null}
            {selectableVoices.map((voice) => (
              <option key={naturalSpeechVoiceKey(voice)} value={naturalSpeechVoiceKey(voice)}>
                {voice.name} · {voice.localService === true ? "기기 내" : "온라인 가능"}
              </option>
            ))}
          </select>
        </label>
        <div className="promo-voice-duration" aria-live="polite">
          <strong>예상 {seconds.toFixed(1)}초</strong>
          <span>영상 {project.seconds}초 · 자동 속도 {voicePlan.rate.toFixed(2)}×</span>
        </div>
      </div>
      <p className="promo-muted">{preset.description}</p>

      {onlineVoiceCount > 0 ? (
        <label className="promo-toggle">
          <input
            type="checkbox"
            checked={allowOnlineVoices}
            disabled={disabled}
            onChange={(event) => setAllowOnlineVoices(event.target.checked)}
          />
          운영체제의 온라인 한국어 음성도 허용 · 별도 결제는 없지만 대본이 OS 음성 서비스로 전송될 수 있음
        </label>
      ) : null}

      <label htmlFor="promo-voice-script">
        음성용 대본
        <textarea
          id="promo-voice-script"
          rows={7}
          maxLength={4_000}
          value={script}
          disabled={disabled}
          onChange={(event) => {
            setScript(event.target.value);
            setScriptEdited(true);
          }}
        />
      </label>
      {voicePlan.overrunMs > 0 ? (
        <p className="promo-error">
          자연스러운 최대 속도를 적용해도 영상보다 약 {(voicePlan.overrunMs / 1_000).toFixed(1)}초 길어요.
          대본을 줄이거나 영상 길이를 늘려 주세요.
        </p>
      ) : null}

      <div className="promo-button-row">
        <button
          type="button"
          disabled={disabled || !supported || !script.trim()}
          onClick={previewStatus === "playing" ? stopPreview : preview}
        >
          {previewStatus === "playing" ? "미리듣기 정지" : "무료 음성 미리듣기"}
        </button>
        <button
          type="button"
          className="promo-primary"
          disabled={disabled || !recordingSupported || !script.trim() || voicePlan.overrunMs > 0}
          onClick={generate}
        >
          무료 음성 파일 만들기
        </button>
        <button
          type="button"
          disabled={disabled || script === generatedScript}
          onClick={() => {
            setScript(generatedScript);
            setScriptEdited(false);
          }}
        >
          대본 다시 만들기
        </button>
        <button
          type="button"
          disabled={disabled || !script.trim()}
          onClick={() => downloadPromoBlob(new Blob([script], { type: "text/plain;charset=utf-8" }), "toonstudio-voice-script.txt")}
        >
          대본 TXT
        </button>
      </div>

      <p className="promo-muted">
        음성 파일 만들기를 누르면 브라우저 공유창에서 <strong>현재 탭</strong>과 <strong>탭 오디오 공유</strong>를
        선택하세요. 시스템 음성 재생분만 로컬 녹음해 내레이션 트랙에 붙이며 서버로 업로드하지 않습니다.
        {recordingSupported ? "" : " 현재 브라우저에서는 파일 만들기가 지원되지 않아 미리듣기와 기존 음성 파일 업로드만 사용할 수 있습니다."}
      </p>
      {notice ? <p className="promo-muted" role="status">{notice}</p> : null}
    </section>
  );
}
