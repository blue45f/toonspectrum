import { PROMO_DEFAULT_MIXER, promoMixer } from "./promo-model";

import type { PromoMixer, PromoProject } from "./promo-model";

export function PromoAudioMixer({
  project,
  disabled,
  onChange,
}: {
  project: PromoProject;
  disabled: boolean;
  onChange: (mixer: PromoMixer) => void;
}) {
  const mixer = promoMixer(project);
  const patch = (value: Partial<PromoMixer>) => onChange({ ...mixer, ...value });

  return (
    <section className="promo-audio-mixer" aria-labelledby="promo-audio-mixer-title">
      <div className="promo-section-head">
        <h3 id="promo-audio-mixer-title">Audio Mixer</h3>
        <span>미리보기·내보내기 공통</span>
      </div>
      <div className="promo-voice-sliders">
        <label htmlFor="promo-master-volume">
          마스터 음량 {Math.round(mixer.masterVolume * 100)}%
          <input
            id="promo-master-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={mixer.masterVolume}
            disabled={disabled}
            onChange={(event) => patch({
              masterVolume: Number(event.target.value),
            })}
          />
        </label>
        <label htmlFor="promo-ducking">
          음성 구간 BGM 감쇠 {Math.round(mixer.ducking * 100)}%
          <input
            id="promo-ducking"
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={mixer.ducking}
            disabled={disabled}
            onChange={(event) => patch({ ducking: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="promo-inline-grid">
        <label htmlFor="promo-duck-attack">
          감쇠 시작 · {mixer.attackSec.toFixed(2)}초
          <input
            id="promo-duck-attack"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={mixer.attackSec}
            disabled={disabled}
            onChange={(event) => patch({ attackSec: Number(event.target.value) })}
          />
        </label>
        <label htmlFor="promo-duck-release">
          BGM 복귀 · {mixer.releaseSec.toFixed(2)}초
          <input
            id="promo-duck-release"
            type="range"
            min={0.05}
            max={2}
            step={0.05}
            value={mixer.releaseSec}
            disabled={disabled}
            onChange={(event) => patch({ releaseSec: Number(event.target.value) })}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...PROMO_DEFAULT_MIXER })}
        >
          믹서 기본값
        </button>
      </div>
      <p className="promo-muted">
        내레이션이 재생되는 동안 BGM을 자동으로 낮추고, 짧은 페이드로 클릭음과
        갑작스러운 음량 변화를 줄입니다.
      </p>
    </section>
  );
}
