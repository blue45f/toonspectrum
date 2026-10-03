import {
  Ban,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  MailQuestion,
  ShieldCheck,
} from "lucide-react";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { SectionArt } from "@/shared/components/section-art";
import { Container } from "@/shared/components/section";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CrawlerPolicyPage", ko, en);

const COLLECTION_CHANNELS = [
  {
    id: "api",
    ko: ["공식 API·오픈데이터", "제공기관이 문서화한 REST·GraphQL API와 공개 데이터 파일을 우선 사용합니다."],
    en: ["Official APIs & open data", "We prefer documented REST/GraphQL APIs and open data files from the providing organizations."],
  },
  {
    id: "standards",
    ko: ["개방형 표준", "OAI-PMH, SPARQL, IIIF, RSS·Atom처럼 자동 이용을 위해 공개된 표준 인터페이스를 사용합니다."],
    en: ["Open standards", "We use standard interfaces published for automated use, like OAI-PMH, SPARQL, IIIF and RSS·Atom."],
  },
  {
    id: "owner-feeds",
    ko: ["소유자 직접 피드", "출판사·CP·작가가 도메인 소유를 확인하고 제공한 카탈로그·업데이트 피드를 수집합니다."],
    en: ["Owner-provided feeds", "We collect catalog and update feeds provided by publishers, CPs and creators after verifying domain ownership."],
  },
  {
    id: "reviewed-metadata",
    ko: ["검토된 공개 메타데이터", "공식 기계 인터페이스가 없을 때에만 robots.txt와 이용조건을 검토하고 공개 페이지의 최소 메타데이터를 제한적으로 확인합니다."],
    en: ["Reviewed public metadata", "Only when no official machine interface exists do we review robots.txt and terms of use, and check the minimum metadata of public pages."],
  },
] as const;

const COLLECTED_FIELDS = {
  ko: [
    "작품·도서·행사 제목과 공식 원문 주소",
    "공식 작가·저자·출판사·제작기관",
    "ISBN, 판본, 언어, 발행·공개·접수 날짜",
    "Schema.org JSON-LD와 Open Graph의 공개 메타데이터",
    "자료별 이용조건·출처표시 문구·조회 시각",
  ],
  en: [
    "Titles of works/books/events and their official canonical URLs",
    "Official creators, authors, publishers and producing organizations",
    "ISBN, edition, language, publication/release/receipt dates",
    "Public metadata from Schema.org JSON-LD and Open Graph",
    "Per-source usage terms, attribution wording and lookup timestamps",
  ],
} as const;

const NEVER_COLLECTED = {
  ko: [
    "로그인이나 개인 쿠키가 필요한 정보",
    "성인인증·CAPTCHA·봇 차단을 우회해 얻는 정보",
    "웹툰 회차 본문·원고 컷·유료 미리보기",
    "댓글·리뷰 작성자 프로필·구매내역 등 개인정보",
    "모바일 앱이나 JavaScript 번들에서 역공학한 비공개 API",
  ],
  en: [
    "Information requiring login or personal cookies",
    "Information obtained by bypassing age verification, CAPTCHA or bot blocking",
    "Webtoon episode bodies, manuscript cuts and paid previews",
    "Personal data such as comment/review author profiles and purchase history",
    "Private APIs reverse-engineered from mobile apps or JavaScript bundles",
  ],
} as const;

const RIGHTS_COLUMNS = [
  {
    id: "access",
    ko: ["접근", "robots·로그인·차단 여부"],
    en: ["Access", "robots, login and blocking status"],
  },
  {
    id: "storage",
    ko: ["저장", "약관·저작권·개인정보"],
    en: ["Storage", "Terms, copyright and privacy"],
  },
  {
    id: "use",
    ko: ["활용", "표시·수정·AI·상업 이용"],
    en: ["Reuse", "Display, modification, AI and commercial use"],
  },
] as const;

