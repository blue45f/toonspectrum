import { Check, Download, MonitorDown, Smartphone, X, Zap } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
  type PwaInstallPlatform,
} from "@/shared/lib/pwa-install-store";

import {
  getPwaInstallPlatformGuide,
  listPwaInstallPlatformGuides,
} from "./pwa-install-platform-guide";
import type { PwaShowcaseTrigger } from "./pwa-install-showcase-schedule";

import "./pwa-install-showcase.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-install-showcase", ko, en);

const APP_ICON_URL = resolveAssetUrl("/brand/spectrum-ribbon-v2/icon-192.png");
/** 기존 고화질 브랜드 이미지 재활용 — 히어로 배경용. */
const HERO_BACKDROP_URL = resolveAssetUrl("/brand/atelier-20260927/creation-world.webp");

interface FeatureCard {
  readonly icon: "offline" | "fast" | "fullscreen" | "sync";
  readonly ko: string;
  readonly en: string;
  readonly koDescription: string;
  readonly enDescription: string;
}

const FEATURES: readonly FeatureCard[] = [
  {
    icon: "offline",
    ko: "오프라인에서도 그리기",
    en: "Draw even offline",
    koDescription: "인터넷이 끊겨도 캔버스는 멈추지 않아요. 작업은 기기에 안전하게 저장됩니다.",
    enDescription: "The canvas never stops, even without internet. Your work is saved safely on-device.",
  },
  {
    icon: "fast",
    ko: "1초 만에 실행",
    en: "Launches in a second",
    koDescription: "홈 화면 아이콘 하나로 스튜디오가 바로 열립니다. 브라우저를 켤 필요가 없어요.",
    enDescription: "One home-screen icon opens the studio instantly — no browser needed.",
  },
  {
    icon: "fullscreen",
    ko: "전체화면 캔버스",
    en: "Fullscreen canvas",
    koDescription: "주소창 없는 넓은 화면에서 콘티와 작화에만 집중할 수 있어요.",
    enDescription: "Focus on storyboards and artwork with a chromeless, fullscreen canvas.",
  },
  {
    icon: "sync",
    ko: "자동 저장·동기화",
    en: "Auto-save & sync",
    koDescription: "온라인이 되면 오프라인 작업이 자동으로 클라우드에 동기화됩니다.",
    enDescription: "Offline work syncs to the cloud automatically once you're back online.",
  },
];

function FeatureArt({ icon }: { icon: FeatureCard["icon"] }) {
  switch (icon) {
    case "offline":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className="pwa-showcase__art">
          <rect x="6" y="10" width="52" height="38" rx="10" className="art-bg" />
          <path d="M14 34a8 8 0 0 1 2-15.7A11 11 0 0 1 37 16a8.5 8.5 0 0 1 12 8.4" className="art-line" />
          <path d="M20 40l24-16M44 40L20 24" className="art-accent-line" strokeLinecap="round" />
          <path d="M28 52l4 6 4-6" className="art-line" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "fast":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className="pwa-showcase__art">
          <rect x="6" y="10" width="52" height="38" rx="10" className="art-bg" />
          <path d="M36 14L20 36h10l-2 14 16-22H34l2-14z" className="art-accent-fill" strokeLinejoin="round" />
          <circle cx="50" cy="48" r="3" className="art-dot" />
          <circle cx="14" cy="52" r="2" className="art-dot" />
        </svg>
      );
    case "fullscreen":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className="pwa-showcase__art">
          <rect x="14" y="14" width="36" height="36" rx="6" className="art-bg" />
          <path d="M22 26h6v6M42 26h-6v6M22 42h6v-6M42 42h-6v-6" className="art-line" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 20V12a4 4 0 0 1 4-4h8M56 20V12a4 4 0 0 0-4-4h-8M8 44v8a4 4 0 0 0 4 4h8M56 44v8a4 4 0 0 1-4 4h-8" className="art-accent-line" strokeLinecap="round" />
        </svg>
      );
    case "sync":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className="pwa-showcase__art">
          <rect x="6" y="10" width="52" height="38" rx="10" className="art-bg" />
          <path d="M24 24a10 10 0 0 1 17-3M40 40a10 10 0 0 1-17 3" className="art-line" strokeLinecap="round" />
          <path d="M41 17v6h-6M23 47v-6h6" className="art-accent-line" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 32l4 4 7-8" className="art-accent-line" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function HeroArt() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" className="pwa-showcase__hero-art">
      <defs>
        <linearGradient id="pwa-hero-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <rect x="30" y="18" width="70" height="84" rx="12" className="art-phone" transform="rotate(-8 65 60)" />
      <rect x="100" y="18" width="70" height="84" rx="12" className="art-phone" transform="rotate(8 135 60)" />
      <circle cx="100" cy="60" r="26" fill="url(#pwa-hero-g)" opacity="0.9" />
      <path d="M92 60l6 6 11-12" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="26" r="4" className="art-spark" />
      <circle cx="160" cy="30" r="3" className="art-spark" />
      <circle cx="168" cy="92" r="5" className="art-spark" />
      <circle cx="34" cy="94" r="3" className="art-spark" />
    </svg>
  );
}

