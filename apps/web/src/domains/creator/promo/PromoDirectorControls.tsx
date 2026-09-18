import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { directPromo, PROMO_DEFAULT_PRESENTATION, PROMO_DIRECTOR_TEMPLATES, type PromoProject } from "./promo-model";

export function PromoDirectorControls({ project, disabled, onApply, onPatch }: {
  project: PromoProject; disabled: boolean; onApply: (project: PromoProject) => void; onPatch: (patch: Partial<PromoProject>) => void;
}) {
  const options = { ...PROMO_DEFAULT_PRESENTATION, ...project.presentation };
  const patch = (value: Partial<typeof options>) => onPatch({ presentation: { ...options, ...value } });
  return <fieldset className="promo-card" disabled={disabled}>
    <legend>{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "연출 감독 · 무료 로컬 엔진")}</legend>
    <p className="promo-muted">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "목적에 맞는 카메라·전환·효과·읽기 시간을 한 번에 적용합니다. 컷 순서와 입력한 대사는 유지하며, 장면을 새로 생성하는 AI는 아닙니다.")}</p>
    <div className="promo-template-grid">{PROMO_DIRECTOR_TEMPLATES.map((template) => <button type="button" key={template.id} disabled={!project.panels.length} onClick={() => onApply(directPromo(project, template.id))}>
      <strong>{template.label}</strong><span>{template.description}</span>
    </button>)}</div>
    <div className="promo-inline-grid">
      <label htmlFor="promo-caption-style">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "자막 스타일")}<select id="promo-caption-style" value={options.captionStyle} onChange={(event) => patch({ captionStyle: event.target.value as typeof options.captionStyle })}><option value="classic">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "시네마틱")}</option><option value="boxed">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "가독성 박스")}</option><option value="typewriter">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "타자 등장")}</option></select></label>
      <label htmlFor="promo-caption-position">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "자막 위치")}<select id="promo-caption-position" value={options.captionPosition} onChange={(event) => patch({ captionPosition: event.target.value as typeof options.captionPosition })}><option value="bottom">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "하단")}</option><option value="center">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "중앙")}</option><option value="top">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "상단")}</option></select></label>
      <label htmlFor="promo-brand-color">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "브랜드 강조색")}<input id="promo-brand-color" type="color" value={options.brandColor} onChange={(event) => patch({ brandColor: event.target.value })} /></label>
    </div>
    <label htmlFor="promo-brand-text">{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "엔딩 브랜드 문구")}<input id="promo-brand-text" maxLength={50} value={options.brandText} onChange={(event) => patch({ brandText: event.target.value })} /></label>
    <label className="promo-toggle"><input type="checkbox" checked={options.safeArea} onChange={(event) => patch({ safeArea: event.target.checked })} />{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "세로 영상 자막 여백 확보 · 앱별 UI 안전영역은 업로드 전 확인")}</label>
    <label className="promo-toggle"><input type="checkbox" checked={options.reducedMotion} onChange={(event) => patch({ reducedMotion: event.target.checked })} />{translateCurrentStaticSourceText("domains.creator.promo.PromoDirectorControls", "ko", "저자극 연출 · 카메라·입자·타자 효과 없이 저장")}</label>
  </fieldset>;
}
