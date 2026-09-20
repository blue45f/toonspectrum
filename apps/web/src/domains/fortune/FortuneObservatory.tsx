import { ComicDialogue } from "@/shared/components/comic/ComicCast";
import { comicCast } from "@/shared/components/comic/comic-cast";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Search, Star, Sparkles, BookOpen, Trash2, BookmarkPlus } from "lucide-react";
import { FORTUNE_EXPERIENCES, FORTUNE_GROUPS, FORTUNE_DISCLAIMER, buildFortuneReading, fortuneKstDate, fortuneReadingText } from "@toonspectrum/core/fortune";
import type { FortuneBirthInput, FortuneGroup, FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneBirthFields } from "./FortuneBirthFields";
import { FortuneReadingView } from "./FortuneReadingView";
import { readFortunePreferences, writeFortunePreferences, clearFortunePreferences } from "./fortune-observatory-storage";
import type { FortunePreferences } from "./fortune-observatory-storage";
import { FortuneStoryPortal, FortuneJourney } from "./FortuneStoryPortal";
import { FortuneInteractiveDeck } from "./FortuneInteractiveDeck";
import { FortuneSceneArt } from "./FortuneSceneArt";
import { fortuneSceneTheme } from "./fortune-cinematic-model";
import { FortuneAmbientLayer, FortuneExperienceArt } from "./FortuneVisuals";
import "./fortune-observatory.css";
import "./fortune-cinematic.css";

