"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useApp, useHydrated } from "@/lib/store";

// 스팀식 자가 연령 확인 — 생년월일 1회 입력 → 만 19세 이상이면 19금 표지 블러 해제(브라우저 저장).
// 신원 확인이 아닌 자가 확인. 19+ 표지 배지(시각 표시)는 인증과 무관하게 유지된다.
export function AgeGateModal() {
  const hydrated = useHydrated();
  const open = useApp((s) => s.ageGateOpen);
  const verify = useApp((s) => s.verifyAdultBirthdate);
  const close = useApp((s) => s.closeAgeGate);
  const [date, setDate] = useState("");
  const [denied, setDenied] = useState(false);

  if (!hydrated || !open) return null;
  const today = new Date().toISOString().slice(0, 10);

  const submit = () => {
    if (!date) return;
    if (!verify(date)) setDenied(true);
  };

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
          19금 콘텐츠 표지를 보려면 생년월일을 입력하세요. 만 19세 이상만 열람할 수 있어요. 입력값은 이
          브라우저에만 저장되며 서버로 전송되지 않습니다.
        </p>
        <label className="mt-4 block text-xs font-medium text-fg-2" htmlFor="agegate-date">
          생년월일
        </label>
        <input
          id="agegate-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            setDate(e.target.value);
            setDenied(false);
          }}
          className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none"
        />
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
            disabled={!date}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
