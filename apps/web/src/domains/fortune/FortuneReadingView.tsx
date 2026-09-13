import { useState } from "react";
import { Link } from "react-router-dom";
import { fortunePillarDetails, FORTUNE_ELEMENT_KEYS, FORTUNE_ELEMENT_NAMES } from "@toonspectrum/core/fortune";
import type { FortuneReading, SajuResult } from "@toonspectrum/core/fortune";
import { TarotCardFace } from "./TarotCardFace";

function Pillars({ chart, label }: { chart: SajuResult; label: string }) {
  return <section className="fo-chart"><h3>{label}</h3><div className="fo-pillars">
    {fortunePillarDetails(chart).map((item) => <div className="fo-pillar" key={item.label} data-day={item.label === "일주"}>
      <span>{item.label}</span><small>{item.tenGod}</small>
      {item.pillar.kan ? <><strong data-element={item.pillar.elementKan}>{item.pillar.kan}</strong><strong data-element={item.pillar.elementJi}>{item.pillar.ji}</strong><b>{item.pillar.kanKorean}{item.pillar.jiKorean}</b><small>{item.pillar.elementKan} · {item.pillar.elementJi}</small></> : <div className="fo-unknown">? <small>시간 미상<br />집계 제외</small></div>}
    </div>)}
  </div><p className="fo-help">년주 → 월주 → 일주 → 시주 · 색상과 한글로 오행을 함께 표시합니다.</p>
  <div className="fo-elements">{FORTUNE_ELEMENT_KEYS.map((key, i) => <label key={key}><span>{FORTUNE_ELEMENT_NAMES[i]}</span><meter min={0} max={100} value={chart.elementsRatio[key]} aria-label={`${FORTUNE_ELEMENT_NAMES[i]} 오행 비율`}>{chart.elementsRatio[key]}%</meter><b>{chart.elementsRatio[key]}%</b></label>)}</div><p className="fo-help">겉글자 동등 집계 · 합계 100% · 많고 적음은 우열이 아닙니다.</p></section>;
}
export function FortuneReadingView({ reading }: { reading: FortuneReading }) {
  const [selectedDay, setSelectedDay] = useState(reading.calendar?.[0]?.date ?? "");
  const detail = reading.calendar?.find((d) => d.date === selectedDay);
  return <article className="fo-report" aria-label={`${reading.title} 결과`}>
    <header className="fo-result-intro"><p className="fo-eyebrow">YOUR READING · {reading.generatedFor}</p><h3>{reading.eyebrow}</h3><p>{reading.summary}</p>{reading.score !== undefined && <div className="fo-score"><strong>{reading.score}<small>/100</small></strong><span>전통 규칙 참고 지수<br /><small>실제 궁합의 확률이 아닙니다.</small></span></div>}</header>
    {reading.chart && <div className={reading.partnerChart ? "fo-chart-pair" : ""}><Pillars chart={reading.chart} label={reading.partnerChart ? "나의 원국" : "나를 이루는 네 기둥"} />{reading.partnerChart && <Pillars chart={reading.partnerChart} label="상대의 원국" />}</div>}
    {reading.cards && <div className="fo-tarot-results">{reading.cards.map((card) => <figure key={card.id}><figcaption>{card.position}</figcaption><TarotCardFace card={card} /><p>{card.name} · {card.type === "upright" ? "정방향" : "역방향"}</p></figure>)}</div>}
    {reading.colors && <div className="fo-palettes">{reading.colors.map((color) => <div key={color.hex}><div style={{ backgroundColor: color.hex }} aria-hidden="true" /><strong>{color.name}</strong><code>{color.hex}</code></div>)}</div>}
    {reading.calendar && <section className="fo-calendar-section"><h3>{reading.calendar[0]?.date.slice(0, 7)} 만세력</h3>
      <div className="fo-calendar"><div className="fo-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="fo-days">{reading.calendar.map((day, i) => <button type="button" key={day.date} style={i === 0 ? { gridColumnStart: day.weekday + 1 } : undefined} onClick={() => setSelectedDay(day.date)} aria-pressed={selectedDay === day.date} aria-label={`${day.date} 음력 ${day.lunar.month}월 ${day.lunar.day}일 ${day.gapja}`}><strong>{Number(day.date.slice(8))}</strong><small>{day.lunar.intercalation ? "윤" : ""}{day.lunar.month}.{day.lunar.day}</small><span>{day.terms[0]?.name ?? day.gapja.replace("일", "")}</span></button>)}</div></div>
      {detail && <div className="fo-day-detail" role="status"><strong>{detail.date} · {detail.gapja}</strong><p>음력 {detail.lunar.year}년 {detail.lunar.intercalation ? "윤" : ""}{detail.lunar.month}월 {detail.lunar.day}일</p><p>{detail.terms.length ? detail.terms.map((term) => `${term.name} ${term.atKst.slice(11)} KST`).join(" · ") : "이 날짜에는 절입이 없습니다."}</p></div>}
    </section>}
    {reading.terms && <details className="fo-terms" open={reading.id === "terms"}><summary>24절기 시각 · 한국 표준시</summary><div className="fo-terms-grid">{reading.terms.map((term) => <div key={term.name}><strong>{term.name} <small>{term.chinese}</small></strong><time>{term.atKst}</time><span>{term.isMonthBoundary ? "월주가 바뀌는 절입" : "계절의 중기"}</span></div>)}</div></details>}
    {reading.trend && <section className="fo-trend"><h3>날짜별 키워드</h3><p className="fo-help">콘텐츠 지수 0~100 · 통계·확률·길일이 아닌 재미용 표현입니다.</p><div className="fo-trend-list">{reading.trend.map((point) => <div key={point.label}><strong>{point.label}</strong><span className="fo-trend-track" aria-hidden="true"><i style={{ width: `${point.value}%` }} /></span><b>{point.value}</b><span>{point.keyword}</span><p>{point.detail}</p></div>)}</div></section>}
    <div className="fo-reading-sections">{reading.sections.map((section, i) => <section key={`${section.title}-${i}`}><span className="fo-section-no">{String(i + 1).padStart(2, "0")}</span><h3>{section.title}</h3><p>{section.body}</p>{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</div>
    <div className="fo-to-studio"><div><strong>오늘의 상징을 한 컷으로</strong><p>발견한 키워드로 캐릭터나 배경을 그려 보세요.</p></div><Link to="/studio">스튜디오에서 그리기 ↗</Link></div>
    <details className="fo-method"><summary>해석 기준 · 계산 범위 · 출처</summary>{reading.notes.map((note, i) => <p key={i}>{note}</p>)}<p>한국 음력: korean-lunar-calendar · 절입 시각: lunar-typescript · MIT 라이선스의 로컬 계산 라이브러리. 공식 역서 인증·전문 감정을 대체하지 않습니다.</p><a href="https://github.com/usingsky/korean_lunar_calendar_js" target="_blank" rel="noreferrer">한국 음력 라이브러리</a><span> · </span><a href="https://6tail.cn/calendar/api.html" target="_blank" rel="noreferrer">절기 계산 문서</a></details>
  </article>;
}
