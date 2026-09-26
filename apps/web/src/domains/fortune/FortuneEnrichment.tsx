import { apiFetch } from "@/platform/api";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { readFortuneResponse, validatedFortuneExpiry } from "./fortune-response-lifetime";
import { useFortuneExpiry } from "./useFortuneExpiry";
import { localFortuneHoroscope, type FortuneReading, type FortunePeriod, type FortuneUnavailableReason } from "@toonspectrum/core/fortune";

const statusSchema = z.enum(["local", "external", "external-cache", "local-fallback"]);
const reasonSchema = z.enum(["not-configured", "rights-pending", "coordination-unavailable", "budget-exhausted", "provider-unavailable", "historical-request"]);
const calendarSchema = z.object({ kind: z.literal("calendar"), month: z.string(), status: statusSchema, reason: reasonSchema.optional(), source: z.enum(["local", "kasi"]), checkedAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(), policyRevision: z.string().max(100),
  checks: z.array(z.object({ date: z.string(), matches: z.boolean(), fields: z.array(z.enum(["lunar-date", "leap-month", "weekday"])).max(3) })).max(31) });
const horoscopeSchema = z.object({ kind: z.literal("horoscope"), sign: z.string(), period: z.enum(["daily", "weekly", "monthly"]), referenceDate: z.string(), periodStart: z.string(), periodEndExclusive: z.string(), status: statusSchema, reason: reasonSchema.optional(), source: z.enum(["local", "free-horoscope"]), text: z.string().max(6000), language: z.enum(["ko", "en"]), sourceDate: z.string().optional(), checkedAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(), policyRevision: z.string().max(100) });
const reasons: Record<FortuneUnavailableReason, string> = {
  "not-configured": "외부 데이터 연결은 아직 활성화되지 않았어요.",
  "rights-pending": "외부 콘텐츠의 이용권한 확인 전입니다.",
  "coordination-unavailable": "안전한 호출 한도를 확인할 수 없어 외부 연결을 쉬고 있어요.",
  "budget-exhausted": "외부 데이터의 무료 호출 예산에 도달했어요.",
  "provider-unavailable": "추가 데이터를 확인할 수 없어요.",
  "historical-request": "이 기준 날짜에는 외부 추가 읽기를 제공하지 않아요.",
};
const fieldNames = { "lunar-date": "음력 날짜", "leap-month": "윤달", weekday: "요일" };
function FortuneEnrichmentContent({ reading }: { reading: FortuneReading }) {
  const [period, setPeriod] = useState<FortunePeriod>("daily");
  const [calendar, setCalendar] = useState<z.infer<typeof calendarSchema> | null>(null);
  const [horoscope, setHoroscope] = useState<z.infer<typeof horoscopeSchema> | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null), sequence = useRef(0);
  const timeout = useRef<number | null>(null);
  useEffect(() => () => { if (timeout.current !== null) window.clearTimeout(timeout.current); sequence.current += 1; abort.current?.abort(); }, []);
  const month = reading.calendar?.[0]?.date.slice(0, 7);
  const local = reading.zodiacSign ? localFortuneHoroscope(reading.zodiacSign, period, reading.generatedFor) : null;
  const expired = useFortuneExpiry(calendar?.expiresAt ?? horoscope?.expiresAt ?? null);
  if (!month && !local) return null;
  const cancel = () => { if (timeout.current !== null) window.clearTimeout(timeout.current); sequence.current += 1; abort.current?.abort(); setBusy(false); setNotice(""); };
  const load = async () => {
    if (busy) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const request = ++sequence.current; setBusy(true); setNotice(""); setCalendar(null); setHoroscope(null);
    const timer = window.setTimeout(() => controller.abort(), 15000);
    timeout.current = timer;
    try {
      const query = month ? new URLSearchParams({ month }) : new URLSearchParams({ sign: reading.zodiacSign!, period, date: reading.generatedFor });
      const response = await apiFetch(`/api/fortune/${month ? "calendar" : "horoscope"}?${query}`, { signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
      const payload = await readFortuneResponse(response, controller.signal);
      if (request !== sequence.current || controller.signal.aborted) return;
      if (month) {
        const value = calendarSchema.parse(payload);
        if (value.month !== month) throw new Error("context-mismatch");
        if (value.status === "external" || value.status === "external-cache") {
          const dates = new Set(reading.calendar?.map((day) => day.date));
          if (value.source !== "kasi" || value.checks.length !== dates.size || new Set(value.checks.map((c) => c.date)).size !== dates.size || value.checks.some((c) => !dates.has(c.date) || c.matches !== (c.fields.length === 0)) || !value.checkedAt) throw new Error("incomplete-checks");
        } else if (value.source !== "local" || value.checks.length) throw new Error("source-mismatch");
        if (value.source === "kasi") value.expiresAt = validatedFortuneExpiry(value);
        setCalendar(value);
      } else if (local) {
        const value = horoscopeSchema.parse(payload);
        if (value.sign !== local.sign || value.period !== period || value.referenceDate !== local.referenceDate || value.periodStart !== local.periodStart || value.periodEndExclusive !== local.periodEndExclusive) throw new Error("context-mismatch");
        if ((value.status === "external" || value.status === "external-cache") && (value.source !== "free-horoscope" || value.language !== "en" || value.sourceDate !== local.referenceDate || !value.checkedAt)) throw new Error("source-mismatch");
        if (value.status === "external" || value.status === "external-cache") value.expiresAt = validatedFortuneExpiry(value);
        else if (value.source !== "local" || value.language !== "ko") throw new Error("source-mismatch");
        setHoroscope(value);
      }
    } catch { if (request === sequence.current) setNotice("추가 데이터를 확인할 수 없어 기본 로컬 해석을 유지합니다."); }
    finally { window.clearTimeout(timer); if (request === sequence.current) setBusy(false); }
  };
  const reason = calendar?.reason ?? horoscope?.reason;
  const mismatches = calendar?.checks.filter((check) => !check.matches) ?? [];
  const external = !expired && horoscope && (horoscope.status === "external" || horoscope.status === "external-cache");
  return <section className="fo-calendar-section" aria-label={month ? "달력 데이터 대조" : "별자리 기간별 읽기"} aria-busy={busy}>
    <h3>{month ? "달력 데이터 대조" : "별자리 기간별 읽기"}</h3>
    {local && <><div className="fo-reading-mode" aria-label="별자리 조회 기간">{(["daily", "weekly", "monthly"] as const).map((item, index) => <button key={item} type="button" className="fo-button" aria-pressed={period === item} onClick={() => { cancel(); setPeriod(item); setHoroscope(null); }}>{["일간", "주간", "월간"][index]}</button>)}</div>
      <p>한국 표준시 기준 {local.periodStart}부터 {local.periodEndExclusive} 직전까지 · 주간은 월요일 시작</p><p>{local.text}</p><small>ToonStudio 자체 한국어 편집 · {local.policyRevision}</small></>}
    <p className="fo-help">{month ? "선택한 달의 음양력·윤달·요일만 공공 데이터와 비교합니다. 생년월일·출생시간은 전송하지 않습니다." : "외부에는 별자리와 조회 기간만 전달합니다. 한국어 번역이나 예측 정확도 검증을 제공하는 기능은 아닙니다."}</p>
    <button type="button" className="fo-button" disabled={busy || Boolean(external) || (!expired && calendar?.source === "kasi")} onClick={() => { void load(); }}>{busy ? "추가 데이터 확인 중…" : month ? "공공 데이터로 대조하기" : "외부 추가 읽기 확인"}</button>
    {busy && <button type="button" className="fo-button" onClick={cancel}>확인 취소</button>}
    <div role="status" aria-live="polite">{notice || (expired ? "추가 데이터의 유효기간이 지났어요. 다시 확인해 주세요. 기본 해석은 유지됩니다." : reason ? `${reasons[reason]} 기본 로컬 해석은 계속 사용할 수 있어요.` : "")}</div>
    {!expired && calendar?.source === "kasi" && <div><p>{mismatches.length ? `${mismatches.length}일에 차이가 있어요. 기존 달력은 변경하지 않았습니다.` : `${calendar.checks.length}일의 음력 날짜·윤달·요일 대조 일치`}</p>
      {mismatches.length > 0 && <details><summary>차이 확인</summary>{mismatches.map((check) => <p key={check.date}>{check.date}: {check.fields.map((field) => fieldNames[field]).join(" · ")}</p>)}</details>}
      <p>대조 시각: <time>{calendar.checkedAt}</time> · {calendar.status === "external-cache" ? "서버 캐시" : "새 응답"}</p>
      <a href="https://www.data.go.kr/data/15012679/openapi.do" target="_blank" rel="noreferrer">한국천문연구원 음양력 정보</a>
      <p className="fo-help">대조 일치는 운세 예측력이나 사주 전체의 공식 인증이 아닙니다. 절입 시각·월주는 기존 계산을 유지합니다.</p></div>}
    {external && <div><h4>외부 제공자의 영어 원문</h4><p lang="en">{horoscope.text}</p><p>제공자 표기일: {horoscope.sourceDate} · {horoscope.status === "external-cache" ? "서버 캐시" : "새 응답"}</p>
      <a href="https://freehoroscopeapi.com/" target="_blank" rel="noreferrer">Free Horoscope API</a><p className="fo-help">제공자 시간대와 주·월 경계는 명시되지 않았습니다. 위 한국 표준시 기간과 같다고 보증하지 않습니다. 이 추가 원문은 해석 보관·공유에서 제외합니다.</p></div>}
  </section>;
}

export function FortuneEnrichment({ reading }: { reading: FortuneReading }) {
  return <FortuneEnrichmentContent key={`${reading.id}:${reading.generatedFor}:${reading.calendar?.[0]?.date ?? reading.zodiacSign ?? ""}`} reading={reading} />;
}