export function CrawlerPolicyPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("크롤러 정책", "Crawler Policy"));

  return (
    <Container size="prose" className="py-10 sm:py-14">
      <header>
        <p className="eyebrow text-accent">DATA COLLECTION · {bi("투명성", "TRANSPARENCY")}</p>
        <h1 className="mt-2 text-balance font-display text-[clamp(1.8rem,7vw,2.25rem)] font-bold tracking-tight text-fg sm:text-5xl">
          {bi("공개 데이터를 정직하게 연결합니다", "Connecting public data honestly")}
        </h1>
        <p className="mt-4 text-base leading-8 text-fg-2">
          {bi(
            "ToonStudio은 작품 본문을 복제하는 서비스가 아닙니다. 공식 API·오픈데이터·소유자가 직접 제공한 피드를 우선하고, 공개 웹을 확인할 때에도 접근 가능성, 저장 가능성, 표시·상업 이용 가능성을 서로 다른 기준으로 검토합니다. 배포된 서비스는 외부 사이트를 실시간 또는 주기적으로 수집하지 않으며, 갱신이 필요할 때 운영자가 별도 환경에서 수동으로 실행·검토합니다.",
            "ToonStudio is not a service that reproduces full work content. We prefer official APIs, open data and owner-provided feeds, and even when checking the public web we review accessibility, storability and display/commercial-use rights as separate criteria. The deployed service never crawls external sites in real time or on a schedule; when an update is needed, an operator runs and reviews it manually in a separate environment.",
          )}
        </p>
      </header>

      <SectionArt
        image="explore"
        className="mt-6 aspect-[21/9] w-full rounded-2xl border border-line object-cover"
      />

      <section className="mt-10 rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <FileSearch size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-fg">{bi("수집 봇 식별 정보", "Crawler identity")}</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              {bi("자동 요청은 일반 브라우저로 가장하지 않고 아래 User-Agent로 식별합니다.", "Automated requests never pretend to be a regular browser; they identify with the User-Agent below.")}
            </p>
            <code className="mt-3 block overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-xs leading-6 text-fg">
              ToonStudio/1.0 (+https://www.toonstudio.cloud/about/crawler)
            </code>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Database size={19} className="text-accent" aria-hidden="true" />
          <h2 className="text-xl font-bold text-fg">{bi("사용하는 수집 채널", "Collection channels we use")}</h2>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {COLLECTION_CHANNELS.map((item) => {
            const [title, body] = bi(item.ko, item.en);
            return (
              <article key={item.id} className="rounded-2xl border border-line bg-card/40 p-5">
                <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-fg-2">{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-card/40 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-good" aria-hidden="true" />
            <h2 className="font-bold text-fg">{bi("확인하는 공개 정보", "Public information we verify")}</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-fg-2">
            {bi(COLLECTED_FIELDS.ko, COLLECTED_FIELDS.en).map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">·</span><span>{item}</span></li>)}
          </ul>
        </article>
        <article className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
          <div className="flex items-center gap-2">
            <Ban size={18} className="text-danger" aria-hidden="true" />
            <h2 className="font-bold text-fg">{bi("수집하거나 우회하지 않는 정보", "Information we never collect or bypass for")}</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-fg-2">
            {bi(NEVER_COLLECTED.ko, NEVER_COLLECTED.en).map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">·</span><span>{item}</span></li>)}
          </ul>
        </article>
      </section>

      <section className="mt-10 space-y-4 rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
        <h2 className="text-xl font-bold text-fg">{bi("접근 허용과 재사용 권리는 다릅니다", "Permission to access is not a right to reuse")}</h2>
        <p className="text-sm leading-7 text-fg-2">
          {bi(
            "robots.txt가 경로 접근을 허용하더라도 이미지 캐시, 본문 저장, 수정, AI 입력, 상업 이용, 재배포까지 허용된 것으로 판단하지 않습니다. 자료마다 메타데이터 표시·썸네일 표시·프로젝트 가져오기·상업 이용 가능성을 분리하여 기록하고, 확인되지 않은 권리는 기본적으로 차단합니다.",
            "Even when robots.txt permits path access, we do not assume it also permits image caching, content storage, modification, AI input, commercial use or redistribution. For every source we record metadata display, thumbnail display, project import and commercial-use eligibility separately, and block unconfirmed rights by default.",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {RIGHTS_COLUMNS.map((column) => {
            const [title, body] = bi(column.ko, column.en);
            return (
              <div key={column.id} className="rounded-xl border border-line bg-canvas p-4">
                <strong className="text-sm text-fg">{title}</strong>
                <p className="mt-1 text-xs leading-5 text-fg-2">{body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-card/40 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <MailQuestion size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-fg">{bi("정정·삭제·수집 중지 요청", "Correction, removal and opt-out requests")}</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              {bi(
                "권리자나 데이터 제공자는 대상 URL과 요청 근거를 보내 정정, 노출 중지, 캐시 삭제 또는 재수집 방지를 요청할 수 있습니다. 확인 중인 자료는 우선 공개 노출을 중지하고 처리 이력을 남깁니다.",
                "Rightsholders and data providers can request corrections, delisting, cache deletion or re-collection prevention by sending the target URL and the basis for the request. While under review, we first suspend public exposure and keep a handling record.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/contact" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                {bi("문의하기", "Contact us")} <ExternalLink size={14} aria-hidden="true" />
              </Link>
              <Link href="/about/data" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-raised">
                {bi("데이터 제공처 보기", "View data sources")}
              </Link>
              <Link href="/copyright" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-raised">
                {bi("저작권 안내", "Copyright notice")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Container>
  );
}
