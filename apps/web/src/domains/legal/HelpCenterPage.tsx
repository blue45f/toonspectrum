import {
  Accessibility,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Compass,
  Database,
  FileWarning,
  Layers,
  LifeBuoy,
  Map as MapIcon,
  MessageSquarePlus,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { BrowserReadinessDiagnostics } from "./BrowserReadinessDiagnostics";
import { helpSearchTokens, rankHelpItems, rankRelatedScreens, type HelpSearchFields } from "./help-search";
import { SiteLinkCard } from "./public/site-link-card";
import { SitePageArt } from "./public/site-page-art";
import { SitePageHeader } from "./public/site-page-header";
import { SITEMAP_DIRECTORY_ENTRIES } from "./site-directory-data";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container, Section } from "@/shared/components/section";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

type Bilingual = readonly [ko: string, en: string];

interface HelpTopic {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly href: string;
  readonly title: Bilingual;
  readonly description: Bilingual;
  /** 검색어 매칭용 추가 키워드(표시하지 않음). */
  readonly keywords: Bilingual;
}

const TOPICS: readonly HelpTopic[] = [
  {
    id: "start",
    icon: BookOpen,
    href: "/studio/new",
    title: ["처음 시작하기", "Getting started"],
    description: ["무엇을 만들지 고르고 빠르게 첫 작업을 시작합니다.", "Choose what to make and begin your first task quickly."],
    keywords: ["시작 만들기 프로젝트 새 작품", "start create project new work"],
  },
  {
    id: "studio",
    icon: Layers,
    href: "/studio/manual",
    title: ["Studio 사용법", "Using Studio"],
    description: ["캔버스·레이어·브러시·말풍선·3D·내보내기를 찾아봅니다.", "Learn canvas, layers, brushes, balloons, 3D and export."],
    keywords: ["스튜디오 캔버스 레이어 브러시 말풍선 3d 내보내기", "studio canvas layers brushes balloons 3d export"],
  },
  {
    id: "projects",
    icon: FileWarning,
    href: "/studio",
    title: ["프로젝트·저장·복구", "Projects, save & recovery"],
    description: ["최근 프로젝트, 로컬 초안, 버전, 백업과 복구 경로를 확인합니다.", "Find recent projects, local drafts, versions, backup and recovery."],
    keywords: ["프로젝트 저장 동기화 복구 백업 오프라인", "project save sync recovery backup offline"],
  },
  {
    id: "market",
    icon: Store,
    href: "/market",
    title: ["에셋과 사용권", "Assets & licenses"],
    description: ["에셋의 호환성, 라이선스, 설치와 배포 방법을 확인합니다.", "Understand compatibility, licenses, installation and distribution."],
    keywords: ["에셋 마켓 라이선스 사용권 설치 배포", "assets market license install publish"],
  },
  {
    id: "account",
    icon: UserRound,
    href: "/settings",
    title: ["계정과 내 데이터", "Account & data"],
    description: ["언어, 기록, 서재 데이터, 가져오기·내보내기와 계정 설정을 관리합니다.", "Manage language, history, library data, import/export and account."],
    keywords: ["계정 설정 데이터 서재 가져오기 내보내기 로그인", "account settings data library import export sign in"],
  },
  {
    id: "data",
    icon: Database,
    href: "/about/data",
    title: ["작품 데이터와 출처", "Story data & sources"],
    description: ["랭킹·통계·추정값이 어디에서 왔는지 확인합니다.", "See where rankings, statistics and estimates come from."],
    keywords: ["데이터 출처 랭킹 통계 추정값", "data sources ranking stats estimated"],
  },
  {
    id: "rights",
    icon: ShieldCheck,
    href: "/copyright",
    title: ["저작권과 신고", "Copyright & reporting"],
    description: ["콘텐츠 권리, 공개 데이터 정책, 신고와 문의 경로를 확인합니다.", "Review content rights, public-data policy, reports and contacts."],
    keywords: ["저작권 권리 신고 정책 개인정보", "copyright rights report policy privacy"],
  },
  {
    id: "sitemap",
    icon: MapIcon,
    href: "/sitemap",
    title: ["전체 기능 찾기", "Find every feature"],
    description: ["메뉴에서 못 찾은 화면을 목적별 사이트맵에서 찾습니다.", "Find any screen in the purpose-based site directory."],
    keywords: ["사이트맵 메뉴 전체 기능 페이지 찾기", "sitemap menu all features pages find"],
  },
];

