import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { FORTUNE_SPECIAL_DAY_CATEGORIES, FORTUNE_SPECIAL_DAY_LABELS, validateFortuneSpecialDays, type FortuneSpecialDayCategory } from "@toonspectrum/core/fortune";

const schema = z.object({ kind: z.literal("special-days"), month: z.string(), category: z.enum(FORTUNE_SPECIAL_DAY_CATEGORIES),
  status: z.enum(["external", "external-cache", "local-fallback"]), source: z.enum(["local", "kasi"]), policyRevision: z.string().max(100),
  reason: z.string().max(60).optional(), checkedAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(),
  items: z.array(z.object({ date: z.string(), sequence: z.number().int(), name: z.string().max(50), isHoliday: z.boolean() }).strict()).max(100) }).strict();
function SpecialDaysResult({ month, category }: { month: string; category: FortuneSpecialDayCategory }) {
  const [result, setResult] = useState<z.infer<typeof schema> | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null), sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; controller.current?.abort(); }, []);
  const cancel = () => { sequence.current += 1; controller.current?.abort(); setBusy(false); setNotice(""); };
  const load = async () => {
    if (busy) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const request = ++sequence.current; setBusy(true); setNotice(""); setResult(null);
    const timer = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(`/api/fortune/special-days?${new URLSearchParams({ month, category })}`, { cache: "no-store", credentials: "omit", signal: abort.signal });
      if (!response.ok) throw new Error("unavailable");
      const value = schema.parse(await response.json());
      if (request !== sequence.current || abort.signal.aborted) return;
      if (value.month !== month || value.category !== category || !validateFortuneSpecialDays(month, category, value.items)) throw new Error("context-mismatch");
      if (value.status === "local-fallback") {
        if (value.source !== "local" || value.items.length) throw new Error("source-mismatch");
        setNotice(value.reason === "not-configured" ? "특일 데이터 연결은 아직 활성화되지 않았어요. 기본 달력은 계속 사용할 수 있어요." : "특일 데이터를 확인할 수 없어 기본 달력을 유지합니다.");
      } else {
        if (value.source !== "kasi" || !value.checkedAt || !value.expiresAt || Date.parse(value.expiresAt) <= Date.now() || Date.parse(value.expiresAt) <= Date.parse(value.checkedAt)) throw new Error("expired-source");
        setResult(value);
      }
    } catch { if (request === sequence.current) setNotice("특일 데이터를 확인할 수 없어 기본 달력을 유지합니다."); }
    finally { window.clearTimeout(timer); if (request === sequence.current) setBusy(false); }
  };
  return <div aria-busy={busy}>
    <button type="button" className="fo-button" disabled={busy} onClick={() => { void load(); }}>{busy ? "특일 데이터 확인 중…" : "특일 정보 확인"}</button>
    {busy && <button type="button" className="fo-button" onClick={cancel}>특일 조회 취소</button>}
    <p role="status" aria-live="polite">{notice}</p>
    {result && <div>
      {result.items.length ? <ul>{result.items.map((item) => <li key={`${item.date}:${item.sequence}`}>
        <time dateTime={item.date}>{item.date}</time> · {item.name} {item.isHoliday && <strong>· 공공기관 휴일</strong>}
      </li>)}</ul> : <p>이 달에 제공된 {FORTUNE_SPECIAL_DAY_LABELS[category]} 항목이 없습니다. 미공개·변경 여부는 원 제공처에서 확인해 주세요.</p>}
      <p>확인 시각: <time>{result.checkedAt}</time> · {result.status === "external-cache" ? "서버 캐시" : "새 응답"}</p>
      <p>다시 확인할 시각: <time>{result.expiresAt}</time></p>
      <a href="https://www.data.go.kr/data/15012690/openapi.do" target="_blank" rel="noreferrer">한국천문연구원 특일 정보</a>
    </div>}
  </div>;
}
export function FortuneSpecialDays({ month }: { month: string }) {
  const [category, setCategory] = useState<FortuneSpecialDayCategory>("holidays");
  return <details className="fo-calendar-section">
    <summary>공휴일·기념일·절기 정보</summary>
    <p>선택한 {month}의 공용 정보만 조회합니다. 개인 출생정보는 전송하지 않습니다.</p>
    <label>특일 분류 <select value={category} onChange={(event) => setCategory(event.target.value as FortuneSpecialDayCategory)}>
      {FORTUNE_SPECIAL_DAY_CATEGORIES.map((value) => <option key={value} value={value}>{FORTUNE_SPECIAL_DAY_LABELS[value]}</option>)}
    </select></label>
    <SpecialDaysResult key={`${month}:${category}`} month={month} category={category} />
    <p className="fo-help">공공기관 휴일 표시는 개인의 휴무·영업일을 보장하지 않습니다. 절기 날짜는 참고 정보이며 기존 사주·절입 시각 계산을 바꾸지 않습니다.</p>
  </details>;
}
