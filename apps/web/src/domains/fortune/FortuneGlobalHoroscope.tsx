import { useEffect, useState } from "react";

import {
  fetchGlobalHoroscope,
  summarizeHoroscopeKo,
  type GlobalHoroscope,
  type HoroscopeGist,
} from "@toonstudio/core";
import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";

// 글로벌 별자리 운세 — 무료 API(horoscope-app-api, 키 불필요)에서 가져온다.
// 실패하면 조용히 숨기고 로컬 운세만 보여준다.

export interface FortuneGlobalHoroscopeProps {
  /** 별자리 영문 id (예: "aries") */
  signId: string;
  signKo: string;
}

type Status = "loading" | "ready" | "hidden";

export function FortuneGlobalHoroscope({ signId, signKo }: FortuneGlobalHoroscopeProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortuneGlobalHoroscope", source);
  const [status, setStatus] = useState<Status>("loading");
  const [horoscope, setHoroscope] = useState<GlobalHoroscope | null>(null);
  const [gist, setGist] = useState<HoroscopeGist | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetchGlobalHoroscope(signId, "daily")
      .then((h) => {
        if (!alive) return;
        if (!h) {
          setStatus("hidden");
          return;
        }
        setHoroscope(h);
        setGist(summarizeHoroscopeKo(h.text));
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("hidden");
      });
    return () => {
      alive = false;
    };
  }, [signId]);

  if (status !== "ready" || !horoscope || !gist) return null;

  const sentimentColor =
    gist.sentiment === "positive" ? "text-emerald-400" : gist.sentiment === "caution" ? "text-amber-400" : "text-sky-300";

  return (
    <div className="rounded-xl border border-line/45 bg-card/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-fg-3">
          {tx("글로벌 점성술")} · {signKo}
        </p>
        <span className={`text-[11px] font-bold ${sentimentColor}`}>
          {gist.sentiment === "positive" ? tx("긍정적") : gist.sentiment === "caution" ? tx("신중") : tx("균형")}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-2">{gist.summaryKo}</p>
      {gist.keywordsKo.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gist.keywordsKo.map((k) => (
            <span key={k} className="rounded-full border border-line/60 px-2 py-0.5 text-[10px] font-semibold text-fg-2">
              #{k}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-2 text-[11px] font-semibold text-accent hover:underline"
      >
        {expanded ? tx("원문 닫기") : tx("영문 원문 보기")}
      </button>
      {expanded && (
        <blockquote className="mt-2 border-l-2 border-line pl-3 text-xs italic leading-relaxed text-fg-3">
          {horoscope.text}
          <footer className="mt-1 text-[10px] not-italic">— {tx("출처")}: horoscope-app-api ({horoscope.date})</footer>
        </blockquote>
      )}
    </div>
  );
}