const POPULAR_TERMS: readonly Bilingual[] = [
  ["브러시", "brushes"],
  ["저장", "save"],
  ["말풍선", "balloons"],
  ["라이선스", "license"],
];

interface HelpQuestion {
  readonly question: Bilingual;
  readonly answer: Bilingual;
  readonly href: string;
  readonly link: Bilingual;
  /** 검색어 매칭용 추가 키워드(표시하지 않음). */
  readonly keywords: Bilingual;
}

const QUESTIONS: readonly HelpQuestion[] = [
  {
    question: ["웹툰 작업은 어디서 시작하나요?", "Where do I start a webtoon?"],
    answer: [
      "새로 만들기에서 만들고 싶은 작업을 고르세요. 도구가 낯설다면 Studio 사용법에서 캔버스·레이어·브러시·말풍선 순서로 살펴볼 수 있습니다.",
      "Choose what to make from Create. If the tools are new to you, the Studio manual walks through the canvas, layers, brushes and speech balloons.",
    ],
    href: "/studio/new",
    link: ["첫 작업 시작", "Start your first work"],
    keywords: ["시작 새 작품 만들기 처음", "start new work create first"],
  },
  {
    question: ["로컬 저장과 백업은 어떻게 다른가요?", "How does local saving differ from a backup?"],
    answer: [
      "로컬 작업은 현재 기기와 브라우저에 저장됩니다. 브라우저 데이터를 지우거나 기기를 바꾸기 전에 중요한 작업을 파일로 내보내 보관하세요. 로컬 복구가 클라우드 백업을 대신하지는 않습니다.",
      "Local work is stored in your current browser and device. Export important work before clearing browser data or moving to another device. Local recovery does not replace a cloud backup.",
    ],
    href: "/studio/manual",
    link: ["저장·내보내기 안내", "Saving and export guide"],
    keywords: ["저장 백업 복구 내보내기 오프라인 사라짐", "save backup recovery export offline lost"],
  },
  {
    question: ["마켓 리소스를 작품에 사용해도 되나요?", "Can I use marketplace resources in my work?"],
    answer: [
      "각 리소스의 라이선스와 출처, 상업 이용·수정·재배포 조건을 먼저 확인하세요. 같은 마켓 안에서도 사용 조건은 리소스마다 다를 수 있습니다.",
      "Check each resource's license, source and terms for commercial use, modification and redistribution. Conditions can differ between resources.",
    ],
    href: "/market",
    link: ["리소스와 사용 조건 확인", "Explore resources and terms"],
    keywords: ["에셋 마켓 라이선스 사용권 상업 이용", "assets market license commercial use"],
  },
  {
    question: ["로그인이 안 되면 어떻게 하나요?", "What if I can't sign in?"],
    answer: [
      "로그인하지 않아도 작품 탐색과 이 기기에서의 로컬 편집은 바로 쓸 수 있습니다. 로그인 창에서 연결 오류가 나면 서비스 상태를 먼저 확인하고, 계속되면 이용 문의로 알려 주세요.",
      "Browsing and local editing on this device work without signing in. If the sign-in window shows a connection error, check the service status first and contact support if it continues.",
    ],
    href: "/status",
    link: ["서비스 상태 확인", "Check service status"],
    keywords: ["로그인 계정 가입 비밀번호 인증", "sign in login account signup password"],
  },
];

