import { useState } from "react";
import { ArrowRight, Brush, Eye, Layers3, MousePointer2, NotebookPen, Plus, Type, Users } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HOME_EDITOR_FRAMES, homeArt } from "./reference-home-content";

const DIALOGUE_MAX_LENGTH = 60;
const LAYERS = [
  ["대사", "Dialogue"],
  ["캐릭터", "Character"],
  ["효과", "Effects"],
  ["배경", "Background"],
  ["선화", "Line art"],
] as const;

/** 공개 홈의 로컬 편집기 미리보기. 사용자 프로젝트나 저장된 편집 상태와 연결하지 않는다. */
export function ReferenceEditorPreview() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const [frame, setFrame] = useState(0);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const visibleDialogue = dialogue ?? bi("…아직 끝나지 않았어.", "…This story isn't over.");
  const selected = HOME_EDITOR_FRAMES[frame] ?? HOME_EDITOR_FRAMES[0];
  return (
    <figure className="rd-editor" aria-labelledby="rd-editor-caption">
      <div className="rd-editor-heading">
        <Brush size={18} aria-hidden="true" /><strong>{bi("캔버스", "Canvas")}</strong>
        <span>{bi("회색의 도시 · 예시", "City in grey · Sample")}</span>
        <Link href="/studio/canvas" aria-label={bi("드로잉 작업 시작하기", "Start a drawing")}>{bi("작업 시작", "Start drawing")}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <div className="rd-editor-menubar" aria-hidden="true"><ToonStudioWordmark /><span>↶ · ↷ · ⌕</span><span>{bi("예시 컷 미리보기", "Sample panel preview")}</span><span>100%</span></div>
      <div className="rd-editor-body">
        <nav className="rd-editor-tools" aria-label={bi("캔버스 도구 바로가기", "Canvas tool shortcuts")}>
          <Link href="/studio/canvas" aria-label={bi("캔버스 열기", "Open canvas")}><MousePointer2 aria-hidden="true" /></Link>
          <Link href="/studio/canvas" aria-label={bi("그림 그리기", "Draw an illustration")}><Brush aria-hidden="true" /></Link>
          <Link href="/story-lab" aria-label={bi("스토리 기획 열기", "Open story planning")}><NotebookPen aria-hidden="true" /></Link>
          <Link href="/studio/assets/characters/new" aria-label={bi("캐릭터 도구 열기", "Open character tools")}><Users aria-hidden="true" /></Link>
          <Link href="/studio/assets" aria-label={bi("작품 소재 열기", "Open creative assets")}><Layers3 aria-hidden="true" /></Link>
        </nav>
        <div className="rd-editor-canvas">
          <img data-editor-selected-frame={frame + 1} src={homeArt(selected, 640)} srcSet={`${homeArt(selected, 320)} 320w, ${homeArt(selected, 640)} 640w`} sizes="(max-width: 599px) 75vw, 40vw" alt={bi(`예시 컷 ${frame + 1}`, `Sample panel ${frame + 1}`)} width={960} height={640} decoding="async" />
          <div className="rd-editor-panel-grid" aria-hidden="true"><img src={homeArt("storyboard", 320)} alt="" width={480} height={320} decoding="async" /><img src={homeArt("background-city", 320)} alt="" width={480} height={320} decoding="async" /></div>
          <span className="rd-editor-bubble">{visibleDialogue}</span>
          <div className="rd-editor-color" aria-hidden="true"><span /><i /><i /><i /><i /></div>
        </div>
        <div className="rd-editor-layers" aria-hidden="true">
          <strong><Layers3 size={12} />{bi("레이어", "Layers")}</strong><small>Normal · 100%</small>
          {LAYERS.map(([ko, en], index) => <span key={en}><i>{String(index + 1).padStart(2, "0")}</i><b>{bi(ko, en)}</b><Eye size={12} /></span>)}
        </div>
      </div>
      <div className="rd-editor-strip" role="group" aria-label={bi("예시 컷 선택", "Choose a sample panel")}>
        {HOME_EDITOR_FRAMES.map((image, index) => (
          <button type="button" key={image} aria-pressed={frame === index} aria-label={bi(`예시 컷 ${index + 1} 선택`, `Select sample panel ${index + 1}`)} onClick={() => setFrame(index)}>
            <img src={homeArt(image, 320)} alt="" width={120} height={80} decoding="async" /><small>{index + 1}</small>
          </button>
        ))}
        <Link href="/studio/new" aria-label={bi("내 작품에 새 컷 만들기", "Create a panel in your own work")}><Plus size={18} aria-hidden="true" /></Link>
      </div>
      <label className="rd-dialogue"><Type size={14} aria-hidden="true" /><span>{bi("예시 대사 편집", "Edit sample dialogue")}</span><input value={visibleDialogue} maxLength={DIALOGUE_MAX_LENGTH} onChange={(event) => setDialogue(event.target.value)} /></label>
      <figcaption id="rd-editor-caption"><strong>{bi("그리는 순간, 이야기가 살아납니다.", "Draw your story into life.")}</strong><small>{bi("편집기 콘셉트 · 예시는 저장되지 않아요", "Editor concept · Samples are not saved")}</small></figcaption>
    </figure>
  );
}
