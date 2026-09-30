import { CloudOff, Download, PenLine, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import { openPwaInstallShowcase } from "./pwa-install-showcase-schedule";
import { usePwaOfflineReadiness } from "./usePwaOfflineReadiness";

import "./pwa-offline.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-offline-page", ko, en);

function OfflineHeroArt() {
  return (
    <svg viewBox="0 0 240 160" role="img" aria-hidden="true" className="pwa-offline__hero-art">
      <defs>
        <linearGradient id="pwa-offline-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      {/* 구름 */}
      <path
        d="M60 78a22 22 0 0 1 4-43.6A30 30 0 0 1 123 28a24 24 0 0 1 33 23"
        fill="none"
        stroke="url(#pwa-offline-g)"
        strokeWidth="7"
        strokeLinecap="round"
        className="pwa-offline__cloud"
      />
      {/* 끊김 표시 */}
      <path d="M78 96l84-52M162 96L78 44" stroke="#fb7185" strokeWidth="7" strokeLinecap="round" />
      {/* 펜 */}
      <g transform="rotate(-24 120 128)">
        <rect x="112" y="104" width="16" height="52" rx="8" fill="url(#pwa-offline-g)" />
        <path d="M112 156l8 12 8-12z" fill="#c084fc" />
      </g>
      {/* 반짝이 */}
      <circle cx="40" cy="120" r="5" className="pwa-offline__spark" />
      <circle cx="200" cy="120" r="4" className="pwa-offline__spark pwa-offline__spark--late" />
      <circle cx="200" cy="40" r="5" className="pwa-offline__spark pwa-offline__spark--late" />
    </svg>
  );
}

const OFFLINE_FEATURES = [
  {
    icon: PenLine,
    ko: "오프라인 드로잉",
    en: "Offline drawing",
    koDescription: "긴급 드로잉 보드에서 바로 그릴 수 있어요.",
    enDescription: "Sketch right away on the emergency drawing board.",
  },
  {
    icon: Download,
    ko: "로컬 자동 저장",
    en: "Local auto-save",
    koDescription: "작업은 기기에 저장되어 사라지지 않아요.",
    enDescription: "Work is stored on-device and never lost.",
  },
  {
    icon: RefreshCw,
    ko: "복귀 시 자동 동기화",
    en: "Auto-sync on reconnect",
    koDescription: "온라인이 되면 쌓인 작업이 자동으로 올라가요.",
    enDescription: "Queued work uploads automatically when you're back online.",
  },
] as const;

