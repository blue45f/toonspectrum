import {
  Accessibility,
  ArrowUpRight,
  BookOpenCheck,
  Brush,
  Check,
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

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/container";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const SUPPORT_PATHS = [
  {
    id: "recovery",
    icon: HardDriveDownload,
    title: "저장·동기화·복구",
    description: "저장 상태, 다른 탭 동기화, 버전 복구와 임시 작업을 확인합니다.",
    keywords: "저장 동기화 복구 임시 작업 버전 사라짐 autosave sync",
    links: [
      ["버전·복구 열기", "/studio/versions"],
      ["Studio 도움말", "/studio/manual"],
    ],
  },
  {
    id: "account",
    icon: KeyRound,
    title: "계정·로그인·데이터",
    description: "로그인, 프로필, 데이터 보관과 계정 설정을 확인합니다.",
    keywords: "계정 로그인 프로필 데이터 탈퇴 비밀번호 account login",
    links: [
      ["내 정보", "/me"],
      ["설정", "/settings"],
    ],
  },
  {
    id: "drawing",
    icon: Brush,
    title: "드로잉·브러시·편집기",
    description: "캔버스, 브러시, 레이어, 단축키와 작업공간 문제를 해결합니다.",
    keywords: "그림 드로잉 브러시 캔버스 레이어 편집기 단축키 drawing brush canvas",
    links: [
      ["Studio 사용 설명서", "/studio/manual"],
      ["브러시 작업공간", "/studio/brushes"],
    ],
  },
  {
    id: "assets",
    icon: PackageCheck,
    title: "마켓·에셋·호환성",
    description: "설치한 소재, 업데이트, 파일 형식과 프로젝트 호환성을 확인합니다.",
    keywords: "마켓 에셋 소재 설치 다운로드 업데이트 호환성 market asset install",
    links: [
      ["내 에셋", "/market/library"],
      ["에셋 핏 랩", "/market/fit"],
    ],
  },
  {
    id: "accessibility",
    icon: Accessibility,
    title: "접근성·키보드·표시",
    description: "키보드 조작, 화면 표시, 모션과 보조 기술 지원을 확인합니다.",
    keywords: "접근성 키보드 스크린리더 대비 모션 accessibility keyboard",
    links: [
      ["접근성 안내", "/accessibility"],
      ["디자인 시스템", "/design"],
    ],
  },
  {
    id: "rights",
    icon: Copyright,
    title: "저작권·개인정보·권리",
    description: "콘텐츠 권리, 신고 절차와 개인정보 처리 기준을 확인합니다.",
    keywords: "저작권 권리 개인정보 신고 삭제 privacy copyright",
    links: [
      ["저작권 안내", "/copyright"],
      ["개인정보처리방침", "/privacy"],
    ],
  },
] as const;

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}

function supportDiagnostic(): string {
  if (typeof window === "undefined") return "";
  const pathname = window.location.pathname;
  const values = [
    "ToonStudio 지원 진단",
    `경로: ${pathname}`,
    `온라인: ${navigator.onLine ? "예" : "아니요"}`,
    `언어: ${navigator.language || "알 수 없음"}`,
    `화면: ${window.innerWidth}×${window.innerHeight}`,
    `격리 실행: ${globalThis.crossOriginIsolated === true ? "예" : "아니요"}`,
    `시각: ${new Date().toISOString()}`,
  ];
  return values.join("\n");
}

