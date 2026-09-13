import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Search, Star, ShieldCheck, Sparkles, BookOpen, Trash2, BookmarkPlus } from "lucide-react";
import { FORTUNE_EXPERIENCES, FORTUNE_GROUPS, FORTUNE_DISCLAIMER, buildFortuneReading, fortuneKstDate, fortuneReadingText } from "@toonspectrum/core/fortune";
import type { FortuneBirthInput, FortuneGroup, FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneBirthFields } from "./FortuneBirthFields";
import { FortuneReadingView } from "./FortuneReadingView";
import { readFortunePreferences, writeFortunePreferences, clearFortunePreferences } from "./fortune-observatory-storage";
import type { FortunePreferences } from "./fortune-observatory-storage";
import "./fortune-observatory.css";

export function FortuneObservatory({ characterContent }: { characterContent?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("content") ?? "";
  const selected = FORTUNE_EXPERIENCES.find((item) => item.id === requested);
  const [group, setGroup] = useState<FortuneGroup>("전체"), [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false), [preferences, setPreferences] = useState(readFortunePreferences);
  const [birth, setBirth] = useState<FortuneBirthInput>({ date: "", calendar: "solar" });
  const [partner, setPartner] = useState<FortuneBirthInput>({ date: "", calendar: "solar" });
  const [date, setDate] = useState(fortuneKstDate), [month, setMonth] = useState(() => fortuneKstDate().slice(0, 7));
  const [year, setYear] = useState(() => Number(fortuneKstDate().slice(0, 4))), [question, setQuestion] = useState("");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward"), [pick, setPick] = useState(0);
  const [reading, setReading] = useState<FortuneReading | null>(null), [running, setRunning] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [notebookOpen, setNotebookOpen] = useState(false);
  const sequence = useRef(0), resultHeading = useRef<HTMLHeadingElement>(null), workHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { sequence.current += 1; setReading(null); setError(""); setRunning(false); setPick(0); if (requested) workHeading.current?.focus({ preventScroll: true }); return () => { sequence.current += 1; }; }, [requested]);
  useEffect(() => { if (reading) resultHeading.current?.focus({ preventScroll: true }); }, [reading]);
  const navigate = (id: string) => { setParams(id ? { content: id } : {}); if (id) requestAnimationFrame(() => document.getElementById("fortune-workbench")?.scrollIntoView({ block: "start" })); };
  const persist = (next: FortunePreferences) => { setPreferences(next); const stored = writeFortunePreferences(next); if (!stored) setNotice("이 브라우저에서 저장이 제한되어 있어요. 현재 화면에서만 유지됩니다."); return stored; };
  const favorite = (id: string) => persist({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter((v) => v !== id) : [...preferences.favorites, id] });
  const saveReading = () => { if (!reading) return; const entry = { id: `${reading.id}-${Date.now()}`, title: reading.title, text: fortuneReadingText(reading), savedAt: fortuneKstDate() }; const stored = persist({ ...preferences, notebook: [entry, ...preferences.notebook].slice(0, 12) }); if (stored) setNotice("생일·시간·꿈 원문을 제외한 해석을 이 브라우저의 보관함에 추가했어요."); };
  const clearInputs = () => { sequence.current += 1; setBirth({ date: "", calendar: "solar" }); setPartner({ date: "", calendar: "solar" }); setQuestion(""); setReading(null); setError(""); setRunning(false); setNotice("현재 입력과 결과를 지웠어요."); };
  const clearSaved = () => { const ok = clearFortunePreferences(); setPreferences({ favorites: [], notebook: [] }); setNotice(ok ? "관측소의 즐겨찾기와 보관함을 모두 지웠어요." : "브라우저 저장소를 지울 수 없어요. 브라우저 설정에서 사이트 데이터를 확인해 주세요."); };
  const run = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || running) return;
    const request = ++sequence.current; setRunning(true); setError(""); setReading(null);
    try { const result = await buildFortuneReading(selected.id, { birth, partner, date, month, year, question, pick, cycleDirection: direction }); if (request === sequence.current) setReading(result); }
    catch (cause) { if (request === sequence.current) setError(cause instanceof Error ? cause.message : "입력값을 확인하고 다시 열어 주세요."); }
    finally { if (request === sequence.current) setRunning(false); }
  };
  const visible = FORTUNE_EXPERIENCES.filter((item) => (group === "전체" || item.group === group) && (!favoritesOnly || preferences.favorites.includes(item.id)) && `${item.title} ${item.subtitle} ${item.tag} ${item.group}`.includes(search.trim()));
  if (requested === "character") return <div className="fortune-observatory fo-legacy"><button type="button" className="fo-button" onClick={() => navigate("")}><ArrowLeft size={16} />운세 관측소로</button><p className="fo-safety">{FORTUNE_DISCLAIMER}</p>{characterContent}</div>;
  return <div className="fortune-observatory">
    <header className="fo-hero">
      <div className="fo-hero-copy"><p className="fo-eyebrow"><span /> TOONSTUDIO · FORTUNE OBSERVATORY</p><h1>나의 이야기를 읽는<br /><em>운세 관측소</em></h1><p className="fo-lead">사주의 네 기둥부터 오늘의 타로까지.<br />운명을 단정하지 않고, 새로운 나를 발견하는 시간.</p>
      <div className="fo-hero-actions"><button type="button" className="fo-button fo-primary" onClick={() => navigate("saju")}>내 사주 펼치기 <ArrowRight size={17} /></button><button type="button" className="fo-button" onClick={() => navigate("tarot-three")}><Sparkles size={16} />카드로 시작하기</button></div>
      <p className="fo-privacy"><ShieldCheck size={15} />관측소 입력은 서버 전송·자동 저장 없이 내 브라우저에서 계산해요.</p></div>
      <div className="fo-orbit" aria-hidden="true"><div className="fo-orbit-ring" /><div className="fo-orbit-inner" /><div className="fo-orbit-core"><small>READ YOUR STORY</small><strong>命</strong><span>목 · 화 · 토 · 금 · 수</span></div>{["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"].map((sign, i) => <span className="fo-orbit-sign" key={sign} style={{ transform: `rotate(${i * 30}deg) translateY(-154px) rotate(${-i * 30}deg)` }}>{sign}</span>)}<i className="fo-orbit-star">✦</i></div>
      <div className="fo-hero-foot"><span>{fortuneKstDate()} · KST</span><span>{FORTUNE_EXPERIENCES.length}개의 발견 · 로그인 없이 무료</span><span>전통 역법 × 창작의 영감</span></div>
    </header>
    <p className="fo-safety">{FORTUNE_DISCLAIMER}</p>
    {requested && !selected && <p role="status" className="fo-help">알 수 없는 콘텐츠 주소입니다. 아래에서 원하는 운세를 선택해 주세요.</p>}
    {selected && <section className="fo-workbench" id="fortune-workbench" aria-labelledby="fortune-work-title">
      <div className="fo-work-head"><div><p className="fo-eyebrow">{selected.group} · {selected.tag}</p><h2 id="fortune-work-title" ref={workHeading} tabIndex={-1}>{selected.glyph} {selected.title}</h2><p>{selected.subtitle}</p></div><button type="button" className="fo-icon-button" onClick={() => navigate("")} aria-label="콘텐츠 선택으로 돌아가기"><ArrowLeft size={19} /></button></div>
      <form onSubmit={run} className="fo-form">
        {(selected.input === "birth" || selected.input === "pair") && <FortuneBirthFields label={selected.input === "pair" ? "나의 생년월일" : "생년월일로 시작하기"} value={birth} onChange={(value) => { setBirth(value); setReading(null); }} />}
        {selected.input === "pair" && <FortuneBirthFields label="상대의 생년월일" value={partner} onChange={(value) => { setPartner(value); setReading(null); }} />}
        {selected.input === "dream" && <label className="fo-dream-label" htmlFor="fo-dream">기억나는 꿈의 장면<textarea id="fo-dream" value={question} onChange={(e) => { setQuestion(e.target.value); setReading(null); }} required maxLength={600} rows={4} placeholder="예: 달빛이 비치는 바다에서 고양이와 여행했어요." /><span className="fo-help">한국어 상징 검색 · 최대 600자 · 진단이나 길흉 예측이 아닙니다.</span></label>}
        <div className="fo-query-fields">
          {(["almanac", "monthly"].includes(selected.id)) && <label htmlFor="fo-month">조회할 달<input id="fo-month" type="month" value={month} required min="1900-01" max="2050-12" onChange={(e) => { setMonth(e.target.value); setReading(null); }} /></label>}
          {(["yearly", "terms"].includes(selected.id)) && <label htmlFor="fo-year">조회 연도<input id="fo-year" type="number" value={year} required min={1900} max={2050} onChange={(e) => { setYear(Number(e.target.value)); setReading(null); }} /></label>}
          {(["today", "tomorrow", "weekly", "romance", "money", "career", "study", "creative"].includes(selected.id)) && <label htmlFor="fo-date">기준 날짜<input id="fo-date" type="date" value={date} required min="1900-01-01" max="2050-12-24" onChange={(e) => { setDate(e.target.value); setReading(null); }} /></label>}
          {selected.id === "cycles" && <label htmlFor="fo-direction">대운 진행 방향<select id="fo-direction" value={direction} onChange={(e) => { setDirection(e.target.value === "reverse" ? "reverse" : "forward"); setReading(null); }}><option value="forward">순행 (직접 선택)</option><option value="reverse">역행 (직접 선택)</option></select><span className="fo-help">성별로 자동 판정하지 않습니다.</span></label>}
        </div>
        {selected.id.startsWith("tarot") && <fieldset className="fo-tarot-picker"><legend>마음이 가는 카드 뒷면을 골라 주세요</legend><p>선택한 위치가 스프레드를 결정해요. 같은 날·같은 선택은 같은 카드입니다.</p><div>{Array.from({ length: 22 }, (_, i) => <label key={i} data-selected={pick === i}><input type="radio" name="fo-card" value={i} checked={pick === i} onChange={() => { setPick(i); setReading(null); }} /><span aria-hidden="true">✦</span><small>{i + 1}번</small></label>)}</div></fieldset>}
        <div className="fo-form-actions"><button className="fo-button fo-primary" type="submit" disabled={running}>{running ? "해석을 펼치고 있어요…" : `${selected.title} 열기`}<ArrowRight size={16} /></button><button type="button" className="fo-button" onClick={clearInputs}>입력·결과 지우기</button><span>추가 요금 · API 키 · 가입 없이</span></div>
        {error && <p role="alert" className="fo-error">{error}</p>}
      </form>
      {reading && <div className="fo-result-wrap"><div className="fo-result-toolbar"><h2 ref={resultHeading} tabIndex={-1}>나의 해석 리포트</h2><button type="button" className="fo-button" onClick={saveReading}><BookmarkPlus size={16} />해석 보관</button></div><p className="fo-help">‘해석 보관’을 누를 때만 저장합니다. 생일·시간·꿈 원문은 저장하지 않아요.</p><FortuneReadingView key={`${reading.id}-${reading.generatedFor}-${sequence.current}`} reading={reading} /></div>}
    </section>}
    <section className="fo-discover" aria-labelledby="fo-discover-title"><div className="fo-discover-head"><div><p className="fo-eyebrow">CHOOSE YOUR CHAPTER</p><h2 id="fo-discover-title">오늘은 무엇이 궁금한가요?</h2><p>전통에서 일상까지, 나에게 맞는 발견을 골라 보세요.</p></div><button type="button" className="fo-button" onClick={() => setNotebookOpen(!notebookOpen)} aria-expanded={notebookOpen}><BookOpen size={16} />나의 보관함 {preferences.notebook.length}</button></div>
      <div className="fo-search-row"><label className="fo-search"><Search size={18} /><span className="sr-only">운세 콘텐츠 검색</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="만세력, 궁합, 타로…" type="search" /></label><button type="button" className="fo-button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}><Star size={16} />즐겨찾기 {preferences.favorites.length}</button></div>
      <div className="fo-filters" aria-label="콘텐츠 카테고리">{FORTUNE_GROUPS.map((name) => <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
      <p className="fo-count" role="status">{visible.length}개의 콘텐츠</p>
      <div className="fo-catalog">{visible.map((item, i) => <article key={item.id} className="fo-experience" data-group={item.group} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}><button type="button" className="fo-experience-open" onClick={() => navigate(item.id)} aria-label={`${item.title} 살펴보기`}><span className="fo-card-top"><span className="fo-glyph" aria-hidden="true">{item.glyph}</span><small>{item.tag}</small></span><h3>{item.title}</h3><p>{item.subtitle}</p><span className="fo-card-bottom">{item.group}<ArrowRight size={16} /></span></button><button type="button" className="fo-favorite" onClick={() => favorite(item.id)} aria-pressed={preferences.favorites.includes(item.id)} aria-label={`${item.title} 즐겨찾기`}><Star size={16} fill={preferences.favorites.includes(item.id) ? "currentColor" : "none"} /></button></article>)}</div>
      {!visible.length && <div className="fo-empty"><Sparkles size={28} /><h3>아직 찾지 못한 이야기</h3><p>다른 검색어나 카테고리로 살펴보세요.</p><button className="fo-button" type="button" onClick={() => { setSearch(""); setGroup("전체"); setFavoritesOnly(false); }}>전체 콘텐츠 보기</button></div>}
    </section>
    {notebookOpen && <section className="fo-notebook" aria-label="나의 운세 보관함"><div className="fo-discover-head"><div><h2>나의 보관함</h2><p>이 브라우저에 저장한 해석 텍스트 · 최근 12개</p></div><button type="button" className="fo-button" onClick={clearSaved}><Trash2 size={15} />즐겨찾기·보관함 비우기</button></div>{preferences.notebook.length ? preferences.notebook.map((entry) => <details key={entry.id}><summary>{entry.title} · {entry.savedAt}</summary><pre>{entry.text}</pre><button type="button" className="fo-button" onClick={() => persist({ ...preferences, notebook: preferences.notebook.filter((n) => n.id !== entry.id) })}>이 기록 삭제</button></details>) : <p className="fo-help">결과에서 ‘해석 보관’을 누르면 이곳에 모입니다. 저장은 선택이며 언제든 지울 수 있어요.</p>}</section>}
    <section className="fo-character-callout"><div><p className="fo-eyebrow">A DIFFERENT WAY TO READ</p><h2>캐릭터가 읽어 주는 나의 이야기</h2><p>아라·단우·레오나·가온의 웹툰 해설, 타로와 독서 처방도 만나보세요.</p></div><button type="button" className="fo-button" onClick={() => navigate("character")}>캐릭터 웹툰 운세 <ArrowRight size={17} /></button></section>
    <p className="fo-notice" role="status" aria-live="polite">{notice}</p>
    <footer className="fo-footer"><strong>정해진 운명보다, 내가 만드는 다음 장면.</strong><p>{FORTUNE_DISCLAIMER}</p><p>브라우저 로컬 계산 · 한국 표준시 · 1900~2050년 · 최초 페이지 로드에는 연결이 필요합니다.</p></footer>
  </div>;
}
