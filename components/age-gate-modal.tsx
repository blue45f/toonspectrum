"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useApp, useHydrated } from "@/lib/store";

// 스팀식 자가 연령 확인 — 생년월일 1회 입력 → 만 19세 이상이면 19금 표지 블러 해제(브라우저 저장).
// 생년월일은 네이티브 date picker 대신 년/월/일 드롭다운으로 받는다(과거 연도 선택이 훨씬 쉬움).
// 신원 확인이 아닌 자가 확인. 19+ 표지 배지(시각 표시)는 인증과 무관하게 유지된다.
const SELECT_CLASS =
  "w-full rounded-lg border border-line bg-raised px-2.5 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none";

export function AgeGateModal() {
  const hydrated = useHydrated();
  const open = useApp((s) => s.ageGateOpen);
  const verify = useApp((s) => s.verifyAdultBirthdate);
  const close = useApp((s) => s.closeAgeGate);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [denied, setDenied] = useState(false);

  if (!hydrated || !open) return null;

  const now = new Date();
  const curYear = now.getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => curYear - i); // 올해 ~ 100년 전
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const complete = Boolean(year && month && day);

  const submit = () => {
    if (!complete) return;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(Number(day), daysInMonth)).padStart(2, "0")}`;
    if (!verify(iso)) setDenied(true);
  };
  const clearDenied = () => setDenied(false);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[oklch(0.12_0.012_70/0.72)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agegate-title"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ShieldCheck className="text-accent" size={26} />
        <h2 id="agegate-title" className="mt-3 font-display text-lg font-bold text-fg">
          연령 확인
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-3">
          19금 콘텐츠 표지를 보려면 생년월일을 선택하세요. 만 19세 이상만 열람할 수 있어요. 입력값은 이
          브라우저에만 저장되며 서버로 전송되지 않습니다.
        </p>
        <span className="mt-4 block text-xs font-medium text-fg-2">생년월일</span>
        <div className="mt-1.5 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
          <select
            aria-label="출생 연도"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              clearDenied();
            }}
            className={SELECT_CLASS}
          >
            <option value="">연도</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            aria-label="출생 월"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              clearDenied();
            }}
            className={SELECT_CLASS}
          >
            <option value="">월</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <select
            aria-label="출생 일"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              clearDenied();
            }}
            className={SELECT_CLASS}
          >
            <option value="">일</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </div>
        {denied && (
          <p className="mt-2 text-xs font-medium text-bad">만 19세 미만은 19금 콘텐츠를 볼 수 없어요.</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!complete}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
