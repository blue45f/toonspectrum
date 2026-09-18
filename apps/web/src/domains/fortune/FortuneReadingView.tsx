import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import type { ComicCastId } from "@/shared/components/comic/comic-cast";
import { tryCopyFortuneText } from "./fortune-sharing";
import { useState } from "react";
import { BookOpen, List } from "lucide-react";
import { fortunePillarDetails, FORTUNE_ELEMENT_KEYS, FORTUNE_ELEMENT_NAMES, FORTUNE_EXPERIENCES } from "@toonspectrum/core/fortune";
import type { FortuneReading, SajuResult } from "@toonspectrum/core/fortune";
import { FortuneStoryReader } from "./FortuneStoryReader";
import { FortuneElementOrbit, FortuneExperienceArt } from "./FortuneVisuals";
import { FortuneCreativeMission, FortuneReadingTools } from "./FortuneReadingTools";
import { TarotCardFace } from "./TarotCardFace";

function Pillars({ chart, label }: { chart: SajuResult; label: string }) {
  return <section className="fo-chart"><h3>{label}</h3><div className="fo-pillars">
    {fortunePillarDetails(chart).map((item) => <div className="fo-pillar" key={item.label} data-day={item.label === "일주"}>
      <span>{item.label}</span><small>{item.tenGod}</small>
      {item.pillar.kan ? <><strong data-element={item.pillar.elementKan}>{item.pillar.kan}</strong><strong data-element={item.pillar.elementJi}>{item.pillar.ji}</strong><b>{item.pillar.kanKorean}{item.pillar.jiKorean}</b><small>{item.pillar.elementKan} · {item.pillar.elementJi}</small></> : <div className="fo-unknown">? <small>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "시간 미상")}<br />{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "집계 제외")}</small></div>}
    </div>)}
  </div><p className="fo-help">년주 → 월주 → 일주 → 시주 · 색상과 한글로 오행을 함께 표시합니다.</p>
  <FortuneElementOrbit chart={chart} label={`${label}의 오행 궤도`} />
  <div className="fo-elements">{FORTUNE_ELEMENT_KEYS.map((key, i) => <label key={key}><span>{FORTUNE_ELEMENT_NAMES[i]}</span><meter min={0} max={100} value={chart.elementsRatio[key]} aria-label={`${FORTUNE_ELEMENT_NAMES[i]} 오행 비율`}>{chart.elementsRatio[key]}%</meter><b>{chart.elementsRatio[key]}%</b></label>)}</div><p className="fo-help">겉글자 동등 집계 · 합계 100% · 많고 적음은 우열이 아닙니다.</p></section>;
}
export function FortuneReadingView({ reading, cast = "ara", onCastChange }: { reading: FortuneReading; cast?: ComicCastId; onCastChange?: (id: ComicCastId) => void }) {
  const [mode, setMode] = useState<"story" | "report">("story");
  const [paletteNotice, setPaletteNotice] = useState("");
  const [selectedDay, setSelectedDay] = useState(reading.calendar?.[0]?.date ?? "");
  const detail = reading.calendar?.find((d) => d.date === selectedDay);
  const experience = FORTUNE_EXPERIENCES.find((item) => item.id === reading.id);
  return <article className="fo-report" aria-label={`${reading.title} 결과`}>
    <header className="fo-result-intro"><div className="fo-result-copy"><p className="fo-eyebrow">YOUR READING · {reading.generatedFor}</p><h3>{reading.eyebrow}</h3><p>{reading.summary}</p>{reading.score !== undefined && <div className="fo-score"><strong>{reading.score}<small>/100</small></strong><span>전통 규칙 참고 지수<br /><small>실제 궁합의 확률이 아닙니다.</small></span></div>}</div>{experience && <div className="fo-result-art"><FortuneExperienceArt experience={experience} /></div>}</header>
    <div className="fo-reading-mode" aria-label="해석 읽기 방식"><button type="button" className="fo-button" aria-pressed={mode === "story"} onClick={() => setMode("story")}><BookOpen size={16} />웹툰으로 읽기</button><button type="button" className="fo-button" aria-pressed={mode === "report"} onClick={() => setMode("report")}><List size={16} />상세 리포트</button><span>같은 해석을 원하는 방식으로 읽어요</span></div>
    {mode === "story" && <FortuneStoryReader reading={reading} cast={cast} onCastChange={onCastChange} />}
    {reading.chart && <div className={reading.partnerChart ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "en", "fo-chart-pair") : ""}><Pillars chart={reading.chart} label={reading.partnerChart ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "나의 원국") : translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "나를 이루는 네 기둥")} />{reading.partnerChart && <Pillars chart={reading.partnerChart} label={translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "상대의 원국")} />}</div>}
    {reading.cards && mode === "report" && <div className="fo-tarot-results">{reading.cards.map((card) => <figure key={card.id}><figcaption>{card.position}</figcaption><TarotCardFace card={card} /><p>{card.name} · {card.type === "upright" ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "정방향") : translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "역방향")}</p></figure>)}</div>}
    {reading.colors && <div className="fo-palettes">{reading.colors.map((color) => <div key={color.hex}><div style={{ backgroundColor: color.hex }} aria-hidden="true" /><strong>{color.name}</strong><code>{color.hex}</code><button type="button" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "{v0} {v1} 색상 복사"), { v0: String(color.name), v1: String(color.hex) })} onClick={() => { void tryCopyFortuneText(color.hex).then((ok) => setPaletteNotice(ok ? `${color.hex} 색상을 복사했어요.` : `자동 복사가 제한되어 있어요. ${color.hex} 값을 직접 복사해 주세요.`)); }}>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "HEX 복사")}</button></div>)}</div>}
    {paletteNotice && <p className="fo-tool-status" role="status">{paletteNotice}</p>}
    {reading.calendar && <section className="fo-calendar-section"><h3>{reading.calendar[0]?.date.slice(0, 7)} {translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "만세력")}</h3>
      <div className="fo-calendar"><div className="fo-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="fo-days">{reading.calendar.map((day, i) => <button type="button" key={day.date} style={i === 0 ? { gridColumnStart: day.weekday + 1 } : undefined} onClick={() => setSelectedDay(day.date)} aria-pressed={selectedDay === day.date} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "{v0} 음력 {v1}월 {v2}일 {v3}"), { v0: String(day.date), v1: String(day.lunar.month), v2: String(day.lunar.day), v3: String(day.gapja) })}><strong>{Number(day.date.slice(8))}</strong><small>{day.lunar.intercalation ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "윤") : ""}{day.lunar.month}.{day.lunar.day}</small><span>{day.terms[0]?.name ?? day.gapja.replace("일", "")}</span></button>)}</div></div>
      {detail && <div className="fo-day-detail" role="status"><strong>{detail.date} · {detail.gapja}</strong><p>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "음력 ")}{detail.lunar.year}{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "년 ")}{detail.lunar.intercalation ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "윤") : ""}{detail.lunar.month}{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "월 ")}{detail.lunar.day}{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "일")}</p><p>{detail.terms.length ? detail.terms.map((term) => `${term.name} ${term.atKst.slice(11)} KST`).join(" · ") : translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "이 날짜에는 절입이 없습니다.")}</p></div>}
    </section>}
    {reading.terms && <details className="fo-terms" open={reading.id === "terms"}><summary>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "24절기 시각 · 한국 표준시")}</summary><div className="fo-terms-grid">{reading.terms.map((term) => <div key={term.name}><strong>{term.name} <small>{term.chinese}</small></strong><time>{term.atKst}</time><span>{term.isMonthBoundary ? translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "월주가 바뀌는 절입") : translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "계절의 중기")}</span></div>)}</div></details>}
    {reading.trend && <section className="fo-trend"><h3>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "날짜별 키워드")}</h3><p className="fo-help">{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "콘텐츠 지수 0~100 · 통계·확률·길일이 아닌 재미용 표현입니다.")}</p><div className="fo-trend-list">{reading.trend.map((point) => <div key={point.label}><strong>{point.label}</strong><span className="fo-trend-track" aria-hidden="true"><i style={{ width: `${point.value}%` }} /></span><b>{point.value}</b><span>{point.keyword}</span><p>{point.detail}</p></div>)}</div></section>}
    {mode === "report" && <div className="fo-reading-sections">{reading.sections.map((section, i) => <section key={`${section.title}-${i}`}><span className="fo-section-no">{String(i + 1).padStart(2, "0")}</span><h3>{section.title}</h3><p>{section.body}</p>{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</div>}
    <FortuneCreativeMission reading={reading} cast={cast} />
    <FortuneReadingTools reading={reading} />
    <details className="fo-method"><summary>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "해석 기준 · 계산 범위 · 출처")}</summary>{reading.notes.map((note, i) => <p key={i}>{note}</p>)}<p>{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "한국 음력: korean-lunar-calendar · 절입 시각: lunar-typescript · MIT 라이선스의 로컬 계산 라이브러리. 공식 역서 인증·전문 감정을 대체하지 않습니다.")}</p><a href="https://github.com/usingsky/korean_lunar_calendar_js" target="_blank" rel="noreferrer">{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "한국 음력 라이브러리")}</a><span> · </span><a href="https://6tail.cn/calendar/api.html" target="_blank" rel="noreferrer">{translateCurrentStaticSourceText("domains.fortune.FortuneReadingView", "ko", "절기 계산 문서")}</a></details>
  </article>;
}
