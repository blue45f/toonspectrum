import {
  Accessibility,
  ArrowUpRight,
  BookOpenCheck,
  Brush,
  Check,
  ChevronDown,
  Clipboard,
  Copyright,
  HardDriveDownload,
  KeyRound,
  LifeBuoy,
  MessageCircleQuestion,
  PackageCheck,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import "./support-center.css";

import { SiteShowMoreButton } from "./public/site-rail";
import { useMobileShowMore } from "./public/site-show-more";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/container";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { MotionEmptyState } from "@/shared/motion-assets/motion-assets-empty";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SupportPage", ko, en);

const SUPPORT_PATHS = [
  {
    id: "recovery",
    icon: HardDriveDownload,
    ko: {
      title: "저장·동기화·복구",
      description: "저장 상태, 다른 탭 동기화, 버전 복구와 임시 작업을 확인합니다.",
      keywords: "저장 동기화 복구 임시 작업 버전 사라짐 autosave sync",
      links: [["버전·복구 열기", "/studio/versions"], ["Studio 도움말", "/studio/manual"]],
    },
    en: {
      title: "Save, sync & recovery",
      description: "Check save state, cross-tab sync, version recovery and temporary work.",
      keywords: "save sync recovery temporary version lost autosave",
      links: [["Open versions & recovery", "/studio/versions"], ["Studio manual", "/studio/manual"]],
    },
  },
  {
    id: "account",
    icon: KeyRound,
    ko: {
      title: "계정·로그인·데이터",
      description: "로그인, 프로필, 데이터 보관과 계정 설정을 확인합니다.",
      keywords: "계정 로그인 프로필 데이터 탈퇴 비밀번호 account login",
      links: [["내 정보", "/me"], ["설정", "/settings"]],
    },
    en: {
      title: "Account, login & data",
      description: "Check login, profile, data retention and account settings.",
      keywords: "account login profile data withdrawal password",
      links: [["My info", "/me"], ["Settings", "/settings"]],
    },
  },
  {
    id: "drawing",
    icon: Brush,
    ko: {
      title: "드로잉·브러시·편집기",
      description: "캔버스, 브러시, 레이어, 단축키와 작업공간 문제를 해결합니다.",
      keywords: "그림 드로잉 브러시 캔버스 레이어 편집기 단축키 drawing brush canvas",
      links: [["Studio 사용 설명서", "/studio/manual"], ["브러시 작업공간", "/studio/brushes"]],
    },
    en: {
      title: "Drawing, brushes & editor",
      description: "Fix canvas, brush, layer, shortcut and workspace issues.",
      keywords: "drawing brush canvas layer editor shortcuts",
      links: [["Studio manual", "/studio/manual"], ["Brush workspace", "/studio/brushes"]],
    },
  },
  {
    id: "assets",
    icon: PackageCheck,
    ko: {
      title: "마켓·에셋·호환성",
      description: "설치한 소재, 업데이트, 파일 형식과 프로젝트 호환성을 확인합니다.",
      keywords: "마켓 에셋 소재 설치 다운로드 업데이트 호환성 market asset install",
      links: [["내 에셋", "/market/library"], ["에셋 핏 랩", "/market/fit"]],
    },
    en: {
      title: "Market, assets & compatibility",
      description: "Check installed materials, updates, file formats and project compatibility.",
      keywords: "market asset material install download update compatibility",
      links: [["My assets", "/market/library"], ["Asset fit lab", "/market/fit"]],
    },
  },
  {
    id: "accessibility",
    icon: Accessibility,
    ko: {
      title: "접근성·키보드·표시",
      description: "키보드 조작, 화면 표시, 모션과 보조 기술 지원을 확인합니다.",
      keywords: "접근성 키보드 스크린리더 대비 모션 accessibility keyboard",
      links: [["접근성 안내", "/accessibility"], ["디자인 시스템", "/design"]],
    },
    en: {
      title: "Accessibility, keyboard & display",
      description: "Check keyboard operation, screen display, motion and assistive tech support.",
      keywords: "accessibility keyboard screen reader contrast motion",
      links: [["Accessibility guide", "/accessibility"], ["Design system", "/design"]],
    },
  },
  {
    id: "rights",
    icon: Copyright,
    ko: {
      title: "저작권·개인정보·권리",
      description: "콘텐츠 권리, 신고 절차와 개인정보 처리 기준을 확인합니다.",
      keywords: "저작권 권리 개인정보 신고 삭제 privacy copyright",
      links: [["저작권 안내", "/copyright"], ["개인정보처리방침", "/privacy"]],
    },
    en: {
      title: "Copyright, privacy & rights",
      description: "Check content rights, reporting procedures and privacy handling standards.",
      keywords: "copyright rights privacy report delete",
      links: [["Copyright notice", "/copyright"], ["Privacy policy", "/privacy"]],
    },
  },
] as const;

