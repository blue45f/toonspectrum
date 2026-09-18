import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { PlayComicGuide } from "./PlayComicGuide";
import { comicCast } from "@/shared/components/comic/comic-cast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { ArrowLeft, ArrowRight, Check, Clock3, Heart, Search, Shuffle, Sparkles, Trophy } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { findGame, PLAY_GAMES } from "./game-registry";
import { freshSeed, koreaDay, promptFor, randomFrom, safeSeed } from "./lab/creative-core";
import { PlayArtwork } from "./lab/PlayArtwork";
import { PlayGameBoundary } from "./lab/PlayGameBoundary";
import { recordVisit, usePlayJournal } from "./lab/play-storage";
import "./play-lab.css";

import { Container } from "@/shared/components/section";
import { SharePageButton } from "@/shared/components/share-page-button";

const FILTERS = [["all", "전체"], ["draw", "드로잉"], ["story", "스토리"], ["sense", "색감"], ["arcade", "아케이드"], ["favorites", "즐겨찾기"]] as const;
export function PlayPage() {
  const [params, setParams] = useSearchParams();
  const cast = comicCast(params.get("cast")).id;
  const changeCast = (id: ComicCastId) => { const next = new URLSearchParams(params); next.set("cast", id); setParams(next, { replace: true }); };
  const activeId = params.get("game") ?? undefined; const active = findGame(activeId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { journal, toggleFavorite, warning } = usePlayJournal();
  const [today, setToday] = useState(koreaDay);
  const query = (params.get("q") ?? "").slice(0, 80);
  const tab = FILTERS.some(([id]) => id === params.get("tab")) ? params.get("tab")! : "all";
  const daily = promptFor(today);
  useEffect(() => { const id = window.setInterval(() => setToday(koreaDay()), 60000); return () => clearInterval(id); }, []);
  useEffect(() => { document.title = active ? `${active.label} · 놀이터 · ToonStudio` : "창작 놀이터 · ToonStudio"; }, [active]);
  useEffect(() => { headingRef.current?.focus(); if (activeId && findGame(activeId)) recordVisit(activeId); }, [activeId]);
  const changeFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true });
  };
  const openGame = (id: string, seed?: string) => {
    const next = new URLSearchParams(params); next.set("game", id); next.delete("seed"); next.delete("idea");
    if (seed) next.set("seed", seed); setParams(next);
  };
  const exitGame = () => { const next = new URLSearchParams(params); next.delete("game"); next.delete("seed"); next.delete("idea"); setParams(next); };
  const filtered = PLAY_GAMES.filter((game) => {
    const matchesTab = tab === "all" || (tab === "favorites" ? journal.favorites.includes(game.id) : (game.collection ?? "arcade") === tab);
    return matchesTab && `${game.label} ${game.tagline} ${game.category}`.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR"));
  });
  const todayResults = journal.results.filter((result) => result.day === today);
  const dailyDone = todayResults.some((result) => result.game === "sketch-sprint" && result.label === daily[0]);
  if (active) {
    const { Component: Game } = active;
    return <Container className="play-page play-active">
      <div className="play-active-navigation"><button type="button" className="play-back" onClick={exitGame}><ArrowLeft size={17} />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "놀이터")}</button><Link to="/studio" className="play-text-link">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "전문 작업실 ↗")}</Link></div>
      <header className="play-game-heading"><div><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "TOONSTUDIO PLAY / ")}{active.localOnly ? translateCurrentStaticSourceText("domains.play.PlayPage", "en", "CREATIVE LAB") : translateCurrentStaticSourceText("domains.play.PlayPage", "en", "ARCADE")}</span><h1 ref={headingRef} tabIndex={-1}><active.Icon className="h-7 w-7" />{active.label}</h1><p>{active.tagline}</p></div>
        <button type="button" className="play-button" aria-pressed={journal.favorites.includes(active.id)} onClick={() => toggleFavorite(active.id)}><Heart size={16} fill={journal.favorites.includes(active.id) ? translateCurrentStaticSourceText("domains.play.PlayPage", "en", "currentColor") : translateCurrentStaticSourceText("domains.play.PlayPage", "en", "none")} />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "즐겨찾기")}</button>
      </header>
      {warning && <p className="play-warning" role="status">{warning}</p>}
      <PlayComicGuide key={active.id} cast={cast} onChange={changeCast} game={active.id} />
      <PlayGameBoundary key={`${active.id}:${safeSeed(params.get("seed"))}:${(params.get("idea") ?? "").slice(0, 30)}`} onExit={exitGame}>
        <Suspense fallback={<div className="play-loading" role="status"><div /><div /><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "창작 도구를 준비하고 있어요…")}</p></div>}><Game onExit={exitGame} seed={safeSeed(params.get("seed"))} /></Suspense>
      </PlayGameBoundary>
    </Container>;
  }
  return <Container className="play-page">
    {activeId && <div className="play-warning" role="status">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "선택한 콘텐츠를 찾지 못했습니다. 아래에서 다른 창작 도구를 골라 주세요.")}</div>}
    <section className="play-hero" aria-labelledby="play-title">
      <div className="play-hero-copy"><span className="play-eyebrow"><Sparkles size={15} /> {translateCurrentStaticSourceText("domains.play.PlayPage", "en", "TOONSTUDIO / CREATIVE PLAYGROUND")}</span>
        <h1 ref={headingRef} tabIndex={-1} id="play-title">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "놀다 보면,")}<br /><em>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "다음 컷")}</em>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "이 떠오른다.")}</h1>
        <p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "잘 그리려는 마음은 잠시 내려놓고.")}<br />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "선을 긋고, 색을 고르고, 이야기를 굴려 보세요.")}<br />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "작은 놀이가 나만의 작품으로 이어지는 창작 놀이터.")}</p>
        <div className="play-actions"><button type="button" className="play-button primary large" onClick={() => openGame("sketch-sprint", today)}>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "오늘의 드로잉 시작 ")}<ArrowRight size={18} /></button><a className="play-text-link" href="#play-library">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "모든 콘텐츠 둘러보기 ↓")}</a></div>
        <div className="play-hero-notes"><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "로그인 없이 시작")}</span><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "창작 도구 ")}{PLAY_GAMES.filter((game) => game.localOnly).length}{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "종")}</span><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "브라우저에서 직접 창작")}</span></div>
      </div>
      <div className="play-hero-art"><span className="play-art-label">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "LESS PRESSURE. MORE PLAY.")}</span><PlayArtwork kind="hero" /><span className="play-art-caption">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "한 번의 낙서가, 이야기의 시작.")}</span></div>
    </section>
    <PlayComicGuide cast={cast} onChange={changeCast} />
    <section className="play-daily-row" aria-label={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "오늘의 창작과 내 기록")}>
      <div className="play-daily"><div className="play-daily-label"><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "DAILY CREATIVE PROMPT")}</span><time dateTime={today}>{today.replaceAll("-", ".") } {translateCurrentStaticSourceText("domains.play.PlayPage", "en", "· KST")}</time></div><div className="play-daily-body"><div><h2>{daily[0]}</h2><p>{daily[1]}</p></div><button className="play-button" type="button" onClick={() => openGame("sketch-sprint", today)}>{dailyDone ? <Check size={16} /> : <Clock3 size={16} />}{dailyDone ? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "다시 그려 보기") : translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "60초 도전")}</button></div></div>
      <div className="play-journal"><span className="play-eyebrow"><Trophy size={14} /> {translateCurrentStaticSourceText("domains.play.PlayPage", "en", "MY CREATIVE LOG")}</span><div className="play-journal-counts"><div><strong>{todayResults.length}</strong><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "오늘 완료")}</span></div><div><strong>{journal.results.length}</strong><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "완료 기록 · 최근 100개")}</span></div><div><strong>{journal.favorites.filter((id) => findGame(id)).length}</strong><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "즐겨찾기")}</span></div></div><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "이 브라우저에만 보관되는 나의 기록")}</p></div>
    </section>
    {journal.recent.some((id) => findGame(id)) && <nav className="play-recent" aria-label={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "최근 즐긴 콘텐츠")}><span>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "다시 이어서")}</span>{journal.recent.filter((id) => findGame(id)).slice(0, 4).map((id) => <button type="button" key={id} onClick={() => openGame(id)}>{findGame(id)!.label}<ArrowRight size={13} /></button>)}</nav>}
    <section id="play-library" className="play-library" aria-labelledby="play-library-heading">
      <header className="play-library-heading"><div><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "PICK YOUR PLAY")}</span><h2 id="play-library-heading">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "지금, 어떤 걸 해 볼까요?")}</h2><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "창작 근육을 깨우는 작은 실험부터, 가볍게 즐기는 웹툰 게임까지.")}</p></div><button className="play-button" type="button" disabled={!filtered.length} onClick={() => openGame(filtered[Math.floor(randomFrom(freshSeed())() * filtered.length)].id)}><Shuffle size={16} />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "하나 골라 주세요")}</button></header>
      <div className="play-filter-row"><div className="play-filter-tabs" aria-label={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "콘텐츠 분류")}>{FILTERS.map(([id, label]) => <button className="play-chip" type="button" key={id} aria-pressed={tab === id} onClick={() => changeFilter("tab", id === "all" ? "" : id)}>{label}{id === "all" && <span>{PLAY_GAMES.length}</span>}</button>)}</div><label className="play-search"><Search size={16} /><span className="sr-only">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "놀이터 콘텐츠 검색")}</span><input type="search" value={query} maxLength={80} placeholder={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "드로잉, 콘티, 퀴즈 검색")} onChange={(event) => changeFilter("q", event.target.value)} /></label></div>
      {warning && <p className="play-warning" role="status">{warning}</p>}
      <p className="sr-only" role="status">{filtered.length}{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "개 콘텐츠")}</p>
      <ul className="play-card-grid">{filtered.map((game, index) => <li key={game.id}><article className="play-content-card">
        <button type="button" className="play-card-open" onClick={() => openGame(game.id)}><div className="play-card-art"><PlayArtwork kind={game.id} /><span className="play-card-index">{String(index + 1).padStart(2, "0")}</span>{game.localOnly && <span className="play-local-badge">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "LOCAL CREATIVE")}</span>}</div><div className="play-card-body"><div className="play-card-category"><span>{game.category}</span><span><Clock3 size={12} />{game.duration ?? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "3–5분")}</span></div><h3>{game.label}<ArrowRight size={17} /></h3><p>{game.tagline}</p><span className="play-card-mode">{game.localOnly ? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "서버 호출 없는 창작 · 결과물/기록 보관") : game.usesCamera ? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "카메라·음성 선택 사용 · 버튼 지원") : translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "웹툰 카탈로그 기반 미니게임")}</span></div></button>
        <button type="button" className="play-card-favorite" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "{v0} 즐겨찾기"), { v0: String(game.label) })} aria-pressed={journal.favorites.includes(game.id)} onClick={() => toggleFavorite(game.id)}><Heart size={17} fill={journal.favorites.includes(game.id) ? translateCurrentStaticSourceText("domains.play.PlayPage", "en", "currentColor") : translateCurrentStaticSourceText("domains.play.PlayPage", "en", "none")} /></button>
      </article></li>)}</ul>
      {!filtered.length && <div className="play-empty"><Search size={28} /><h3>{tab === "favorites" ? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "좋아하는 콘텐츠를 모아 보세요.") : translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "검색한 콘텐츠가 없어요.")}</h3><p>{tab === "favorites" ? translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "카드의 하트 버튼을 누르면 여기에 모입니다.") : translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "다른 검색어나 분류로 새 놀이를 찾아 보세요.")}</p><button type="button" className="play-button" onClick={() => { const next = new URLSearchParams(params); next.delete("tab"); next.delete("q"); next.delete("game"); setParams(next, { replace: true }); }}>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "전체 콘텐츠 보기")}</button></div>}
    </section>
    <section className="play-next-step"><div><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.PlayPage", "en", "FROM PLAY TO YOUR NEXT PANEL")}</span><h2>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "마음에 드는 낙서 하나,")}<br />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "다음 작품의 첫 컷으로.")}</h2><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "스케치는 PNG·SVG, 팔레트는 CSS, 콘티는 수정 가능한 파일로.")}<br />{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "놀이의 결과를 작업 자료로 남기고 전문 스튜디오로 이어가세요.")}</p></div><div className="play-actions"><Link to="/studio" className="play-button primary large">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "드로잉 스튜디오 열기 ")}<ArrowRight size={17} /></Link><Link to="/learn" className="play-text-link">{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "배우며 이어가기 ↗")}</Link></div></section>
    <footer className="play-footer"><div><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "새 창작 콘텐츠는 로딩 후 서버·AI API 호출 없이 실행됩니다. 첫 방문과 아직 열지 않은 도구의 로딩에는 인터넷이 필요합니다. 브라우저 데이터 삭제 시 로컬 초안과 기록도 사라지므로 결과 파일을 보관해 주세요.")}</p><p>{translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "기존 웹툰 게임은 공개 카탈로그 메타데이터를 사용합니다. 표지는 출처·성인 제외·비표시 정책을 따르며 일부 인기 지표는 추정값(≈)입니다. 카드 그림은 오리지널 기능 안내 일러스트입니다.")}</p></div><SharePageButton path="/play" text={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "ToonStudio 창작 놀이터 — 드로잉·색감·스토리 실험")} label={translateCurrentStaticSourceText("domains.play.PlayPage", "ko", "놀이터 공유")} /></footer>
  </Container>;
}
export default PlayPage;