export interface PwaInstallShowcaseProps {
  readonly onClose: () => void;
  readonly onInstalled: () => void;
  readonly trigger?: PwaShowcaseTrigger | null;
  /** 모달이 아닌 단독 페이지로 렌더링한다 (/install 라우트용). */
  readonly page?: boolean;
}

export function PwaInstallShowcase({
  onClose,
  onInstalled,
  trigger = null,
  page = false,
}: PwaInstallShowcaseProps) {
  useBilingualI18nRevision();
  const titleId = useId();
  const descriptionId = useId();
  const featuresTitleId = useId();
  const guideTitleId = useId();
  const TitleTag = page ? "h1" : "h2";
  // 섹션 제목은 제목 위계를 건너뛰지 않는다: 페이지(h1)에선 h2, 임베드(h2)에선 h3.
  const SectionTitleTag = page ? "h2" : "h3";
  const dialogRef = useRef<HTMLDivElement>(null);
  const [installState, setInstallState] = useState<"idle" | "prompting" | "done" | "manual">("idle");
  const [activeTab, setActiveTab] = useState<PwaInstallPlatform>(() => {
    const snapshot = getPwaInstallSnapshot();
    return snapshot.platform === "unknown" ? "android" : snapshot.platform;
  });
  const guide = getPwaInstallPlatformGuide(activeTab);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (page) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, page]);

  // 설치 완료 이벤트를 구독해 스케줄에 반영한다.
  useEffect(() => subscribePwaInstall(() => {
    if (getPwaInstallSnapshot().status === "installed") {
      setInstallState("done");
      onInstalled();
    }
  }), [onInstalled]);

  const handleInstall = useCallback(async () => {
    setInstallState("prompting");
    const result = await requestPwaInstall();
    if (result === "accepted" || result === "installed") {
      setInstallState("done");
      onInstalled();
      close();
    } else if (result === "manual") {
      setInstallState("manual");
    } else {
      setInstallState("idle");
    }
  }, [close, onInstalled]);

  const snapshot = getPwaInstallSnapshot();
  const isIos = snapshot.platform === "ios" && !snapshot.standalone;
  const ctaLabel = isIos
    ? bi("설치 방법 보기", "See install steps")
    : bi("앱 설치하기", "Install the app");

  const content = (
    <div className="pwa-showcase" data-trigger={trigger ?? "manual"}>
      <div className="pwa-showcase__hero">
        <img
          src={HERO_BACKDROP_URL}
          alt=""
          aria-hidden="true"
          className="pwa-showcase__hero-backdrop"
          loading="lazy"
          decoding="async"
        />
        {!page && (
          <button
            type="button"
            className="pwa-showcase__close"
            onClick={close}
            aria-label={bi("닫기", "Close")}
            data-autofocus
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
        <HeroArt />
        <img
          src={APP_ICON_URL}
          alt=""
          width={96}
          height={96}
          className="pwa-showcase__icon"
          decoding="async"
        />
        <TitleTag id={titleId} className="pwa-showcase__title">
          {bi("툰스튜디오를 앱으로 설치하세요", "Install ToonStudio as an app")}
        </TitleTag>
        <p id={descriptionId} className="pwa-showcase__subtitle">
          {bi(
            "홈 화면에서 바로 열리는 나만의 창작 스튜디오 — 오프라인에서도 멈추지 않아요.",
            "Your own creative studio, one tap from the home screen — it keeps going even offline.",
          )}
        </p>
        <div className="pwa-showcase__cta-row">
          <button
            type="button"
            className="pwa-showcase__cta"
            onClick={isIos ? () => setInstallState("manual") : handleInstall}
            disabled={installState === "prompting" || installState === "done"}
          >
            {installState === "done" ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Download size={18} aria-hidden="true" />
            )}
            <span>
              {installState === "prompting"
                ? bi("설치 중…", "Installing…")
                : installState === "done"
                  ? bi("설치 완료!", "Installed!")
                  : ctaLabel}
            </span>
          </button>
          {!page && (
            <button type="button" className="pwa-showcase__later" onClick={close}>
              {bi("나중에", "Later")}
            </button>
          )}
        </div>
      </div>

      <section className="pwa-showcase__features" aria-labelledby={featuresTitleId}>
        <SectionTitleTag id={featuresTitleId} className="pwa-showcase__section-title">
          {bi("왜 앱으로 설치하나요?", "Why install the app?")}
        </SectionTitleTag>
        <ul className="pwa-showcase__feature-grid">
          {FEATURES.map((feature) => (
            <li key={feature.icon} className="pwa-showcase__feature-card">
              <FeatureArt icon={feature.icon} />
              <strong>{bi(feature.ko, feature.en)}</strong>
              <span>{bi(feature.koDescription, feature.enDescription)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pwa-showcase__guide" data-manual={installState === "manual" || undefined} aria-labelledby={guideTitleId}>
        <SectionTitleTag id={guideTitleId} className="pwa-showcase__section-title">
          {bi("기기별 설치 방법", "Install steps by device")}
        </SectionTitleTag>
        <div className="pwa-showcase__tabs" role="tablist" aria-label={bi("기기 선택", "Choose device")}>
          {listPwaInstallPlatformGuides().map((platformGuide) => (
            <button
              key={platformGuide.platform}
              type="button"
              role="tab"
              aria-selected={activeTab === platformGuide.platform}
              className="pwa-showcase__tab"
              data-active={activeTab === platformGuide.platform || undefined}
              onClick={() => setActiveTab(platformGuide.platform)}
            >
              {platformGuide.platform === "desktop" ? (
                <MonitorDown size={16} aria-hidden="true" />
              ) : (
                <Smartphone size={16} aria-hidden="true" />
              )}
              {bi(platformGuide.tabKo, platformGuide.tabEn)}
            </button>
          ))}
        </div>
        <p className="pwa-showcase__guide-headline">{bi(guide.headlineKo, guide.headlineEn)}</p>
        <ol className="pwa-showcase__steps">
          {guide.steps.map((step, index) => (
            <li key={step.ko} className="pwa-showcase__step">
              <span className="pwa-showcase__step-number" aria-hidden="true">{index + 1}</span>
              <div className="pwa-showcase__step-body">
                <strong>{bi(step.ko, step.en)}</strong>
                <span>{bi(step.koDescription, step.enDescription)}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="pwa-showcase__footnote">
        <Zap size={14} aria-hidden="true" />
        {bi(
          "설치는 무료이며, 기존 계정과 작업은 그대로 유지됩니다.",
          "Installation is free, and your account and work stay exactly as they are.",
        )}
      </p>
    </div>
  );

  if (page) return content;

  return (
    <div
      className="pwa-showcase__overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="pwa-showcase__dialog"
      >
        {content}
      </div>
    </div>
  );
}

/** /install 라우트용 페이지 래퍼. 본문 랜드마크(main)는 AppShell 하나만 소유한다. */
export function PwaInstallShowcasePage() {
  const handleClose = useCallback(() => {
    window.history.back();
  }, []);
  const handleInstalled = useCallback(() => undefined, []);
  return (
    <div className="pwa-showcase-page">
      <PwaInstallShowcase onClose={handleClose} onInstalled={handleInstalled} page trigger="manual" />
    </div>
  );
}