export function FortuneObservatory({ characterContent }: { characterContent?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("content") ?? "";
  const cast = comicCast(params.get("cast")).id;
  const changeCast = (id: ComicCastId) => { const next = new URLSearchParams(params); next.set("cast", id); setParams(next, { replace: true }); };
  const selected = FORTUNE_EXPERIENCES.find((item) => item.id === requested);
  const [group, setGroup] = useState<FortuneGroup>("전체"), [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false), [preferences, setPreferences] = useState(readFortunePreferences);
  const [birth, setBirth] = useState<FortuneBirthInput>({ date: "", calendar: "solar" });
  const [partner, setPartner] = useState<FortuneBirthInput>({ date: "", calendar: "solar" });
  const [date, setDate] = useState(fortuneKstDate), [month, setMonth] = useState(() => fortuneKstDate().slice(0, 7));
  const [year, setYear] = useState(() => Number(fortuneKstDate().slice(0, 4))), [question, setQuestion] = useState("");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward"), [pick, setPick] = useState<number | null>(null);
  const [tarotDeck, setTarotDeck] = useState<"major-22" | "full-78">("major-22");
  const [reading, setReading] = useState<FortuneReading | null>(null), [running, setRunning] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [notebookOpen, setNotebookOpen] = useState(false);
  const sequence = useRef(0), resultHeading = useRef<HTMLHeadingElement>(null), workHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { sequence.current += 1; setReading(null); setError(""); setRunning(false); setPick(null); if (requested) workHeading.current?.focus({ preventScroll: true }); return () => { sequence.current += 1; }; }, [requested]);
  useEffect(() => { if (reading) resultHeading.current?.focus({ preventScroll: true }); }, [reading]);
  const navigate = (id: string) => { setParams(id ? { content: id, cast } : { cast }); if (id) requestAnimationFrame(() => document.getElementById("fortune-workbench")?.scrollIntoView({ block: "start" })); };
  const persist = (next: FortunePreferences) => { setPreferences(next); const stored = writeFortunePreferences(next); if (!stored) setNotice("이 브라우저에서 저장이 제한되어 있어요. 현재 화면에서만 유지됩니다."); return stored; };
  const favorite = (id: string) => persist({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter((v) => v !== id) : [...preferences.favorites, id] });
  const saveReading = () => { if (!reading) return; const entry = { id: `${reading.id}-${Date.now()}`, title: reading.title, text: fortuneReadingText(reading), savedAt: fortuneKstDate() }; const stored = persist({ ...preferences, notebook: [entry, ...preferences.notebook].slice(0, 12) }); if (stored) setNotice("생일·시간·꿈 원문을 제외한 해석을 이 브라우저의 보관함에 추가했어요."); };
  const invalidateReading = () => { sequence.current += 1; setReading(null); setRunning(false); setError(""); };
  const clearInputs = () => { sequence.current += 1; setBirth({ date: "", calendar: "solar" }); setPartner({ date: "", calendar: "solar" }); setQuestion(""); setPick(null); setReading(null); setError(""); setRunning(false); setNotice("현재 입력과 결과를 지웠어요."); };
  const clearSaved = () => { const ok = clearFortunePreferences(); setPreferences({ favorites: [], notebook: [] }); setNotice(ok ? "관측소의 즐겨찾기와 보관함을 모두 지웠어요." : "브라우저 저장소를 지울 수 없어요. 브라우저 설정에서 사이트 데이터를 확인해 주세요."); };
  const run = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || running) return;
    if (selected.id.startsWith("tarot") && pick === null) { setError("마음이 가는 카드를 먼저 골라 주세요."); return; }
    const request = ++sequence.current; setRunning(true); setError(""); setReading(null);
    try { const result = await buildFortuneReading(selected.id, { birth, partner, date, month, year, question, pick: pick ?? 0, cycleDirection: direction, tarotDeck }); if (request === sequence.current) setReading(result); }
    catch (cause) { if (request === sequence.current) setError(cause instanceof Error ? cause.message : "입력값을 확인하고 다시 열어 주세요."); }
    finally { if (request === sequence.current) setRunning(false); }
  };
  const visible = FORTUNE_EXPERIENCES.filter((item) => (group === "전체" || item.group === group) && (!favoritesOnly || preferences.favorites.includes(item.id)) && `${item.title} ${item.subtitle} ${item.tag} ${item.group}`.includes(search.trim()));
  if (requested === "character") return <div className="fortune-observatory fo-legacy"><button type="button" className="fo-button" onClick={() => navigate("")}><ArrowLeft size={16} />운세 관측소로</button><p className="fo-safety">{FORTUNE_DISCLAIMER}</p>{characterContent}</div>;
  return <div className="fortune-observatory" data-fortune-experience="cinematic-v2">
    <FortuneAmbientLayer theme={selected ? fortuneSceneTheme(selected.id) : "violet"} />
    <FortuneStoryPortal onNavigate={navigate} compact={Boolean(selected)} cast={cast} onCastChange={changeCast} />
    <p className="fo-safety">{FORTUNE_DISCLAIMER}</p>
    {requested && !selected && <p role="status" className="fo-help">알 수 없는 콘텐츠 주소입니다. 아래에서 원하는 운세를 선택해 주세요.</p>}
    {selected && <section className="fo-workbench" id="fortune-workbench" data-theme={fortuneSceneTheme(selected.id)} data-running={running} aria-labelledby="fortune-work-title">
      <div className="fo-work-head"><div className="fo-work-copy"><p className="fo-eyebrow">{selected.group} · {selected.tag}</p><h2 id="fortune-work-title" ref={workHeading} tabIndex={-1}>{selected.glyph} {selected.title}</h2><p>{selected.subtitle}</p></div><div className="fo-work-visual"><FortuneExperienceArt experience={selected} compact /></div><button type="button" className="fo-icon-button" onClick={() => navigate("")} aria-label="콘텐츠 선택으로 돌아가기"><ArrowLeft size={19} /></button></div>
      <FortuneJourney hasReading={Boolean(reading)} running={running} />
      {!reading && <ComicDialogue cast={cast}>{comicCast(cast).intro} {selected.title}의 단서를 준비하고, 아래 버튼으로 첫 컷을 열어 주세요.</ComicDialogue>}
      <form onSubmit={run} className="fo-form" aria-busy={running}>
        {(selected.input === "birth" || selected.input === "pair") && <FortuneBirthFields label={selected.input === "pair" ? "나의 생년월일" : "생년월일로 시작하기"} value={birth} onChange={(value) => { setBirth(value); invalidateReading(); }} />}
        {selected.input === "pair" && <FortuneBirthFields label="상대의 생년월일" value={partner} onChange={(value) => { setPartner(value); invalidateReading(); }} />}
        {selected.input === "dream" && <label className="fo-dream-label" htmlFor="fo-dream">기억나는 꿈의 장면<textarea id="fo-dream" value={question} onChange={(e) => { setQuestion(e.target.value); invalidateReading(); }} required maxLength={600} rows={4} placeholder="예: 달빛이 비치는 바다에서 고양이와 여행했어요." /><span className="fo-help">한국어 상징 검색 · 최대 600자 · 진단이나 길흉 예측이 아닙니다.</span></label>}
        {selected.input === "dream" && <div className="fo-dream-prompts" aria-label="꿈의 상징 입력 도움">{["고양이", "바다", "하늘", "나무", "집"].map((symbol) => <button type="button" key={symbol} onClick={() => { setQuestion((current) => `${current}${current ? " " : ""}${symbol}`.slice(0, 600)); invalidateReading(); }}>+ {symbol}</button>)}</div>}
        {["cookie", "rest", "lucky"].includes(selected.id) && <div className="fo-symbol-prelude"><FortuneSceneArt theme={fortuneSceneTheme(selected.id)} closeup /><div><h3>{selected.id === "cookie" ? "오늘, 나에게 도착한 작은 문장" : selected.id === "rest" ? "쉬어 가는 컷도 필요하니까" : "다음 장면을 물들일 색을 만나세요"}</h3><p>생년월일 없이 가볍게 시작해요. 아래 버튼으로 첫 장을 펼쳐 보세요.</p></div></div>}
        <div className="fo-query-fields">
          {(["almanac", "monthly"].includes(selected.id)) && <label htmlFor="fo-month">조회할 달<input id="fo-month" type="month" value={month} required min="1900-01" max="2050-12" onChange={(e) => { setMonth(e.target.value); invalidateReading(); }} /></label>}
          {(["yearly", "terms"].includes(selected.id)) && <label htmlFor="fo-year">조회 연도<input id="fo-year" type="number" value={year} required min={1900} max={2050} onChange={(e) => { setYear(Number(e.target.value)); invalidateReading(); }} /></label>}
          {(["today", "tomorrow", "weekly", "romance", "money", "career", "study", "creative", "zodiac", "tarot", "tarot-three"].includes(selected.id)) && <label htmlFor="fo-date">기준 날짜<input id="fo-date" type="date" value={date} required min="1900-01-01" max="2050-12-24" onChange={(e) => { setDate(e.target.value); invalidateReading(); }} /></label>}
          {selected.id === "cycles" && <label htmlFor="fo-direction">대운 진행 방향<select id="fo-direction" value={direction} onChange={(e) => { setDirection(e.target.value === "reverse" ? "reverse" : "forward"); invalidateReading(); }}><option value="forward">순행 (직접 선택)</option><option value="reverse">역행 (직접 선택)</option></select><span className="fo-help">성별로 자동 판정하지 않습니다.</span></label>}
        </div>
        {selected.id.startsWith("tarot") && <label htmlFor="fo-tarot-deck">타로 덱<select id="fo-tarot-deck" value={tarotDeck} onChange={(event) => { setTarotDeck(event.target.value === "full-78" ? "full-78" : "major-22"); setPick(null); invalidateReading(); }}><option value="major-22">기존 메이저 22장</option><option value="full-78">전체 78장 · 창작 질문</option></select><span className="fo-help">선택한 덱의 카드 뒷면에서 한 장을 고르면 결과를 엽니다. 같은 날짜·덱·위치는 같은 결과입니다.</span></label>}
        {selected.id.startsWith("tarot") && <FortuneInteractiveDeck key={`${selected.id}:${tarotDeck}`} size={tarotDeck === "full-78" ? 78 : 22} value={pick} onChange={(value) => { setPick(value); invalidateReading(); }} three={selected.id === "tarot-three"} />}
        <div className="fo-form-actions"><button className="fo-button fo-primary" type="submit" disabled={running}>{running ? "해석을 펼치고 있어요…" : `${selected.title} 열기`}<ArrowRight size={16} /></button><button type="button" className="fo-button" onClick={clearInputs}>입력·결과 지우기</button><span>추가 요금 · API 키 · 가입 없이</span></div>
        {running && <div className="fo-analysis-sequence" role="status" aria-live="polite"><div className="fo-analysis-sigil"><span>{selected.glyph}</span><i /></div><div><strong>당신의 단서를 한 장면씩 읽고 있어요</strong><p>입력 확인 → 상징 계산 → 관계 연결 → 해석 구성</p><div className="fo-analysis-track"><i /></div></div></div>}
        {error && <p role="alert" className="fo-error">{error}</p>}
      </form>
      {reading && <div className="fo-result-wrap"><div className="fo-result-toolbar"><h2 ref={resultHeading} tabIndex={-1}>나의 해석 리포트</h2><button type="button" className="fo-button" onClick={saveReading}><BookmarkPlus size={16} />해석 보관</button></div><p className="fo-help">‘해석 보관’을 누를 때만 저장합니다. 생일·시간·꿈 원문은 저장하지 않아요.</p><FortuneReadingView key={`${reading.id}-${reading.generatedFor}-${sequence.current}`} reading={reading} cast={cast} onCastChange={changeCast} /></div>}
    </section>}
    <section className="fo-discover" aria-labelledby="fo-discover-title"><div className="fo-discover-head"><div><p className="fo-eyebrow">CHOOSE YOUR CHAPTER</p><h2 id="fo-discover-title">오늘은 무엇이 궁금한가요?</h2><p>전통에서 일상까지, 나에게 맞는 발견을 골라 보세요.</p></div><button type="button" className="fo-button" onClick={() => { setNotebookOpen(!notebookOpen); if (!notebookOpen) requestAnimationFrame(() => { const notebook = document.getElementById("fo-notebook"); notebook?.scrollIntoView({ block: "start" }); notebook?.focus({ preventScroll: true }); }); }} aria-expanded={notebookOpen}><BookOpen size={16} />나의 보관함 {preferences.notebook.length}</button></div>
      <div className="fo-search-row"><label className="fo-search"><Search size={18} /><span className="sr-only">운세 콘텐츠 검색</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="만세력, 궁합, 타로…" type="search" /></label><button type="button" className="fo-button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}><Star size={16} />즐겨찾기 {preferences.favorites.length}</button></div>
      <div className="fo-filters" aria-label="콘텐츠 카테고리">{FORTUNE_GROUPS.map((name) => <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
      <p className="fo-count" role="status">{visible.length}개의 콘텐츠</p>
      <div className="fo-catalog">{visible.map((item, i) => <article key={item.id} className="fo-experience" data-group={item.group} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}><button type="button" className="fo-experience-open" onClick={() => navigate(item.id)} aria-label={`${item.title} 살펴보기`}><span className="fo-card-top"><span className="fo-glyph" aria-hidden="true">{item.glyph}</span><small>{item.tag}</small></span><FortuneExperienceArt experience={item} compact /><h3>{item.title}</h3><p>{item.subtitle}</p><span className="fo-card-bottom">{item.group}<ArrowRight size={16} /></span></button><button type="button" className="fo-favorite" onClick={() => favorite(item.id)} aria-pressed={preferences.favorites.includes(item.id)} aria-label={`${item.title} 즐겨찾기`}><Star size={16} fill={preferences.favorites.includes(item.id) ? "currentColor" : "none"} /></button></article>)}</div>
      {!visible.length && <div className="fo-empty"><Sparkles size={28} /><h3>아직 찾지 못한 이야기</h3><p>다른 검색어나 카테고리로 살펴보세요.</p><button className="fo-button" type="button" onClick={() => { setSearch(""); setGroup("전체"); setFavoritesOnly(false); }}>전체 콘텐츠 보기</button></div>}
    </section>
    {notebookOpen && <section className="fo-notebook" id="fo-notebook" tabIndex={-1} aria-label="나의 운세 보관함"><div className="fo-discover-head"><div><h2>나의 보관함</h2><p>이 브라우저에 저장한 해석 텍스트 · 최근 12개</p></div><button type="button" className="fo-button" onClick={clearSaved}><Trash2 size={15} />즐겨찾기·보관함 비우기</button></div>{preferences.notebook.length ? preferences.notebook.map((entry) => <details key={entry.id}><summary>{entry.title} · {entry.savedAt}</summary><pre>{entry.text}</pre><button type="button" className="fo-button" onClick={() => persist({ ...preferences, notebook: preferences.notebook.filter((n) => n.id !== entry.id) })}>이 기록 삭제</button></details>) : <p className="fo-help">결과에서 ‘해석 보관’을 누르면 이곳에 모입니다. 저장은 선택이며 언제든 지울 수 있어요.</p>}</section>}
    <section className="fo-character-callout"><div><p className="fo-eyebrow">A DIFFERENT WAY TO READ</p><h2>캐릭터가 읽어 주는 나의 이야기</h2><p>아라·단우·레오나·가온의 웹툰 해설, 타로와 독서 처방도 만나보세요.</p></div><button type="button" className="fo-button" onClick={() => navigate("character")}>캐릭터 웹툰 운세 <ArrowRight size={17} /></button></section>
    <p className="fo-notice" role="status" aria-live="polite">{notice}</p>
    <footer className="fo-footer"><strong>정해진 운명보다, 내가 만드는 다음 장면.</strong><p>{FORTUNE_DISCLAIMER}</p><p>브라우저 로컬 계산 · 한국 표준시 · 1900~2050년 · 최초 페이지 로드에는 연결이 필요합니다.</p></footer>
  </div>;
}
