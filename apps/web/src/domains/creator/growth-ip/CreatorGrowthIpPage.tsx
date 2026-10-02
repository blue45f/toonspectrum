// 작가 성장·IP 작업대 — 보호(연령 정책) → 발굴·지원 → 제작·협업 → 확장 → 준비 순서의 9단계를 탭으로 나눠
// 한 번에 한 단계만 보여 준다(세로로 9개를 쌓지 않는다). 단계 본문은 sections/*, 탭은 GrowthSectionTabs,
// 주소 해시 동기화는 growth-section-nav, 라벨은 growth-ip-labels에 있다.
import {
  BookOpen,
  Compass,
  GraduationCap,
  HardDrive,
  Headphones,
  Mic2,
  MonitorCheck,
  Scale,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  UserRoundSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { SharePageButton } from "@/shared/components/share-page-button";
import { Container } from "@/shared/components/section";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import {
  choosePreferredDialogueVoice,
  createBrowserDialogueSpeechAdapter,
} from "../lettering/studio-dialogue-read-aloud";
import {
  EMPTY_CREATOR_GROWTH_IP_STATE,
  loadCreatorGrowthIpState,
  saveCreatorGrowthIpState,
  type CreatorGrowthIpState,
} from "./creator-growth-ip-model";
import { AGE_BAND_LABEL, GROWTH_SECTIONS, type GrowthSectionId } from "./growth-ip-labels";
import { bi, biLabel, GROWTH_BUTTON, type GrowthSectionProps } from "./growth-ip-shared";
import { growthPanelId, growthSectionCounts, growthTabId, useGrowthSectionHash } from "./growth-section-nav";
import { GrowthSectionTabs, GrowthStepFooter } from "./GrowthSectionTabs";
import { AgePolicySection, DiscoverySupportSection } from "./sections/GrowthCareSections";
import { EducationSection, EnvironmentSection, RightsInquirySection, SocialShareSection } from "./sections/GrowthExpansionSections";
import { AssistantSourcingSection, StoryAdaptationSection, VoiceDialogueSection } from "./sections/GrowthProductionSections";

const SECTION_ICON: Record<GrowthSectionId, LucideIcon> = {
  age: ShieldCheck,
  support: UserRoundSearch,
  assistants: UsersRound,
  story: BookOpen,
  voice: Mic2,
  rights: Scale,
  share: Share2,
  environment: MonitorCheck,
  education: GraduationCap,
};

type PageNotice = { readonly section: GrowthSectionId | "page"; readonly message: string };

function loadInitialState(): CreatorGrowthIpState {
  try {
    return loadCreatorGrowthIpState(globalThis.localStorage);
  } catch {
    return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE);
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function CreatorGrowthIpPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("작가 성장·IP 확장", "Creator growth & IP"));
  const [state, setState] = useState<CreatorGrowthIpState>(loadInitialState);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [guideSpeaking, setGuideSpeaking] = useState(false);
  const speechAdapter = useMemo(() => createBrowserDialogueSpeechAdapter(), []);
  const panelsRef = useRef<HTMLDivElement>(null);

  // 본문 안 "연령 정책으로 이동" 같은 해시 링크로 단계가 바뀌면, 새 단계가 열린 뒤 패널 영역 머리로 화면을 옮긴다.
  const followHashNavigation = useCallback(() => {
    requestAnimationFrame(() => {
      panelsRef.current?.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }, []);
  const { active, select } = useGrowthSectionHash("age", followHashNavigation);
  /** 머리말의 바로가기처럼 탭 줄에서 떨어진 곳에서 단계를 열 때는, 열린 단계의 머리까지 화면을 옮긴다. */
  const openSection = useCallback((id: GrowthSectionId) => {
    select(id);
    followHashNavigation();
  }, [select, followHashNavigation]);
  const counts = useMemo(() => growthSectionCounts(state), [state]);

  useEffect(() => {
    try {
      saveCreatorGrowthIpState(globalThis.localStorage, state);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : bi("이 브라우저에 저장하지 못했습니다.", "Could not save in this browser."));
    }
  }, [state]);

  useEffect(() => () => {
    speechAdapter.cancel();
  }, [speechAdapter]);

  const update = useCallback((recipe: (current: CreatorGrowthIpState) => CreatorGrowthIpState) => {
    setState(recipe);
  }, []);

  const notifyIn = (section: PageNotice["section"]) => (message: string) => setNotice({ section, message });
  const noticeIn = (section: GrowthSectionId): string | null => (notice?.section === section ? notice.message : null);
  const sectionProps = (section: GrowthSectionId): GrowthSectionProps => ({ state, update, notify: notifyIn(section), notice: noticeIn(section) });

  const speakGuide = () => {
    if (guideSpeaking) {
      speechAdapter.cancel();
      setGuideSpeaking(false);
      setNotice({ section: "page", message: bi("음성 안내를 중지했습니다.", "Stopped voice guidance.") });
      return;
    }
    const copy = bi(
      "이 작업대에서는 연령 정책 확인, 신인 작가 지원, 업무 보조 인력 소싱, 웹소설과 웹툰 기획, 음성 대사, 판권 제안, SNS 공유, 앱 설치와 사용 환경 점검, 교육 과정을 한곳에서 관리할 수 있습니다. 계약과 결제는 자동 실행하지 않습니다.",
      "This workspace brings age policy, creator support, assistant sourcing, web novel and webtoon planning, voice dialogue, rights inquiries, social sharing, app installation, environment checks and education together. Contracts and payments are never automatic.",
    );
    const locale = bi("ko-KR", "en-US");
    const voice = choosePreferredDialogueVoice(speechAdapter.getVoices(), { lang: locale }, locale);
    const started = speechAdapter.speak({ text: copy, rate: 1, voice, onEnd: () => setGuideSpeaking(false), onError: () => setGuideSpeaking(false) });
    setGuideSpeaking(started);
    if (!started) setNotice({ section: "page", message: bi("이 브라우저에서는 음성 안내를 사용할 수 없습니다.", "Browser voice guidance is unavailable.") });
  };

  const renderSection = (id: GrowthSectionId): ReactNode => {
    switch (id) {
      case "age": return <AgePolicySection {...sectionProps("age")} />;
      case "support": return <DiscoverySupportSection {...sectionProps("support")} />;
      case "assistants": return <AssistantSourcingSection {...sectionProps("assistants")} />;
      case "story": return <StoryAdaptationSection {...sectionProps("story")} />;
      case "voice": return <VoiceDialogueSection {...sectionProps("voice")} speechAdapter={speechAdapter} />;
      case "rights": return <RightsInquirySection {...sectionProps("rights")} />;
      case "share": return <SocialShareSection notify={notifyIn("share")} notice={noticeIn("share")} />;
      case "environment": return <EnvironmentSection notify={notifyIn("environment")} notice={noticeIn("environment")} />;
      case "education": return <EducationSection {...sectionProps("education")} />;
    }
  };

  const ageLimited = state.ageBand !== "18-plus";
  const pageNotice = notice?.section === "page" ? notice.message : null;

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <header className="relative isolate overflow-hidden rounded-3xl border border-line bg-card p-5 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 -z-10 size-80 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 32%, transparent), transparent 70%)" }}
        />
        <p className="eyebrow text-accent">CREATOR GROWTH · STORY · IP</p>
        <h1 className="mt-2 max-w-4xl text-balance break-keep text-3xl font-black tracking-tight text-fg sm:text-4xl lg:text-5xl">
          {bi("신인 발굴부터 연재·협업·판권 확장까지", "From creator discovery to publishing, collaboration and IP expansion")}
        </h1>
        <p className="mt-3 max-w-3xl text-pretty break-keep text-base leading-7 text-fg-2">
          {bi("필요한 단계만 탭으로 열어 쓰세요. 위에서 아래 순서(연령 정책 → 발굴·지원 → 제작 → 판권·공유 → 환경·교육)대로 진행하면 가장 자연스럽습니다.", "Open only the step you need. Following the tabs in order — age policy → support → production → rights & sharing → environment & education — is the smoothest path.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={GROWTH_BUTTON} aria-pressed={guideSpeaking} onClick={speakGuide}>
            {guideSpeaking ? <Square size={15} aria-hidden /> : <Headphones size={16} aria-hidden />}
            {guideSpeaking ? bi("음성 안내 중지", "Stop voice guide") : bi("음성으로 안내 듣기", "Listen to the guide")}
          </button>
          <SharePageButton
            path="/studio/growth-ip"
            text={bi("작가 성장·IP 확장 작업대", "Creator growth & IP workspace")}
            description={bi("신인작가 지원, 웹소설→웹툰 각색, 판권·교육·협업 기능", "Creator support, adaptation, rights, education and collaboration")}
            label={bi("공유", "Share")}
            className="min-h-11 rounded-xl px-4 text-sm"
          />
          <Link to="/studio/ecosystem" className={GROWTH_BUTTON}><Sparkles size={16} aria-hidden />{bi("창작 생태계 보기", "Creator ecosystem")}</Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm leading-6 text-fg-2">
          <span className="inline-flex items-start gap-1.5">
            <HardDrive size={14} aria-hidden className="mt-1.5 shrink-0 text-accent" />
            {bi("작업 내용은 이 브라우저에만 저장됩니다. 공개·계약·고용·결제는 직접 확인하기 전까지 실행하지 않습니다.", "Work stays in this browser. Publishing, contracts, hiring and payments never run without your explicit confirmation.")}
          </span>
          <button
            type="button"
            onClick={() => openSection("age")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg font-bold text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Compass size={14} aria-hidden className="text-accent" />
            {bi("연령대", "Age band")}: {biLabel(AGE_BAND_LABEL[state.ageBand])}
            {ageLimited ? <span className="font-semibold text-fg-2">· {bi("일부 기능 제한", "some features limited")}</span> : null}
          </button>
        </div>
      </header>

      {saveError ? (
        <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm leading-6 text-fg">{saveError}</p>
      ) : null}
      <p role="status" className={pageNotice ? "mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2" : "sr-only"}>
        {pageNotice ?? ""}
      </p>

      <GrowthSectionTabs active={active} icons={SECTION_ICON} counts={counts} onSelect={select} />

      {/*
        9개 단계를 모두 그려 두고 선택한 단계만 보여 준다(hidden). 단계를 오가도 쓰던 입력 초안이 사라지지 않는다.
        단계마다 패널이 하나씩 있어 탭 ↔ 패널 연결(aria-controls·aria-labelledby)이 정확하다.
      */}
      <div ref={panelsRef} className="scroll-mt-[calc(var(--site-header-sticky-offset,5rem)+4.5rem)] pb-12">
        {GROWTH_SECTIONS.map(({ id }) => (
          <div key={id} role="tabpanel" id={growthPanelId(id)} aria-labelledby={growthTabId(id)} hidden={active !== id}>
            {renderSection(id)}
          </div>
        ))}
        <GrowthStepFooter active={active} onSelect={select} />
      </div>
    </Container>
  );
}
