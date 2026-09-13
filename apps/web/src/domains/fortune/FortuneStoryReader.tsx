import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneSceneArt } from "./FortuneSceneArt";
import { TarotCardFace } from "./TarotCardFace";
import { fortuneSceneTheme, fortuneStoryScenes } from "./fortune-cinematic-model";

export function FortuneStoryReader({ reading }: { reading: FortuneReading }) {
  const scenes = fortuneStoryScenes(reading);
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const scene = scenes[index];
  const theme = fortuneSceneTheme(reading.id);
  const move = (delta: number) => setIndex((current) => Math.max(0, Math.min(scenes.length - 1, current + delta)));
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
  return <section className="fo-story-reader" data-theme={theme} data-still={still} aria-label={`${reading.title} 웹툰 리더`}>
    <div className="fo-story-top"><span>TOONSTUDIO ORIGINAL</span><button type="button" aria-pressed={still} onClick={() => setStill(!still)}><Sparkles size={14} />컷 전환 효과 {still ? "켜기" : "끄기"}</button></div>
    <p className="fo-story-status" role="status">{index + 1} / {scenes.length} 컷 · {scene.title}</p>
    <div className="fo-story-scene" key={index} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null; }}>
      <div className="fo-story-illustration">
        <span className="fo-panel-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        {scene.card ? <div className="fo-story-tarot"><TarotCardFace card={scene.card} /></div> : <FortuneSceneArt theme={theme} closeup />}
        <span className="fo-panel-caption">{scene.card ? `${scene.card.position} · ${scene.card.type === "upright" ? "정방향" : "역방향"}` : index === 0 ? "책장을 펼치는 순간" : index === scenes.length - 1 ? "TO BE CONTINUED" : "한 컷씩 발견하는 나"}</span>
      </div>
      <div className="fo-story-narrative"><p className="fo-story-kicker">{reading.title} · CHAPTER {String(index + 1).padStart(2, "0")}</p><h4>{scene.title}</h4><p className="fo-story-body">{scene.body}</p>{scene.items.length > 0 && <ul>{scene.items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>}</div>
    </div>
    <div className="fo-story-navigation"><button type="button" className="fo-button" onKeyDown={onKeyDown} onClick={() => move(-1)} disabled={index === 0}><ArrowLeft size={16} />이전 컷</button><div className="fo-story-pages" aria-label="읽을 컷 바로 선택">{scenes.map((item, i) => <button type="button" key={`${i}-${item.title}`} aria-label={`${i + 1}컷: ${item.title}`} aria-current={index === i ? "step" : undefined} onKeyDown={onKeyDown} onClick={() => setIndex(i)}>{String(i + 1).padStart(2, "0")}</button>)}</div><button type="button" className="fo-button fo-primary" onKeyDown={onKeyDown} onClick={() => move(1)} disabled={index === scenes.length - 1}>다음 컷<ArrowRight size={16} /></button></div>
    <p className="fo-story-help">버튼으로 한 컷씩 · 모바일에서는 좌우로 넘기기 · 이동 버튼에서 ← → 키</p>
  </section>;
}