async function listOwnedCaches(): Promise<Array<{ name: string; entries: number }>> {
  try {
    if (!("caches" in window)) return [];
    const keys = await caches.keys();
    const owned = keys.filter(
      (key) =>
        key.startsWith("toonstudio-sw-")
        || key.startsWith("toonstudio-pwa-")
        || key.startsWith("toonstudio-covers-"),
    );
    const result: Array<{ name: string; entries: number }> = [];
    for (const key of owned.slice(0, 8)) {
      try {
        result.push({ name: key, entries: (await (await caches.open(key)).keys()).length });
      } catch {
        result.push({ name: key, entries: -1 });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function shortCacheName(name: string): string {
  return name.replace(/^toonstudio-(sw|pwa|covers)-/, "").slice(0, 28) || name;
}

export function PwaOfflinePage() {
  useBilingualI18nRevision();
  const { readiness, cachedResources, prepare } = usePwaOfflineReadiness();
  const [cachesInfo, setCachesInfo] = useState<Array<{ name: string; entries: number }>>([]);
  const [preparing, setPreparing] = useState(false);
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  useEffect(() => {
    let cancelled = false;
    void listOwnedCaches().then((info) => {
      if (!cancelled) setCachesInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  const handlePrepare = useCallback(async () => {
    setPreparing(true);
    try {
      await prepare();
    } finally {
      setPreparing(false);
      setCachesInfo(await listOwnedCaches());
    }
  }, [prepare]);

  const readinessLabel =
    readiness === "ready"
      ? bi("오프라인 준비 완료", "Ready for offline")
      : readiness === "preparing" || preparing
        ? bi("오프라인 팩 준비 중…", "Preparing offline pack…")
        : readiness === "partial"
          ? bi("일부 콘텐츠 오프라인 가능", "Some content available offline")
          : bi("오프라인 팩 상태 확인 중…", "Checking offline pack…");

  return (
    <main className="pwa-offline" aria-labelledby="pwa-offline-title">
      <div className="pwa-offline__card">
        <OfflineHeroArt />
        <p className="pwa-offline__eyebrow">
          <WifiOff size={14} aria-hidden="true" />
          {bi("연결 없음", "No connection")}
        </p>
        <h1 id="pwa-offline-title" className="pwa-offline__title">
          {bi("오프라인이에요", "You're offline")}
        </h1>
        <p className="pwa-offline__description">
          {bi(
            "인터넷 연결이 끊겼어요. 하지만 창작은 멈추지 않습니다 — 기기에 저장된 작업은 그대로 이어갈 수 있어요.",
            "Your internet connection dropped. But creation doesn't stop — pick up right where you left off with what's saved on this device.",
          )}
        </p>

        <div className="pwa-offline__actions">
          <button type="button" className="pwa-offline__primary" onClick={handleRetry}>
            <RefreshCw size={18} aria-hidden="true" />
            {online
              ? bi("다시 시도", "Try again")
              : bi("연결 확인 후 다시 시도", "Retry when connected")}
          </button>
          <a href="/offline-draw/" className="pwa-offline__primary pwa-offline__draw">
            <PenLine size={18} aria-hidden="true" />
            {bi("긴급 드로잉 보드 열기", "Open emergency drawing board")}
          </a>
          <button
            type="button"
            className="pwa-offline__secondary"
            onClick={handlePrepare}
            disabled={preparing || readiness === "preparing"}
          >
            <Download size={18} aria-hidden="true" />
            {bi("오프라인 팩 준비", "Prepare offline pack")}
          </button>
        </div>

        <div
          className="pwa-offline__readiness"
          role="status"
          aria-live="polite"
          data-readiness={readiness}
        >
          <CloudOff size={16} aria-hidden="true" />
          <span>{readinessLabel}</span>
          {cachedResources !== null && (
            <strong>
              {bi(`캐시된 리소스 ${cachedResources}개`, `${cachedResources} cached resources`)}
            </strong>
          )}
        </div>

        {cachesInfo.length > 0 && (
          <section className="pwa-offline__caches" aria-label={bi("오프라인 저장소", "Offline storage")}>
            <h2>{bi("기기에 저장된 콘텐츠", "Content on this device")}</h2>
            <ul>
              {cachesInfo.map((cache) => (
                <li key={cache.name}>
                  <span className="pwa-offline__cache-name">{shortCacheName(cache.name)}</span>
                  <span className="pwa-offline__cache-count">
                    {cache.entries >= 0
                      ? bi(`${cache.entries}개`, `${cache.entries} items`)
                      : bi("확인 불가", "unknown")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pwa-offline__features" aria-label={bi("오프라인에서 할 수 있는 것", "What you can do offline")}>
          <h2>{bi("오프라인에서 할 수 있는 것", "What you can do offline")}</h2>
          <ul>
            {OFFLINE_FEATURES.map((feature) => (
              <li key={feature.ko}>
                <span className="pwa-offline__feature-icon" aria-hidden="true">
                  <feature.icon size={20} />
                </span>
                <div>
                  <strong>{bi(feature.ko, feature.en)}</strong>
                  <span>{bi(feature.koDescription, feature.enDescription)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          className="pwa-offline__install-link"
          onClick={openPwaInstallShowcase}
        >
          {bi("앱으로 설치하면 오프라인이 더 편해져요 →", "Installing the app makes offline even better →")}
        </button>
      </div>
    </main>
  );
}
