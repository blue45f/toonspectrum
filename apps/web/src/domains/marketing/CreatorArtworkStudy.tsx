import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowLeftRight, Brush, Grid2X2, Move3D, Pause, Play } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

import { CREATOR_ART_ASSETS, type CreatorArtAsset } from "./creator-theme-art";

const COPY = {
  ko: {
    alt: "테마의 색감에 맞춰 선택된 웹툰 창작 과정과 세계관 콘셉트 아트",
    label: "일러스트의 명암과 컬러 비교", tone: "명암", color: "컬러", pause: "배경 움직임 일시 정지", play: "배경 움직임 재생",
    hint: "슬라이더를 움직여 명암과 컬러를 비교하세요.", caption: "창작 과정을 설명하는 콘셉트 아트 · 실제 편집 화면이 아닙니다.",
    guides: ["획과 질감의 리듬", "장면을 나누는 컷 구성", "시선을 이끄는 공간과 원근"],
  },
  en: {
    alt: "Webtoon workflow and world-building concept art selected to match the active theme",
    label: "Compare illustration values and color", tone: "VALUES", color: "COLOR", pause: "Pause background motion", play: "Play background motion",
    hint: "Move the slider to compare values and color.", caption: "Concept art illustrating a creative workflow · not an editor capture.",
    guides: ["The rhythm of marks and texture", "Compose the story in panels", "Guide the eye with space and perspective"],
  },
} as const;
const GUIDE_ICONS = [Brush, Grid2X2, Move3D] as const;

/** A real tonal comparison of the same artwork, with illustrative composition guides. */
export function CreatorArtworkStudy({ locale, stage, image = CREATOR_ART_ASSETS.world }: { locale: string; stage: number; image?: CreatorArtAsset }) {
  const text = translateLocaleBranchForLocale(locale, "domains.marketing.CreatorArtworkStudy", COPY);
  const id = useId();
  const [colorAmount, setColorAmount] = useState(68);
  const [moving, setMoving] = useState(true);
  const Icon = GUIDE_ICONS[stage];
  return (
    <figure className="cf-art-study" data-study-stage={stage} data-motion={moving ? translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "running") : translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "paused")} data-art-asset={image.id} style={{ "--cf-reveal": `${colorAmount}%` } as CSSProperties}>
      <div className="cf-study-heading"><span>{translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "ATELIER STUDY / NO. 001")}</span><button type="button" className="cf-motion-control" onClick={() => setMoving(!moving)} aria-label={moving ? text.pause : text.play} aria-pressed={moving}>{moving ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}<span>{moving ? translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "PAUSE") : translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "PLAY")}</span></button></div>
      <div className="cf-study-scene">
        <div className="cf-study-art cf-study-values"><img src={image.src} srcSet={image.srcSet} sizes="(max-width: 820px) 92vw, 52vw" width={1536} height={1024} alt={text.alt} fetchPriority="high" /></div>
        <div className="cf-study-art cf-study-color" aria-hidden="true"><img src={image.src} srcSet={image.srcSet} sizes="(max-width: 820px) 92vw, 52vw" width={1536} height={1024} alt="" /></div>
        <svg className="cf-study-guide" viewBox="0 0 720 600" preserveAspectRatio="none" aria-hidden="true">
          {stage === 0 && <g className="cf-guide-draw"><path d="M110 390 Q195 253 253 329 T425 254 T604 136" /><path d="M131 410 Q230 295 277 350" /><circle cx="425" cy="254" r="12" /></g>}
          {stage === 1 && <g className="cf-guide-panels"><path d="M24 24H696V576H24Z M24 197H696 M253 197V576 M253 407H696" /></g>}
          {stage === 2 && <g className="cf-guide-space"><path d="M0 600 389 239 720 600 M0 420 389 239 720 420 M0 240H720 M389 239 100 600 M389 239 610 600 M389 239V600 M0 499H720 M0 370H720" /><circle cx="389" cy="239" r="8" /></g>}
        </svg>
        <div className="cf-study-divider" aria-hidden="true"><span><ArrowLeftRight size={16} /></span></div>
        <div className="cf-study-labels" aria-hidden="true"><span>{text.color}</span><span>{text.tone}</span></div>
        <div className="cf-study-caption"><Icon size={17} aria-hidden="true" /><span>{text.guides[stage]}</span><span aria-hidden="true">0{stage + 1}</span></div>
      </div>
      <div className="cf-study-controls"><label htmlFor={id}>{text.label}</label><input id={id} type="range" min={0} max={100} value={colorAmount} onChange={(event) => setColorAmount(Number(event.target.value))} aria-valuetext={`${text.color} ${colorAmount}%`} aria-describedby={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "{v0}-hint"), { v0: String(id) })} /><p id={formatI18nTemplate(translateCurrentStaticSourceText("domains.marketing.CreatorArtworkStudy", "en", "{v0}-hint"), { v0: String(id) })}>{text.hint}</p></div>
      <figcaption>{text.caption}</figcaption>
    </figure>
  );
}
