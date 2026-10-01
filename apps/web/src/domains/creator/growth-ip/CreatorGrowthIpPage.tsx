// 작가 성장·IP 작업대 — 보호(연령 정책) → 발굴·지원 → 제작·협업 → 확장 → 준비 순서로 섹션을 묶은 한 페이지.
// 섹션 본문은 sections/*, 공통 조각은 GrowthIpUi, 라벨은 growth-ip-labels에 있다.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { SharePageButton } from "@/shared/components/share-page-button";
import { Container } from "@/shared/components/section";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
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
import { bi, biLabel, GROWTH_BUTTON, GROWTH_PRIMARY } from "./growth-ip-shared";
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

const SECTION_IDS: readonly GrowthSectionId[] = GROWTH_SECTIONS.map((section) => section.id);

type PageNotice = { readonly section: GrowthSectionId | "page"; readonly message: string };

function loadInitialState(): CreatorGrowthIpState {
  try {
    return loadCreatorGrowthIpState(globalThis.localStorage);
  } catch {
    return structuredClone(EMPTY_CREATOR_GROWTH_IP_STATE);
  }
}

/** 화면 가운데를 지나는 섹션을 목차에서 표시한다(IntersectionObserver가 없으면 표시하지 않음). */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function WorkSummary({ state }: { state: CreatorGrowthIpState }) {
  const items: readonly { section: GrowthSectionId; label: string; value: number }[] = [
    { section: "support", label: bi("발굴 프로필", "Profiles"), value: state.rookieProfiles.length },
    { section: "support", label: bi("지원 요청", "Support requests"), value: state.supportRequests.length },
    { section: "assistants", label: bi("어시스트 후보", "Assistant candidates"), value: state.assistantCandidates.length },
    { section: "story", label: bi("웹소설 회차", "Novel chapters"), value: state.novelChapters.length },
    { section: "voice", label: bi("음성 대사", "Voice lines"), value: state.voiceDialogues.length },
    { section: "rights", label: bi("판권 제안", "Rights inquiries"), value: state.rightsInquiries.length },
    { section: "education", label: bi("교육 과정", "Programs"), value: state.educationPrograms.length },
  ];
  return (
    <section aria-labelledby="growth-summary-title" className="mt-6">
      <h2 id="growth-summary-title" className="text-sm font-black text-fg">{bi("내 작업 현황", "My workspace at a glance")}</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {items.map((item) => (
          <li key={item.label}>
            <a
              href={`#${item.section}`}
              className="flex min-h-11 flex-col rounded-xl border border-line bg-card px-3 py-2.5 transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-[0.72rem] font-semibold text-fg-2">{item.label}</span>
              <span className="mt-0.5 text-xl font-black tabular-nums text-fg">{item.value}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionNav({ active }: { active: string | null }) {
  const listRef = useRef<HTMLOListElement>(null);

  // 좁은 화면에서는 목차가 가로로 넘치므로, 지금 읽는 섹션 항목이 목차 가운데에 오도록 가로로만 옮긴다.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active) return;
    const link = list.querySelector<HTMLElement>(`a[href="#${active}"]`);
    if (!link || list.scrollWidth <= list.clientWidth) return;
    const listRect = list.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const delta = linkRect.left - listRect.left - (listRect.width - linkRect.width) / 2;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    list.scrollBy({ left: delta, behavior: reduceMotion ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      aria-label={bi("작업대 섹션", "Workspace sections")}
      className="sticky top-2 z-10 mt-6 rounded-2xl border border-line bg-card/95 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <ol ref={listRef} className="flex gap-1 overflow-x-auto [scrollbar-width:thin]">
        {GROWTH_SECTIONS.map((section, index) => {
          const Icon = SECTION_ICON[section.id];
          const current = active === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  current ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <span aria-hidden className="text-[0.65rem] tabular-nums text-fg-3">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={14} aria-hidden className={current ? "text-accent" : undefined} />
                {biLabel(section.label)}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function CreatorGrowthIpPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("작가 성장·IP 확장", "Creator growth & IP"));
  const [state, setState] = useState<CreatorGrowthIpState>(loadInitialState);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [guideSpeaking, setGuideSpeaking] = useState(false);
  const speechAdapter = useMemo(() => createBrowserDialogueSpeechAdapter(), []);
  const activeSection = useActiveSection(SECTION_IDS);

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
  const sectionProps = (section: GrowthSectionId) => ({ state, update, notify: notifyIn(section), notice: noticeIn(section) });

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

  const ageLimited = state.ageBand !== "18-plus";
  const pageNotice = notice?.section === "page" ? notice.message : null;

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative isolate overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 -z-10 size-80 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 32%, transparent), transparent 70%)" }}
        />
        <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-accent">CREATOR GROWTH · STORY · IP</p>
        <h1 className="mt-2 max-w-5xl text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {bi("신인 발굴부터 연재·협업·판권 확장까지", "From creator discovery to publishing, collaboration and IP expansion")}
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi("웹툰·웹소설 창작자가 성장하며 필요한 지원과 업무를 하나의 흐름으로 묶었습니다. 위에서부터 차례로 — 연령 정책 확인 → 발굴·지원 → 제작·협업 → 판권·공유 → 환경·교육 — 진행하면 됩니다.", "Creator support and webtoon/web-novel operations in one flow. Work top to bottom: age policy → discovery & support → production & collaboration → rights & sharing → environment & education.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={GROWTH_PRIMARY} aria-pressed={guideSpeaking} onClick={speakGuide}>
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
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs leading-5 text-fg-2">
          <span className="inline-flex items-center gap-1.5"><HardDrive size={14} aria-hidden className="text-accent" />{bi("작업 내용은 이 브라우저에만 저장됩니다. 공개·계약·고용·결제는 직접 확인하기 전까지 실행하지 않습니다.", "Work stays in this browser. Publishing, contracts, hiring and payments never run without your explicit confirmation.")}</span>
          <a href="#age" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-fg hover:text-accent">
            <Compass size={14} aria-hidden className="text-accent" />
            {bi("연령대", "Age band")}: {biLabel(AGE_BAND_LABEL[state.ageBand])}
            {ageLimited ? <span className="font-semibold text-fg-2">· {bi("일부 기능 제한", "some features limited")}</span> : null}
          </a>
        </div>
      </header>

      {saveError ? (
        <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm leading-6 text-fg">{saveError}</p>
      ) : null}
      <p role="status" className={pageNotice ? "mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2" : "sr-only"}>
        {pageNotice ?? ""}
      </p>

      <WorkSummary state={state} />
      <SectionNav active={activeSection} />

      <AgePolicySection {...sectionProps("age")} />
      <DiscoverySupportSection {...sectionProps("support")} />
      <AssistantSourcingSection {...sectionProps("assistants")} />
      <StoryAdaptationSection {...sectionProps("story")} />
      <VoiceDialogueSection {...sectionProps("voice")} speechAdapter={speechAdapter} />
      <RightsInquirySection {...sectionProps("rights")} />
      <SocialShareSection notify={notifyIn("share")} notice={noticeIn("share")} />
      <EnvironmentSection notify={notifyIn("environment")} notice={noticeIn("environment")} />
      <div className="mb-12">
        <EducationSection {...sectionProps("education")} />
      </div>
    </Container>
  );
}
