import { formatI18nTemplate, translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, Brush, Check, Clapperboard, Layers, LayoutGrid, Pause, Play, SlidersHorizontal, SwatchBook } from "lucide-react";
import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";

import { ATELIER_SCENES, ATELIER_SCENE_IDS, type AtelierLocale, type AtelierScene } from "./site-atelier-content";
import { useAtelierMotion } from "./use-atelier-motion";

import Link from "@/compat/router-link";
import "./atelier-workbench.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AtelierWorkbenchDemo", ko, en);

const ICONS = { ink: Brush, layers: Layers, panels: LayoutGrid, motion: Clapperboard, materials: SwatchBook };
const LAYERS = ["color", "line", "dialogue"] as const;
const LAYER_NAMES = { ko: ["채색", "선화 가이드", "대사"], en: ["Color", "Line guide", "Dialogue"] };
const MARKS = [
  "M18 45 C50 8 72 76 109 36 S176 18 221 42 S296 74 346 25",
  "M18 35 Q65 64 96 30 T180 41 T261 33 T346 42",
  "M18 40 C69 12 111 68 163 35 S259 13 346 45",
  "M18 54 Q62 5 106 47 T196 36 T280 46 T346 25",
];

/** Lightweight explanatory artwork; never imports editor state, engines or authoring data. */
export function AtelierWorkbenchDemo({ locale: _locale = "ko", initialScene = "ink" }: { locale?: AtelierLocale; initialScene?: AtelierScene }) {
  useBilingualI18nRevision();
  const id = useId();
  const [scene, setScene] = useState<AtelierScene>(initialScene);
  const [layers, setLayers] = useState({ color: true, line: true, dialogue: true });
  const [vertical, setVertical] = useState(false);
  const [camera, setCamera] = useState(35);
  const [manualCamera, setManualCamera] = useState(false);
  const [weight, setWeight] = useState(7);
  const [failedImage, setFailedImage] = useState("");
  const { hostRef, running, motionAllowed, paused, setPaused } = useAtelierMotion();

  const selected = ATELIER_SCENES[scene];
  const [label, title, description, action] = bi((selected).ko, (selected).en);
  const src = `/brand/atelier-${selected.image}.webp`;
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = event.key === "ArrowRight" ? (index + 1) % ATELIER_SCENE_IDS.length
      : event.key === "ArrowLeft" ? (index + ATELIER_SCENE_IDS.length - 1) % ATELIER_SCENE_IDS.length
        : event.key === "Home" ? 0 : event.key === "End" ? ATELIER_SCENE_IDS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setScene(ATELIER_SCENE_IDS[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus({ preventScroll: true });
  };
  return (
    <div ref={hostRef} className="atelier-workbench" data-scene={scene} data-running={running} data-manual-camera={manualCamera} data-testid="atelier-workbench" style={{ "--atelier-camera": camera, "--atelier-weight": weight } as CSSProperties}>
      <div className="atelier-workbench__topline"><span><SlidersHorizontal size={14} aria-hidden="true" />{bi("표현 방식 미리보기", "Explore an approach")}</span><span className="atelier-workbench__badge">{bi("인터랙티브 콘셉트 데모", "INTERACTIVE CONCEPT DEMO")}</span></div>
      <div className="atelier-workbench__tabs" role="tablist" aria-label={bi("드로잉 표현 방식", "Drawing approaches")}>
        {ATELIER_SCENE_IDS.map((key, index) => {
          const Icon = ICONS[key];
          return <button key={key} id={`${id}-${key}`} type="button" role="tab" aria-selected={scene === key} aria-controls={`${id}-panel`} tabIndex={scene === key ? 0 : -1} onClick={() => setScene(key)} onKeyDown={(event) => onTabKey(event, index)}><Icon size={17} aria-hidden="true" /><span>{bi((ATELIER_SCENES[key]).ko, (ATELIER_SCENES[key]).en)[0]}</span></button>;
        })}
      </div>
      <div id={formatI18nTemplate(translateCurrentStaticSourceText("shared.components.site.experience.AtelierWorkbenchDemo", "en", "{v0}-panel"), { v0: String(id) })} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${scene}`} className="atelier-workbench__panel">
        <div className="atelier-workbench__visual" data-color={layers.color} data-line={layers.line} data-dialogue={layers.dialogue} data-vertical={vertical}>
          {failedImage !== src ? <img className="atelier-workbench__art" src={src} width={1536} height={1024} loading="lazy" decoding="async" alt={bi(`${label} 표현을 설명하는 ToonStudio 브랜드 콘셉트 아트`, `ToonStudio brand concept art illustrating ${label.toLowerCase()}`)} onError={() => setFailedImage(src)} /> : <div className="atelier-workbench__fallback"><Brush size={42} aria-hidden="true" /><p>{bi("이미지 없이도 아래 조작과 설명을 살펴볼 수 있어요.", "You can still explore the controls and explanation without the image.")}</p></div>}
          {scene === "ink" && <div className="atelier-workbench__strokes" aria-hidden="true">{MARKS.map((mark, index) => <div key={mark}><span>0{index + 1}</span><svg viewBox="0 0 366 80"><path d={mark} pathLength={1} /></svg><small>{["INK", "GRAPHITE", "PIGMENT", "DRY BRUSH"][index]}</small></div>)}</div>}
          {scene === "layers" && <><div className="atelier-workbench__line-guide" aria-hidden="true"><i /><i /><i /></div><span className="atelier-workbench__dialogue" aria-hidden="true">{bi("이 장면은,\n나의 이야기.", "This scene.\nMy story.")}</span><span className="atelier-workbench__layer-count">{Object.values(layers).filter(Boolean).length} / 3 {bi("설명 레이어", "illustrative layers")}</span></>}
          {scene === "panels" && <div className="atelier-workbench__panels" aria-hidden="true">{["01", "02", "03"].map((number) => <div key={number}><span>{number}</span><i /></div>)}</div>}
          {scene === "motion" && <><div className="atelier-workbench__viewfinder" aria-hidden="true"><i /><i /><i /><i /><span>CAMERA STUDY / STILL ART</span></div><div className="atelier-workbench__timeline" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((frame) => <i key={frame} />)}<b /></div></>}
          {scene === "materials" && <div className="atelier-workbench__material-notes" aria-hidden="true"><span>01 / MARK MAKING</span><span>02 / COLOR STUDY</span><span>03 / WORLD BUILDING</span></div>}
          <span className="atelier-workbench__art-note">{bi("설명용 콘셉트 아트 · 실제 원고 아님", "Concept artwork · not an authored document")}</span>
        </div>
        <div className="atelier-workbench__detail">
          <p className="atelier-workbench__kicker">{selected.tag}</p><h3>{title}</h3><p>{description}</p>
          <div className="atelier-workbench__controls">
            {scene === "ink" && <label htmlFor={`${id}-weight`}><span>{bi("예시 선 굵기", "Example line weight")}<output>{weight}</output></span><input id={`${id}-weight`} type="range" min={2} max={16} value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></label>}
            {scene === "layers" && <div role="group" aria-label={bi("설명 레이어 표시", "Illustrative layer visibility")}>{LAYERS.map((layer, index) => <button key={layer} type="button" aria-pressed={layers[layer]} onClick={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}><Check size={14} aria-hidden="true" />{bi((LAYER_NAMES).ko, (LAYER_NAMES).en)[index]}</button>)}</div>}
            {scene === "panels" && <div role="group" aria-label={bi("컷 배치 예시", "Example panel arrangement")}><button type="button" aria-pressed={!vertical} onClick={() => setVertical(false)}>{bi("가로 흐름", "Horizontal")}</button><button type="button" aria-pressed={vertical} onClick={() => setVertical(true)}>{bi("세로 흐름", "Vertical")}</button></div>}
            {scene === "motion" && <label htmlFor={`${id}-camera`}><span>{bi("카메라 위치 직접 조절", "Scrub camera position")}<output>{camera}%</output></span><input id={`${id}-camera`} type="range" min={0} max={100} value={camera} onChange={(event) => { setCamera(Number(event.target.value)); setManualCamera(true); setPaused(true); }} /></label>}
            {scene === "materials" && <nav aria-label={bi("재료 탐색 경로", "Material destinations")}><Link href="/market/browse">{bi("리소스 마켓", "Resource market")}<ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/research/assets">{bi("오픈 소재 자료", "Open material references")}<ArrowUpRight size={14} aria-hidden="true" /></Link></nav>}
          </div>
          <Link href={selected.href} className="atelier-workbench__action">{action}<ArrowUpRight size={17} aria-hidden="true" /></Link>
          <div className="atelier-workbench__motion-control">{motionAllowed ? <button type="button" aria-pressed={paused} title={bi(paused ? "모션 다시 재생" : "현재 위치에서 모션 정지", paused ? "Resume motion" : "Pause at the current position")} onClick={() => { setManualCamera(false); setPaused((current) => !current); }}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{bi("모션 일시정지", "Pause motion")}</button> : <span>{bi("모션 감소 설정 적용 중", "Reduced-motion preference active")}</span>}<small>{bi("스튜디오 원고에는 영향을 주지 않습니다.", "Your studio documents are never changed.")}</small></div>
        </div>
      </div>
    </div>
  );
}