const topicFields = (topic: HelpTopic): HelpSearchFields => ({
  primary: topic.title,
  secondary: [...topic.description, ...topic.keywords],
});

const questionFields = (entry: HelpQuestion): HelpSearchFields => ({
  primary: entry.question,
  secondary: [...entry.answer, ...entry.keywords],
});

export function HelpCenterPage() {
  const bt = useBilingual("HelpCenterPage");
  const [query, setQuery] = useState("");
  // 문제형 문장("저장이 안 돼요")도 낱말 단위로 풀어 주제·질문·관련 화면에서 함께 찾는다.
  const tokens = helpSearchTokens(query);
  const searching = tokens.length > 0;
  const filtered = rankHelpItems(TOPICS, topicFields, tokens);
  const matchedQuestions = searching ? rankHelpItems(QUESTIONS, questionFields, tokens) : [];
  const related = searching
    ? rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, tokens, new Set(filtered.map((topic) => topic.href)))
    : [];
  const faqFiltered = matchedQuestions.length > 0;
  const questions = faqFiltered ? matchedQuestions : QUESTIONS;
  const nothingFound = searching && filtered.length === 0 && related.length === 0 && matchedQuestions.length === 0;
  const searchLabel = bt("도움말 검색", "Search help");

  useDocumentTitle(bt("도움말", "Help Center"));

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={LifeBuoy}
        eyebrow="HELP CENTER"
        title={bt("막힌 곳을 풀고, 다음 컷으로.", "Get unstuck. Draw the next panel.")}
        description={bt(
          "메뉴 이름을 몰라도 괜찮습니다. 하고 싶은 일이나 문제를 검색하면 관련 기능과 안내로 연결합니다.",
          "You do not need to know the menu name. Search for a task or problem and jump to the right feature or guide.",
        )}
        aside={<SitePageArt kind="learn" caption={bt("브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다", "Brand concept art · not an editor capture")} />}
        asideClassName="hidden lg:block"
      >
        <label className="flex min-h-12 max-w-2xl items-center gap-3 rounded-2xl border border-line-strong bg-card/90 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
          <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="sr-only">{searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={bt("예: 저장이 안 돼요, 말풍선, 에셋 라이선스", "e.g. save failed, speech balloon, asset license")}
            enterKeyHint="search"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={bt("자주 찾는 도움말", "Popular help topics")}>
          {POPULAR_TERMS.map((term) => {
            const label = bt(...term);
            return (
              <button
                key={term[0]}
                type="button"
                onClick={() => setQuery(label)}
                aria-pressed={query === label}
                className="min-h-11 rounded-full border border-line bg-card/70 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {label}
              </button>
            );
          })}
        </div>
      </SitePageHeader>

      <Section
        className="mt-10 sm:mt-12"
        eyebrow="FIND YOUR ANSWER"
        title={bt("도움말 주제", "Help topics")}
        desc={
          searching
            ? formatI18nTemplate(bt("‘{v0}’와 관련된 주제·화면·질문이에요.", "Topics, screens and questions related to ‘{v0}’."), { v0: query.trim() })
            : bt("주제를 누르면 관련 화면이나 안내로 바로 이동해요.", "Each topic opens the related screen or guide.")
        }
      >
        <p className="sr-only" aria-live="polite">
          {searching
            ? formatI18nTemplate(bt("주제 {v0}개 · 관련 화면 {v1}개 · 질문 {v2}개", "{v0} topics · {v1} related screens · {v2} questions"), {
              v0: filtered.length,
              v1: related.length,
              v2: matchedQuestions.length,
            })
            : `${filtered.length} ${bt("개 주제", "topics")}`}
        </p>
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {filtered.map((topic) => (
              <SiteLinkCard
                key={topic.id}
                layout="tile"
                href={topic.href}
                icon={topic.icon}
                title={bt(...topic.title)}
                description={bt(...topic.description)}
                cta={bt("관련 화면 열기", "Open related screen")}
              />
            ))}
          </div>
        ) : !nothingFound ? (
          <p className="rounded-2xl border border-dashed border-line bg-panel/40 px-4 py-3 text-xs leading-5 text-fg-2">
            {bt("주제에서는 찾지 못했어요. 아래 관련 화면과 자주 묻는 질문을 확인해 보세요.", "No topic matched. Check the related screens and questions below.")}
          </p>
        ) : (
          <ActionableEmptyState
            icon={CircleHelp}
            art="search"
            title={bt("일치하는 주제를 찾지 못했습니다.", "No matching help topic found.")}
            description={bt("다른 표현으로 검색하거나 전체 기능 찾기에서 화면을 골라 보세요.", "Try another phrase or pick a screen from the full directory.")}
            primary={{ href: "/sitemap", label: bt("전체 기능 찾기", "Find every feature") }}
          >
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:border-accent/50 hover:text-accent"
            >
              {bt("검색어 지우기", "Clear search")}
            </button>
          </ActionableEmptyState>
        )}

        {related.length > 0 ? (
          <div className="mt-8">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Compass size={16} className="text-accent" aria-hidden="true" />
              {bt("관련 화면", "Related screens")}
            </h3>
            <p className="mt-1 text-xs text-fg-3">{bt("전체 기능 목록(사이트맵)에서 검색어와 이름·설명이 맞는 화면이에요.", "Screens from the full site directory whose name or description matches.")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {related.map((entry) => (
                <SiteLinkCard
                  key={entry.href}
                  layout="compact"
                  href={entry.href}
                  icon={Compass}
                  title={bt(entry.label.ko, entry.label.en)}
                  description={bt(entry.description.ko, entry.description.en)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        className="mt-12 sm:mt-14"
        eyebrow="FAQ"
        title={bt("작업을 시작하기 전에", "Before you start drawing")}
        desc={
          faqFiltered
            ? bt("검색어와 관련된 질문을 펼쳐 두었어요.", "Questions related to your search are expanded.")
            : bt("자주 묻는 질문을 먼저 정리했어요.", "The questions people ask most.")
        }
      >
        <div className="divide-y divide-line border-y border-line">
          {questions.map((entry) => (
            <details key={entry.href} open={faqFiltered || undefined} className="group py-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
                {bt(...entry.question)}
                <span aria-hidden="true" className="text-accent transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">{bt(...entry.answer)}</p>
              <Link href={entry.href} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-accent">
                {bt(...entry.link)}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </details>
          ))}
        </div>
      </Section>

      <Section
        className="mt-12 sm:mt-14"
        eyebrow="STILL STUCK?"
        title={bt("그래도 해결되지 않았다면", "Still need a hand?")}
        desc={bt("상황을 알려 주시면 확인 후 안내해 드려요.", "Tell us what happened and we'll follow up.")}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SiteLinkCard
            layout="compact"
            href="/feedback"
            icon={MessageSquarePlus}
            title={bt("제보·제안 보내기", "Send feedback")}
            description={bt("오류나 불편한 점을 알려 주세요.", "Report a bug or friction point.")}
          />
          <SiteLinkCard
            layout="compact"
            href="/support"
            icon={LifeBuoy}
            title={bt("이용 문의", "Contact support")}
            description={bt("계정·결제·이용 문제를 문의해요.", "Ask about accounts, billing or usage.")}
          />
          <SiteLinkCard
            layout="compact"
            href="/accessibility"
            icon={Accessibility}
            title={bt("접근성 안내", "Accessibility")}
            description={bt("키보드·화면 읽기 지원 범위를 확인해요.", "See keyboard and screen reader support.")}
          />
        </div>
      </Section>

      <BrowserReadinessDiagnostics />
    </Container>
  );
}
