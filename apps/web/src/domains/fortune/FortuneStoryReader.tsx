import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ComicCastPicker, ComicDialogue, ComicPortrait } from "@/shared/components/comic/ComicCast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { useMotionEnvironment } from "@/shared/components/comic/useMotionEnvironment";
import { fortuneCharacterDirection } from "./fortune-character-direction";
import "./fortune-character.css";
import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { TarotCardFace } from "./TarotCardFace";
import { fortuneSceneTheme, fortuneStoryScenes } from "./fortune-cinematic-model";

export function FortuneStoryReader({ reading, cast, onCastChange }: { reading: FortuneReading; cast?: ComicCastId; onCastChange?: (id: ComicCastId) => void }) {
  const scenes = fortuneStoryScenes(reading);
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const [localCast, setLocalCast] = useState<ComicCastId>("ara");
  const [largeText, setLargeText] = useState(false);
  const [reaction, setReaction] = useState(true);
  const { canAnimate } = useMotionEnvironment();
  const actor = cast ?? localCast;
  const chooseCast = (id: ComicCastId) => { setLocalCast(id); onCastChange?.(id); };
  const start = useRef<{ x: number; y: number } | null>(null);
  const position = Math.min(index, scenes.length - 1);
  const scene = scenes[position];
  const direction = fortuneCharacterDirection(reading, actor, position, position === scenes.length - 1);
  const theme = fortuneSceneTheme(reading.id);
  const move = (delta: number) => setIndex((current) => Math.max(0, Math.min(scenes.length - 1, Math.min(current, scenes.length - 1) + delta)));
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); setIndex(event.key === "Home" ? 0 : scenes.length - 1); }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || (event.target instanceof Element && event.target.closest("button, a, input"))) return;
    start.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const origin = start.current; start.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  };
  return <section className="fo-story-reader" data-theme={theme} data-still={still || !canAnimate} data-large-text={largeText} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "{v0} 웹툰 리더"), { v0: String(reading.title) })}>
    <div className="fo-story-top"><span>{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "en", "TOONSTUDIO ORIGINAL")}</span><button type="button" aria-pressed={still} onClick={() => setStill(!still)}><Sparkles size={14} />{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "컷 전환 효과 ")}{still ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "켜기") : translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "끄기")}</button></div>
    <div className="fo-cast-controls"><ComicCastPicker value={actor} onChange={chooseCast} /><div className="fo-cast-options"><button type="button" className="fo-button" aria-pressed={reaction} onClick={() => setReaction(!reaction)}>{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "캐릭터 리액션 ")}{reaction ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "끄기") : translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "켜기")}</button><button type="button" className="fo-button" aria-pressed={largeText} onClick={() => setLargeText(!largeText)}>{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "말풍선 글자 ")}{largeText ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "기본 크기") : translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "크게")}</button></div><p>{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "캐릭터의 말투와 연출만 바뀌며, 계산 결과는 같아요.")}</p></div>
    <p className="fo-story-status" role="status">{position + 1} / {scenes.length} {translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "컷 · ")}{scene.title}</p>
    <div className="fo-story-scene" key={`${position}-${actor}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null; }}>
      <div className="fo-story-illustration">
        <span className="fo-panel-index" aria-hidden="true">{String(position + 1).padStart(2, "0")}</span>
        {scene.card ? <div className="fo-story-tarot"><TarotCardFace card={scene.card} /></div> : <div className="fo-cast-portrait"><ComicPortrait cast={actor} large /><span className="fo-cast-sfx" aria-hidden="true">{direction.sfx}</span><span className="fo-cast-scene-label">{direction.label}</span></div>}
        <span className="fo-panel-caption">{scene.card ? `${scene.card.position} · ${scene.card.type === "upright" ? "정방향" : "역방향"}` : position === 0 ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "책장을 펼치는 순간") : position === scenes.length - 1 ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "en", "TO BE CONTINUED") : translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "한 컷씩 발견하는 나")}</span>
      </div>
      <div className="fo-story-narrative"><p className="fo-story-kicker">{reading.title} {translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "en", "· CHAPTER ")}{String(position + 1).padStart(2, "0")}</p><h4>{scene.title}</h4><ComicDialogue cast={actor} label={translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "오늘의 해설")}><p className="fo-character-lead">{direction.lead}</p><p className="fo-story-body">{scene.body}</p></ComicDialogue>{reaction && <ComicDialogue cast={direction.companion} aside label={translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "옆 컷의 한마디")}>{direction.reaction}</ComicDialogue>}{scene.items.length > 0 && <ul>{scene.items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>}</div>
    </div>
    <div className="fo-story-navigation"><button type="button" className="fo-button" onKeyDown={onKeyDown} onClick={() => move(-1)} disabled={position === 0}><ArrowLeft size={16} />{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "이전 컷")}</button><div className="fo-story-pages" aria-label={translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "읽을 컷 바로 선택")}>{scenes.map((item, i) => <button type="button" key={`${i}-${item.title}`} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "{v0}컷: {v1}"), { v0: String(i + 1), v1: String(item.title) })} aria-current={position === i ? translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "en", "step") : undefined} onKeyDown={onKeyDown} onClick={() => setIndex(i)}>{String(i + 1).padStart(2, "0")}</button>)}</div><button type="button" className="fo-button fo-primary" onKeyDown={onKeyDown} onClick={() => move(1)} disabled={position === scenes.length - 1}>{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "다음 컷")}<ArrowRight size={16} /></button></div>
    <p className="fo-story-help">{translateCurrentStaticSourceText("domains.fortune.FortuneStoryReader", "ko", "버튼으로 한 컷씩 · 모바일에서는 좌우로 넘기기 · 이동 버튼에서 ← → 키")}</p>
  </section>;
}