export function SupportPage() {
  useDocumentTitle("이용 문의 · 문제 해결과 지원 경로");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const matches = useMemo(() => {
    const terms = normalized(query).split(" ").filter(Boolean);
    if (!terms.length) return SUPPORT_PATHS;
    return SUPPORT_PATHS.filter((item) => {
      const text = normalized(`${item.title} ${item.description} ${item.keywords}`);
      return terms.every((term) => text.includes(term));
    });
  }, [query]);
  const copyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(supportDiagnostic());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Container size="wide" className="support-center py-7 sm:py-11 lg:py-14">
      <header className="support-center__hero">
        <div>
          <p className="support-center__eyebrow"><LifeBuoy size={15} aria-hidden="true" /> TOONSTUDIO · SUPPORT</p>
          <h1>막힌 작업을 찾고,<br />안전하게 다시 이어가세요.</h1>
          <p>이용 문의는 문제 해결과 적절한 지원 경로를 찾는 공간입니다. 공개 버그·아이디어·기능 요청은 제보·제안 보드에서 별도로 다룹니다.</p>
        </div>
        <div className="support-center__hero-actions">
          <Link href="/feedback?type=question"><MessageCircleQuestion size={17} aria-hidden="true" /> 공개 이용 질문</Link>
          <Link href="/feedback?type=bug" data-secondary><Wrench size={17} aria-hidden="true" /> 버그 제보</Link>
        </div>
      </header>

      <section className="support-center__finder" aria-labelledby="support-finder-title">
        <div>
          <p className="support-center__eyebrow">01 · FIND A PATH</p>
          <h2 id="support-finder-title">어떤 문제를 해결하고 있나요?</h2>
          <p>기능 이름이나 증상을 검색하면 관련 설정과 복구 화면으로 바로 이동할 수 있습니다.</p>
        </div>
        <label className="support-center__search">
          <span className="sr-only">지원 항목 검색</span>
          <Search size={19} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="예: 저장 복구, 로그인, 브러시, 에셋 설치" />
        </label>
        <p className="support-center__result-count" role="status">{matches.length}개의 해결 경로</p>
        {matches.length ? (
          <div className="support-center__path-grid">
            {matches.map((item) => (
              <article key={item.id}>
                <span className="support-center__path-icon"><item.icon size={21} aria-hidden="true" /></span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div>{item.links.map(([label, href]) => <Link key={href} href={href}>{label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="support-center__empty">
            <MessageCircleQuestion size={28} aria-hidden="true" />
            <h3>일치하는 도움말을 찾지 못했어요.</h3>
            <p>검색어를 줄이거나 공개 이용 질문으로 상황을 알려주세요. 개인정보와 미공개 작품은 게시하지 마세요.</p>
            <button type="button" onClick={() => setQuery("")}>검색 초기화</button>
          </div>
        )}
      </section>

      <div className="support-center__lower-grid">
        <section className="support-center__diagnostic" aria-labelledby="support-diagnostic-title">
          <p className="support-center__eyebrow">02 · PREPARE CONTEXT</p>
          <h2 id="support-diagnostic-title">문제 확인에 필요한 정보만 복사</h2>
          <p>현재 주소의 쿼리·작품 ID·입력 내용은 제외하고 경로, 연결 상태, 언어, 화면 크기만 복사합니다. 자동 전송하지 않습니다.</p>
          <pre aria-label="복사될 진단 정보">{supportDiagnostic()}</pre>
          <button type="button" onClick={() => { void copyDiagnostic(); }}>
            {copied ? <Check size={17} aria-hidden="true" /> : <Clipboard size={17} aria-hidden="true" />}
            {copied ? "복사했습니다" : "진단 정보 복사"}
          </button>
        </section>

        <section className="support-center__channels" aria-labelledby="support-channel-title">
          <p className="support-center__eyebrow">03 · CHOOSE A CHANNEL</p>
          <h2 id="support-channel-title">문의 성격에 맞는 공간</h2>
          <ul>
            <li><BookOpenCheck size={19} aria-hidden="true" /><div><strong>사용법과 일반 질문</strong><span>도움말을 먼저 확인하고 해결되지 않으면 공개 이용 질문을 남깁니다.</span><Link href="/help">도움말 보기<ArrowUpRight size={14} /></Link></div></li>
            <li><Wrench size={19} aria-hidden="true" /><div><strong>버그·아이디어·기능 요청</strong><span>중복을 검색하고 다른 사용자의 경험과 운영 상태를 함께 확인합니다.</span><Link href="/feedback">제보·제안 보드<ArrowUpRight size={14} /></Link></div></li>
            <li><ShieldAlert size={19} aria-hidden="true" /><div><strong>개인정보·결제·미공개 작품</strong><span>공개 게시판에 입력하지 말고 관련 정책과 권리 절차를 먼저 확인합니다.</span><Link href="/privacy">개인정보 안내<ArrowUpRight size={14} /></Link></div></li>
          </ul>
        </section>
      </div>
    </Container>
  );
}
