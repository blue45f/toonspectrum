import { Settings, Globe, Star, SlidersHorizontal, ShieldCheck, Trash2, Check, Download, Upload, Clock, SearchX, UserCog, ChevronDown, ChevronRight, Sparkles, PlugZap, RefreshCw, KeyRound, Crown, Gauge, Languages, MonitorSmartphone, Database, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { SiteTabPanel } from "@/domains/legal/public/site-section-tabs";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";

import { AccountMergeSettings } from "./AccountMergeSettings";
import { ConnectedAccountsSettings } from "./ConnectedAccountsSettings";
import { LibraryBackupImport } from "./LibraryBackupImport";
import { detectBrowserRegionSettings, planRegionSettingsSync, readLocalRegionSettings, writeLocalRegionSettings } from "./region-settings-client";

import { AppearanceSettings } from "@/shared/components/appearance/AppearanceSettings";
import { PageIntro } from "@/shared/components/page-intro";
import { RegionalPreferences } from "@/shared/components/RegionalPreferences";
import { useSiteExperience } from "@/shared/components/site-experience/site-experience-context";
import { Container } from "@/shared/components/section";
import { SectionNav, type SectionNavItem } from "@/shared/components/section-nav";
import { Switch } from "@/shared/components/ui/switch";
import { useI18n, useT } from "@/shared/lib/i18n";
import { VoiceGuideSettingsSection } from "@/shared/voice";
import { AmbientSettingsSection } from "@/shared/ambient";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";
import { useApp, useHydrated, type RatingScale } from "@/shared/lib/store";
import {
  getRememberFlag,
  setRememberFlag,
  clearAllRememberedFilters,
} from "@/shared/lib/use-remembered-filters";
import { patchRegionSettings, type RegionSettings, type RegionSettingsPatch } from "@/shared/lib/region-settings";
import { getMyProfile, updateMyProfile } from "@/platform/me-client";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SettingsPage", ko, en);

/** 설정 화면 위쪽의 관련 설정 바로가기 — 카드 문법을 한곳에서 맞추기 위한 데이터. */
const RELATED_SETTINGS: ReadonlyArray<{
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
}> = [
  {
    href: "/membership",
    icon: Crown,
    title: ["멤버십 · 포인트 · 용량 정책", "Membership, points & storage"],
    description: ["내 등급의 저장공간·업로드 한도와 활동 포인트 적립 기준 확인", "Review storage, upload limits and activity-point rules for your tier"],
  },
  {
    href: "/membership/usage",
    icon: Gauge,
    title: ["내 사용량 · 멤버십 알림", "My usage & membership notices"],
    description: ["실제 저장공간, 오늘 업로드량, 포인트 적립 잔여량과 한도 경고 확인", "See actual storage, today's uploads, reward limits and quota notices"],
  },
  {
    href: "/settings/ai",
    icon: Sparkles,
    title: ["AI 연결과 사용 순서", "AI connections & order"],
    description: ["초보자용 빠른 연결, 자동 무료 AI와 기능별 사용 순서를 한곳에서 관리", "Quick setup, automatic free AI and per-feature order in one place"],
  },
  {
    href: "/settings/api-keys",
    icon: KeyRound,
    title: ["API 키 허브", "API key hub"],
    description: ["AI·Unsplash 키를 한곳에서 마스킹 표시로 안전하게 관리", "Manage AI and Unsplash keys in one place, always masked"],
  },
  {
    href: "/settings/integrations",
    icon: PlugZap,
    title: ["외부 시스템 연동", "External integrations"],
    description: ["저장소·업무·알림·게시·결제 연결 상태와 권한 확인", "Review storage, work, notification, publishing and payment connections"],
  },
];

type SettingsTab = "display" | "region" | "data" | "account";
const SETTINGS_TABS: readonly SettingsTab[] = ["display", "region", "data", "account"];
const SETTINGS_TAB_PREFIX = "settings";

/** 예전 섹션 앵커(공유 링크·다른 화면의 바로가기)를 해당 탭으로 연다. */
const SETTINGS_HASH_TABS: Readonly<Record<string, SettingsTab>> = {
  "#settings-display": "display",
  "#settings-voice": "display",
  "#settings-ambient": "display",
  "#settings-region": "region",
  "#settings-filters": "region",
  "#settings-age": "data",
  "#settings-data": "data",
  "#account-security": "account",
};

// 단일 선택 컨트롤 — radiogroup 시맨틱 + 방향키 이동(roving tabindex).
function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));

  const move = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-card/40 p-0.5">
      {options.map((o, index) => {
        const checked = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(event) => move(event, index)}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              checked ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// 로컬 저장 피드백 토스트 — role="status" 로 스크린리더에 알린다.
function SavedToast({ visible, message }: { visible: boolean; message: string }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <p
        role="status"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-fg shadow-lg"
      >
        <Check size={16} className="shrink-0 text-good" aria-hidden />
        {message}
      </p>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Globe;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line/60 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-2">{desc}</p>
        </div>
      </div>
      <div className="min-w-0 sm:max-w-[60%] sm:pl-4">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const hydrated = useHydrated();
  const experience = useSiteExperience();
  const lang = useI18n((s) => s.lang);
  const userId = useApp((s) => s.userId);
  const setLang = useI18n((s) => s.setLang);
  const ratingScale = useApp((s) => s.ratingScale);
  const setRatingScale = useApp((s) => s.setRatingScale);
  const adultVerified = useApp((s) => s.adultVerified);
  const adultBirthdate = useApp((s) => s.adultBirthdate);
  const setAdultVerified = useApp((s) => s.setAdultVerified);
  const openAgeGate = useApp((s) => s.openAgeGate);
  const resetAll = useApp((s) => s.resetAll);
  const hydrateFromServer = useApp((s) => s.hydrateFromServer);
  const recentCount = useApp((s) => s.recentlyViewed.length);
  const clearRecentlyViewed = useApp((s) => s.clearRecentlyViewed);
  const recentSearchCount = useApp((s) => s.recentSearches.length);
  const clearRecentSearches = useApp((s) => s.clearRecentSearches);

  const [remember, setRemember] = useState(false);
  const [filtersCleared, setFiltersCleared] = useState(false);
  const [recentCleared, setRecentCleared] = useState(false);
  const [searchesCleared, setSearchesCleared] = useState(false);
  const [dataReset, setDataReset] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const t = useT();
  const [regionPreferences, setRegionPreferences] = useState<RegionSettings>(() =>
    detectBrowserRegionSettings(lang),
  );
  const [regionStatus, setRegionStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [regionMessage, setRegionMessage] = useState<string | null>(null);
  const [regionRetryKey, setRegionRetryKey] = useState(0);
  const [saveNotice, setSaveNotice] = useState(false);
  const saveNoticeTimer = useRef<number | undefined>(undefined);
  const langRef = useRef(lang);
  langRef.current = lang;
  const scaleOptions: { id: RatingScale; label: string }[] = [
    { id: "star", label: t("settings.rating.star") },
    { id: "ten", label: t("settings.rating.ten") },
    { id: "hundred", label: t("settings.rating.hundred") },
  ];

  // 로컬 설정 저장 피드백 — 토스트로 "저장됨"을 알린다.
  const flashSaved = useCallback(() => {
    setSaveNotice(true);
    window.clearTimeout(saveNoticeTimer.current);
    saveNoticeTimer.current = window.setTimeout(() => setSaveNotice(false), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(saveNoticeTimer.current), []);

  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({ ids: SETTINGS_TABS, fallback: "display", param: "view" });
  useSiteTabAnchors(SETTINGS_HASH_TABS, activeTab, selectTab);
  const tabs = useMemo<readonly SectionNavItem[]>(
    () => [
      { id: "display", icon: MonitorSmartphone, label: bi("화면·음성", "Display & voice") },
      { id: "region", icon: Languages, label: bi("지역·필터", "Region & filters") },
      { id: "data", icon: Database, label: bi("연령·데이터", "Age & data") },
      { id: "account", icon: UserCog, label: t("settings.section.account") },
    ],
    [t],
  );
  // 공용 SectionNav(표준 S-2)는 문자열 id로 알려 주므로 알려진 탭 id만 상태로 되돌린다.
  const selectNavTab = useCallback((id: string) => {
    const next = SETTINGS_TABS.find((tab) => tab === id);
    if (next) selectTab(next);
  }, [selectTab]);

  useEffect(() => {
    let cancelled = false;
    const syncRegionPreferences = async () => {
      setRegionStatus("loading");
      setRegionMessage(null);
      const detected = detectBrowserRegionSettings(langRef.current);
      const local = readLocalRegionSettings();
      const provisional = local ?? detected;
      if (!local) writeLocalRegionSettings(provisional);
      if (!cancelled) {
        setRegionPreferences(provisional);
        if (provisional.language !== langRef.current) {
          setLang(provisional.language);
        }
      }

      if (!userId) {
        const plan = planRegionSettingsSync({
          local,
          remote: null,
          detected,
        });
        if (cancelled) return;
        if (plan.shouldWriteLocal) writeLocalRegionSettings(plan.settings);
        setRegionPreferences(plan.settings);
        if (plan.settings.language !== langRef.current) {
          setLang(plan.settings.language);
        }
        setRegionStatus("idle");
        return;
      }
      const profile = await getMyProfile(undefined, true);
      const plan = planRegionSettingsSync({
        local,
        remote: profile.regionSettings,
        detected,
      });
      if (cancelled) return;
      if (plan.shouldWriteLocal) writeLocalRegionSettings(plan.settings);
      setRegionPreferences(plan.settings);
      if (plan.settings.language !== langRef.current) {
        setLang(plan.settings.language);
      }

      if (plan.shouldPushRemote) {
        const updated = await updateMyProfile({
          regionSettings: plan.settings,
        });
        if (cancelled) return;
        const canonical = updated.regionSettings ?? plan.settings;
        writeLocalRegionSettings(canonical);
        setRegionPreferences(canonical);
      }
      setRegionStatus("saved");
    };

    void syncRegionPreferences().catch(() => {
      if (cancelled) return;
      setRegionStatus("error");
      setRegionMessage(
        langRef.current.startsWith("ko")
          ? "지역 설정을 서버와 동기화하지 못했습니다. 이 기기의 설정은 유지됩니다."
          : "Could not sync region settings. Local preferences are preserved.",
      );
    });

    return () => {
      cancelled = true;
    };
  }, [userId, setLang, regionRetryKey]);

  // 내 서재(별점·읽음·구독·컬렉션)는 이 브라우저에만 저장되므로 JSON 백업으로 내보내기/가져오기 지원.
  const doExport = () => {
    const s = useApp.getState();
    const payload = {
      _app: "toonstudio-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      ratings: s.ratings,
      reads: s.reads,
      subscriptions: s.subscriptions,
      reviews: s.reviews,
      likedReviews: s.likedReviews,
      collections: s.collections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toonstudio-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 클라이언트에서만 localStorage 기반 선호값 반영.
  useStateOnceHydrated(hydrated, () => setRemember(getRememberFlag()));

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    setRememberFlag(next);
    if (!next) setFiltersCleared(true);
    flashSaved();
  };
  const clearFilters = () => {
    clearAllRememberedFilters();
    setRemember(false);
    setFiltersCleared(true);
    flashSaved();
  };
  const doReset = () => {
    resetAll();
    setDataReset(true);
    setConfirmReset(false);
    flashSaved();
  };

  const changeRegionPreference = (
    field: "country" | "language" | "currency" | "timezone",
    nextValue: string,
  ) => {
    const patch: RegionSettingsPatch = { [field]: nextValue };
    const next = patchRegionSettings(regionPreferences, patch);
    if (!next) {
      setRegionStatus("error");
      setRegionMessage(
        lang.startsWith("ko")
          ? "지원하지 않는 지역 설정입니다."
          : "That regional preference is not supported.",
      );
      return;
    }

    setRegionPreferences(next);
    writeLocalRegionSettings(next);
    if (field === "language") setLang(next.language);

    if (!userId) {
      setRegionStatus("saved");
      setRegionMessage(null);
      return;
    }

    setRegionStatus("saving");
    setRegionMessage(null);
    void updateMyProfile({ regionSettings: next })
      .then((profile) => {
        const canonical = profile.regionSettings ?? next;
        setRegionPreferences(canonical);
        writeLocalRegionSettings(canonical);
        setRegionStatus("saved");
      })
      .catch(() => {
        setRegionStatus("error");
        setRegionMessage(
          lang.startsWith("ko")
            ? "서버 저장에 실패했습니다. 이 기기의 설정은 유지됩니다."
            : "Server save failed. Local preferences are preserved.",
        );
      });
  };

  return (
    <Container size="default" className="py-6 sm:py-14">
      <PageIntro variant="restrained">
      <div className="max-w-3xl">
      <SitePageHeader
        surface="plain"
        className="mb-6"
        icon={Settings}
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      {/* 다른 설정 화면(멤버십·AI·API 키·연동)은 접어 두어 이 화면의 설정 탭이 첫 화면에 보이게 한다. */}
      <details className="group mb-6 rounded-2xl border border-line bg-panel/40" data-related-settings="">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">
              {bi("다른 설정 화면", "More settings pages")}
              <span className="ml-1.5 rounded-full bg-raised px-1.5 py-0.5 text-[0.68rem] font-bold text-fg-3">{RELATED_SETTINGS.length}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-fg-3">
              {RELATED_SETTINGS.map((item) => bi(...item.title)).join(" · ")}
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <nav aria-label={bi("관련 설정", "Related settings")} className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
          {RELATED_SETTINGS.map((item) => (
            <SiteLinkCard
              key={item.href}
              layout="compact"
              href={item.href}
              icon={item.icon}
              title={bi(...item.title)}
              description={bi(...item.description)}
            />
          ))}
        </nav>
      </details>
      </div>

      {/* 섹션 내비는 공용 SectionNav(표준 S-2) — 좁은 화면은 상단 탭 줄, 넓은 화면은 좌측 레일. */}
      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <SectionNav
        mode="tabs"
        className="mb-6 lg:mb-0"
        items={tabs}
        value={activeTab}
        onChange={selectNavTab}
        label={bi("설정 영역", "Settings areas")}
        idPrefix={SETTINGS_TAB_PREFIX}
      />
      <div className="min-w-0 max-w-3xl">

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="display" active={activeTab === "display"} mounted={isMounted("display")}>
      <div id="settings-display" className="scroll-mt-28">
        <section className="mb-6 rounded-2xl border border-line bg-panel/40 p-5" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="mb-4 text-base font-semibold">
            {lang.startsWith("ko") ? "디자인 테마" : "Design themes"}
          </h2>
          <AppearanceSettings />
        </section>

        {/* 표시 설정 */}
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.display")}>
          {experience && <Row icon={Sparkles}
            title={lang.startsWith("ko") ? "화면 효과" : "Appearance"}
            desc={lang.startsWith("ko") ? "화려한 색채와 차분한 화면 중 선택하세요. 스튜디오는 변경되지 않습니다." : "Choose a vivid or calm appearance. Studio remains unchanged."}>
            <Choice options={[
              { id: "vivid", label: lang.startsWith("ko") ? "화려하게" : "Vivid" },
              { id: "calm", label: lang.startsWith("ko") ? "차분하게" : "Calm" },
            ]} value={experience.mode} label={lang.startsWith("ko") ? "화면 효과" : "Appearance"} onChange={(next) => { experience.setMode(next); flashSaved(); }} />
          </Row>}
          <Row icon={Star} title={t("settings.rating.title")} desc={t("settings.rating.desc")}>
            <Choice options={scaleOptions} value={ratingScale} label={t("settings.rating.title")} onChange={(next) => { setRatingScale(next); flashSaved(); }} />
          </Row>
        </section>
      </div>

      <div id="settings-voice" className="mt-6 scroll-mt-28">
        <VoiceGuideSettingsSection />
      </div>

      <div id="settings-ambient" className="mt-6 scroll-mt-28">
        <AmbientSettingsSection />
      </div>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="region" active={activeTab === "region"} mounted={isMounted("region")}>
      <div id="settings-region" className="scroll-mt-28">
        {regionStatus === "loading" ? (
          <div className="rounded-2xl border border-line bg-panel/40 p-5" role="status">
            <span className="skeleton block h-5 w-36 rounded" aria-hidden />
            <span className="skeleton mt-2 block h-4 w-72 max-w-full rounded" aria-hidden />
            <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-hidden>
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className="skeleton block h-11 rounded-xl" />
              ))}
            </div>
            <span className="sr-only">{bi("지역 설정을 불러오는 중…", "Loading region settings…")}</span>
          </div>
        ) : (
          <RegionalPreferences
            value={regionPreferences}
            disabled={regionStatus === "saving"}
            saved={regionStatus === "saved"}
            message={regionStatus === "error" ? null : regionMessage}
            onChange={changeRegionPreference}
          />
        )}
        {regionStatus === "error" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3" role="alert">
            <p className="text-sm text-bad">{regionMessage}</p>
            <button
              type="button"
              onClick={() => setRegionRetryKey((key) => key + 1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
            >
              <RefreshCw size={14} aria-hidden />
              {bi("다시 시도", "Retry")}
            </button>
          </div>
        )}
      </div>

      {/* 필터 */}
      <div id="settings-filters" className="mt-8 scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.filters")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.filters")}>
          <Row
            icon={SlidersHorizontal}
            title={t("settings.filters.remember")}
            desc={t("settings.filters.remember.desc")}
          >
            <Switch
              checked={hydrated && remember}
              aria-label={t("settings.filters.remember")}
              onCheckedChange={toggleRemember}
              disabled={!hydrated}
            />
          </Row>
          <Row
            icon={Trash2}
            title={t("settings.filters.clear")}
            desc={t("settings.filters.clear.desc")}
          >
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              {filtersCleared ? <Check size={14} className="text-good" /> : <Trash2 size={14} />}
              {filtersCleared ? t("settings.data.clear") : t("settings.filters.clearNow")}
            </button>
          </Row>
        </section>
      </div>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="data" active={activeTab === "data"} mounted={isMounted("data")}>
      {/* 연령 확인 */}
      <div id="settings-age" className="scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.age")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.age")}>
          <Row
            icon={ShieldCheck}
            title={t("settings.age.title")}
            desc={
              hydrated && adultVerified
                ? adultBirthdate
                  ? t("settings.age.descriptionVerifiedWithBirthdate").replace("{date}", adultBirthdate)
                  : t("settings.age.descriptionVerified")
                : t("settings.age.description")
            }
          >
            {hydrated && adultVerified ? (
              <button
                type="button"
                onClick={() => setAdultVerified(false)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
              >
                {t("settings.age.reset")}
              </button>
            ) : (
              <button
                type="button"
                onClick={openAgeGate}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                {t("settings.age.verify")}
              </button>
            )}
          </Row>
        </section>
      </div>

      {/* 내 데이터 */}
      <div id="settings-data" className="mt-8 scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.data")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.data")}>
          <Row icon={Download} title={t("settings.data.export")} desc={t("settings.data.exportDesc")}>
            <button
              type="button"
              onClick={doExport}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
            >
              <Download size={14} /> {t("settings.data.export")}
            </button>
          </Row>
          <Row icon={Upload} title={t("settings.data.import")} desc={t("settings.data.importDesc")}>
            <LibraryBackupImport onRestore={hydrateFromServer} locale={lang.toLowerCase().startsWith("ko") ? "ko" : "en"} ownerId={userId} />
          </Row>
          <Row
            icon={Clock}
            title={t("settings.data.recent")}
            desc={`${t("settings.data.recentDesc")}${
              recentCount > 0 ? ` (${t("settings.data.now")} ${formatCount(recentCount, lang)})` : ""
            }`}
          >
            {recentCleared ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.clear")}
              </span>
            ) : (
              <button
                type="button"
                disabled={recentCount === 0}
                onClick={() => {
                  clearRecentlyViewed();
                  setRecentCleared(true);
                  flashSaved();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Clock size={14} /> {t("settings.data.recent")}
              </button>
            )}
          </Row>
          <Row
            icon={SearchX}
            title={t("settings.data.search")}
            desc={`${t("settings.data.searchDesc")}${
              recentSearchCount > 0 ? ` (${t("settings.data.now")} ${formatCount(recentSearchCount, lang)})` : ""
            }`}
          >
            {searchesCleared ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.clear")}
              </span>
            ) : (
              <button
                type="button"
                disabled={recentSearchCount === 0}
                onClick={() => {
                  clearRecentSearches();
                  setSearchesCleared(true);
                  flashSaved();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <SearchX size={14} /> {t("settings.data.search")}
              </button>
            )}
          </Row>
          <Row
            icon={Trash2}
            title={t("settings.data.reset")}
            desc={t("settings.data.resetDesc")}
          >
            {dataReset ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.cleared")}
              </span>
            ) : confirmReset ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={doReset}
                  className="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
                >
                  {t("settings.data.confirmDelete")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-raised"
                >
                  {t("settings.data.cancel")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/50 px-3 py-1.5 text-sm font-medium text-bad transition-colors hover:bg-bad/10"
              >
                <Trash2 size={14} /> {t("settings.data.confirmReset")}
              </button>
            )}
          </Row>
          </section>
      </div>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="account" active={activeTab === "account"} mounted={isMounted("account")}>
      {/* 계정 */}
      <div id="account-security" className="scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.account")}</h2>
        <section
          aria-label={t("settings.section.account")}
          className="rounded-2xl border border-line bg-panel/40 px-5"
        >
          <Row
            icon={UserCog}
            title={t("settings.account.title")}
            desc={t("settings.account.desc")}
          >
            <Link
              to="/me"
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              {t("settings.account.toProfile")} <ChevronRight size={14} />
            </Link>
          </Row>
          <ConnectedAccountsSettings
            userId={typeof userId === "string" && userId ? userId : null}
          />
          <AccountMergeSettings
            userId={typeof userId === "string" && userId ? userId : null}
          />
        </section>
      </div>
      </SiteTabPanel>
      </div>
      </div>
      <SavedToast visible={saveNotice} message={t("settings.filters.saved")} />
      </PageIntro>
    </Container>
  );
}

// 하이드레이션 직후 1회 초기화(localStorage 선호값 반영). effect 의존성 가드.
function useStateOnceHydrated(hydrated: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (hydrated && !done.current) {
      done.current = true;
      fn();
    }
  }, [hydrated, fn]);
}