/** 휴대폰에서 처음 보여 주는 해결 경로 수 — 나머지는 "더 보기"로 펼친다(넓은 화면은 모두 보임). */
const MOBILE_PATH_LIMIT = 3;
const COPIED_RESET_MS = 2_500;

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}

function supportDiagnostic(): string {
  if (typeof window === "undefined") return "";
  const pathname = window.location.pathname;
  const values = [
    bi("ToonStudio 지원 진단", "ToonStudio support diagnostic"),
    `${bi("경로", "Path")}: ${pathname}`,
    `${bi("온라인", "Online")}: ${navigator.onLine ? bi("예", "Yes") : bi("아니요", "No")}`,
    `${bi("언어", "Language")}: ${navigator.language || bi("알 수 없음", "Unknown")}`,
    `${bi("화면", "Screen")}: ${window.innerWidth}×${window.innerHeight}`,
    `${bi("격리 실행", "Isolated execution")}: ${globalThis.crossOriginIsolated === true ? bi("예", "Yes") : bi("아니요", "No")}`,
    `${bi("시각", "Time")}: ${new Date().toISOString()}`,
  ];
  return values.join("\n");
}

export function SupportPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("이용 문의 · 문제 해결과 지원 경로", "Support · troubleshooting and help paths"));

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const matches = useMemo(() => {
    const terms = normalized(query).split(" ").filter(Boolean);
    if (!terms.length) return SUPPORT_PATHS;
    return SUPPORT_PATHS.filter((item) => {
      const ko = item.ko;
      const en = item.en;
      const text = normalized(`${ko.title} ${ko.description} ${ko.keywords} ${en.title} ${en.description} ${en.keywords}`);
      return terms.every((term) => text.includes(term));
    });
  }, [query]);
  const mobilePaths = useMobileShowMore(matches.length, MOBILE_PATH_LIMIT, query);
  const copyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(supportDiagnostic());
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Container size="wide" className="support-center py-7 sm:py-10 lg:py-12">
      <header className="support-center__hero">
        <div>
          <p className="support-center__eyebrow"><LifeBuoy size={15} aria-hidden="true" /> TOONSTUDIO · SUPPORT</p>
          <h1>{bi("막힌 작업을 찾고,", "Find what got stuck,")}<br />{bi("안전하게 다시 이어가세요.", "and continue safely.")}</h1>
          <p>{bi("이용 문의는 문제 해결과 적절한 지원 경로를 찾는 공간입니다. 공개 버그·아이디어·기능 요청은 제보·제안 보드에서 별도로 다룹니다.", "Support is where you solve problems and find the right help path. Public bugs, ideas and feature requests are handled separately on the feedback board.")}</p>
        </div>
        <div className="support-center__hero-actions">
          <Link href="/feedback?type=question"><MessageCircleQuestion size={17} aria-hidden="true" /> {bi("공개 이용 질문", "Public usage questions")}</Link>
          <Link href="/feedback?type=bug" data-secondary><Wrench size={17} aria-hidden="true" /> {bi("버그 제보", "Report a bug")}</Link>
        </div>
      </header>

      <section className="support-center__finder" aria-labelledby="support-finder-title">
        <div>
          <p className="support-center__eyebrow">01 · FIND A PATH</p>
          <h2 id="support-finder-title">{bi("어떤 문제를 해결하고 있나요?", "What problem are you solving?")}</h2>
          <p>{bi("기능 이름이나 증상을 검색하면 관련 설정과 복구 화면으로 바로 이동할 수 있습니다.", "Search a feature name or symptom to jump straight to related settings and recovery screens.")}</p>
        </div>
        <label className="support-center__search">
          <span className="sr-only">{bi("지원 항목 검색", "Search support topics")}</span>
          <Search size={19} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder={bi("예: 저장 복구, 로그인, 브러시, 에셋 설치", "e.g. save recovery, login, brush, asset install")} />
        </label>
        <p className="support-center__result-count" role="status">{bi(`${matches.length}개의 해결 경로`, `${matches.length} resolution paths`)}</p>
        {matches.length ? (
          <>
            <div className="support-center__path-grid">
              {matches.map((item, index) => {
                const copy = bi(item.ko, item.en);
                return (
                  <article key={item.id} data-mobile-hidden={mobilePaths.hiddenOnMobile(index) || undefined}>
                    <span className="support-center__path-icon"><item.icon size={21} aria-hidden="true" /></span>
                    <h3>{copy.title}</h3>
                    <p>{copy.description}</p>
                    <div>{copy.links.map(([label, href]) => <Link key={href} href={href}>{label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div>
                  </article>
                );
              })}
            </div>
            <SiteShowMoreButton
              className="sm:hidden"
              remaining={mobilePaths.remaining}
              onClick={mobilePaths.expand}
              label={bi(`해결 경로 ${mobilePaths.remaining}개 더 보기`, `Show ${mobilePaths.remaining} more paths`)}
            />
          </>
        ) : (
          <MotionEmptyState
            kind="search"
            title={bi("일치하는 도움말을 찾지 못했어요.", "No matching help topic found.")}
            description={bi("검색어를 줄이거나 공개 이용 질문으로 상황을 알려주세요. 개인정보와 미공개 작품은 게시하지 마세요.", "Shorten your search or tell us what happened through public questions. Don't post personal data or unpublished works.")}
            action={
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised"
              >
                {bi("검색 초기화", "Reset search")}
              </button>
            }
          />
        )}
      </section>

      <div className="support-center__lower-grid">
        <section className="support-center__diagnostic" aria-labelledby="support-diagnostic-title">
          <p className="support-center__eyebrow">02 · PREPARE CONTEXT</p>
          <h2 id="support-diagnostic-title">{bi("문제 확인에 필요한 정보만 복사", "Copy only what's needed to check the problem")}</h2>
          <p>{bi("현재 주소의 쿼리·작품 ID·입력 내용은 제외하고 경로, 연결 상태, 언어, 화면 크기만 복사합니다. 자동 전송하지 않습니다.", "Only the path, connection state, language and screen size are copied — query strings, work IDs and input are excluded. Nothing is sent automatically.")}</p>
          <details className="support-center__preview">
            <summary>{bi("복사될 내용 미리 보기", "Preview what will be copied")}<ChevronDown size={16} aria-hidden="true" /></summary>
            <pre aria-label={bi("복사될 진단 정보", "Diagnostic info to be copied")}>{supportDiagnostic()}</pre>
          </details>
          <button type="button" onClick={() => { void copyDiagnostic(); }}>
            {copied ? <Check size={17} aria-hidden="true" /> : <Clipboard size={17} aria-hidden="true" />}
            {copied ? bi("복사했습니다", "Copied") : bi("진단 정보 복사", "Copy diagnostic info")}
          </button>
        </section>

        <section className="support-center__channels" aria-labelledby="support-channel-title">
          <p className="support-center__eyebrow">03 · CHOOSE A CHANNEL</p>
          <h2 id="support-channel-title">{bi("문의 성격에 맞는 공간", "A place matched to your inquiry")}</h2>
          <ul>
            <li><BookOpenCheck size={19} aria-hidden="true" /><div><strong>{bi("사용법과 일반 질문", "How-to & general questions")}</strong><span>{bi("도움말을 먼저 확인하고 해결되지 않으면 공개 이용 질문을 남깁니다.", "Check the help center first; if that doesn't solve it, leave a public question.")}</span><Link href="/help">{bi("도움말 보기", "View help")}<ArrowUpRight size={14} /></Link></div></li>
            <li><Wrench size={19} aria-hidden="true" /><div><strong>{bi("버그·아이디어·기능 요청", "Bugs, ideas & feature requests")}</strong><span>{bi("중복을 검색하고 다른 사용자의 경험과 운영 상태를 함께 확인합니다.", "Search for duplicates and compare with other users' experiences and service status.")}</span><Link href="/feedback">{bi("제보·제안 보드", "Feedback board")}<ArrowUpRight size={14} /></Link></div></li>
            <li><ShieldAlert size={19} aria-hidden="true" /><div><strong>{bi("개인정보·결제·미공개 작품", "Privacy, payments & unpublished works")}</strong><span>{bi("공개 게시판에 입력하지 말고 관련 정책과 권리 절차를 먼저 확인합니다.", "Don't enter them on the public board — check the relevant policies and rights procedures first.")}</span><Link href="/privacy">{bi("개인정보 안내", "Privacy guide")}<ArrowUpRight size={14} /></Link></div></li>
          </ul>
        </section>
      </div>
    </Container>
  );
}
