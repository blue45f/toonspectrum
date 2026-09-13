import { PROMO_EFFECTS, PROMO_MOTIONS, PROMO_MOTION_LABELS, PROMO_TRANSITIONS, PROMO_MAX_PANELS } from "./promo-model";

import type { PromoPanel, PromoScene } from "./promo-model";

export function PromoPanelEditor({ scene, index, count, disabled, onChange, onMove, onRemove, onDuplicate, onSeek, onForeground }: {
  scene: PromoScene; index: number; count: number; disabled: boolean;
  onDuplicate?: () => void; onSeek?: () => void; onForeground?: (file: File) => void;
  onChange: (patch: Partial<PromoPanel>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void;
}) {
  const { panel } = scene;
  return (
    <fieldset className="promo-shot" disabled={disabled}>
      <legend>컷 {index + 1} · {(scene.duration / 30).toFixed(1)}초</legend>
      <img src={panel.src} alt={`컷 ${index + 1} 원본`} className="promo-shot-image" />
      <div className="promo-shot-fields">
        <label htmlFor={`description-${panel.id}`}>컷 설명 <span className="promo-muted">AI가 참고할 내용</span></label>
        <textarea id={`description-${panel.id}`} maxLength={500} rows={2} placeholder="누가, 어디서, 어떤 감정으로 무엇을 하나요?" value={panel.description} onChange={(event) => onChange({ description: event.target.value })} />
        <label htmlFor={`caption-${panel.id}`}>영상 자막</label>
        <input id={`caption-${panel.id}`} maxLength={120} value={panel.caption} onChange={(event) => onChange({ caption: event.target.value })} />
        <div className="promo-inline-grid">
          <label htmlFor={`motion-${panel.id}`}>카메라 모션<select id={`motion-${panel.id}`} value={panel.motion} onChange={(event) => onChange({ motion: event.target.value as PromoPanel["motion"] })}>{PROMO_MOTIONS.map((motion) => <option key={motion} value={motion}>{PROMO_MOTION_LABELS[motion]}</option>)}</select></label>
          <label htmlFor={`fit-${panel.id}`}>화면 맞춤<select id={`fit-${panel.id}`} value={panel.fit} onChange={(event) => onChange({ fit: event.target.value as PromoPanel["fit"] })}><option value="contain">원본 전체 보기</option><option value="cover">화면 채우기 (크롭)</option></select></label>
          <label htmlFor={`weight-${panel.id}`}>상대 길이<select id={`weight-${panel.id}`} value={panel.weight} onChange={(event) => onChange({ weight: Number(event.target.value) })}>{[0.5, 1, 1.5, 2, 3].map((weight) => <option key={weight} value={weight}>{weight}배</option>)}{![0.5, 1, 1.5, 2, 3].includes(panel.weight) ? <option value={panel.weight}>{panel.weight}배 (AI)</option> : null}</select></label>
        </div>
        <details className="promo-shot-direction">
          <summary>전환 · 효과 · 초점 · 2.5D 전경</summary>
          <div className="promo-inline-grid">
            <label htmlFor={`transition-${panel.id}`}>장면 전환<select id={`transition-${panel.id}`} value={panel.transition ?? "fade"} onChange={(event) => onChange({ transition: event.target.value as PromoPanel["transition"] })}>{Object.entries(PROMO_TRANSITIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor={`effect-${panel.id}`}>분위기 효과<select id={`effect-${panel.id}`} value={panel.effect ?? "none"} onChange={(event) => onChange({ effect: event.target.value as PromoPanel["effect"] })}>{Object.entries(PROMO_EFFECTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label htmlFor={`intensity-${panel.id}`}>움직임 강도 {((panel.intensity ?? 1) * 100).toFixed(0)}%<input id={`intensity-${panel.id}`} type="range" min={0} max={2} step={0.05} value={panel.intensity ?? 1} onChange={(event) => onChange({ intensity: Number(event.target.value) })} /></label>
          {panel.fit === "cover" ? <>
            <label htmlFor={`focus-x-${panel.id}`}>가로 초점<input id={`focus-x-${panel.id}`} type="range" min={0} max={1} step={0.01} value={panel.focusX ?? 0.5} onChange={(event) => onChange({ focusX: Number(event.target.value) })} /></label>
            <label htmlFor={`focus-y-${panel.id}`}>세로 초점<input id={`focus-y-${panel.id}`} type="range" min={0} max={1} step={0.01} value={panel.focusY ?? 0.5} onChange={(event) => onChange({ focusY: Number(event.target.value) })} /></label>
          </> : null}
          {onForeground ? <><label htmlFor={`foreground-${panel.id}`}>분리한 캐릭터 전경 · 투명 PNG/WebP<input id={`foreground-${panel.id}`} type="file" accept="image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onForeground(file); event.target.value = ""; }} /></label><p className="promo-muted">배경과 별도로 준비한 투명 캐릭터를 올리면 서로 다른 속도로 움직입니다. 자동 배경 제거·깊이 추정은 수행하지 않습니다.</p></> : null}
          {panel.foregroundSrc ? <button type="button" onClick={() => onChange({ foregroundSrc: undefined })}>전경 제거</button> : null}
        </details>
        <div className="promo-shot-actions">
          {onSeek ? <button type="button" aria-label={`컷 ${index + 1} 미리보기`} onClick={onSeek}>미리보기</button> : null}
          {onDuplicate ? <button type="button" aria-label={`컷 ${index + 1} 복제`} disabled={count >= PROMO_MAX_PANELS} onClick={onDuplicate}>복제</button> : null}
          <button type="button" aria-label={`컷 ${index + 1} 앞으로 이동`} disabled={index === 0} onClick={() => onMove(-1)}>앞으로</button>
          <button type="button" aria-label={`컷 ${index + 1} 뒤로 이동`} disabled={index === count - 1} onClick={() => onMove(1)}>뒤로</button>
          <button type="button" aria-label={`컷 ${index + 1} 삭제`} onClick={onRemove}>삭제</button>
        </div>
      </div>
    </fieldset>
  );
}
