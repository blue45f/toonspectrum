import {
  Ban,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  MailQuestion,
  ShieldCheck,
} from "lucide-react";

import { Container } from "@/shared/components/section";
import Link from "@/src/compat/router-link";

const COLLECTION_CHANNELS = [
  {
    title: "공식 API·오픈데이터",
    body: "제공기관이 문서화한 REST·GraphQL API와 공개 데이터 파일을 우선 사용합니다.",
  },
  {
    title: "개방형 표준",
    body: "OAI-PMH, SPARQL, IIIF, RSS·Atom처럼 자동 이용을 위해 공개된 표준 인터페이스를 사용합니다.",
  },
  {
    title: "소유자 직접 피드",
    body: "출판사·CP·작가가 도메인 소유를 확인하고 제공한 카탈로그·업데이트 피드를 수집합니다.",
  },
  {
    title: "검토된 공개 메타데이터",
    body: "공식 기계 인터페이스가 없을 때에만 robots.txt와 이용조건을 검토하고 공개 페이지의 최소 메타데이터를 제한적으로 확인합니다.",
  },
] as const;

const COLLECTED_FIELDS = [
  "작품·도서·행사 제목과 공식 원문 주소",
  "공식 작가·저자·출판사·제작기관",
  "ISBN, 판본, 언어, 발행·공개·접수 날짜",
  "Schema.org JSON-LD와 Open Graph의 공개 메타데이터",
  "자료별 이용조건·출처표시 문구·조회 시각",
] as const;

const NEVER_COLLECTED = [
  "로그인이나 개인 쿠키가 필요한 정보",
  "성인인증·CAPTCHA·봇 차단을 우회해 얻는 정보",
  "웹툰 회차 본문·원고 컷·유료 미리보기",
  "댓글·리뷰 작성자 프로필·구매내역 등 개인정보",
  "모바일 앱이나 JavaScript 번들에서 역공학한 비공개 API",
] as const;

export function CrawlerPolicyPage() {
  return (
    <Container size="prose" className="py-10 sm:py-14">
      <header>
        <p className="eyebrow text-accent">DATA COLLECTION · 투명성</p>
        <h1 className="mt-2 text-balance font-display text-[clamp(1.8rem,7vw,2.25rem)] font-bold tracking-tight text-fg sm:text-5xl">
          공개 데이터를 정직하게 연결합니다
        </h1>
        <p className="mt-4 text-base leading-8 text-fg-2">
          ToonSpectrum은 작품 본문을 복제하는 서비스가 아닙니다. 공식 API·오픈데이터·소유자가 직접 제공한 피드를 우선하고,
          공개 웹을 확인할 때에도 접근 가능성, 저장 가능성, 표시·상업 이용 가능성을 서로 다른 기준으로 검토합니다.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <FileSearch size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-fg">수집 봇 식별 정보</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">자동 요청은 일반 브라우저로 가장하지 않고 아래 User-Agent로 식별합니다.</p>
            <code className="mt-3 block overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-xs leading-6 text-fg">
              ToonSpectrum/1.0 (+https://www.toonstudio.cloud/about/crawler)
            </code>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Database size={19} className="text-accent" aria-hidden="true" />
          <h2 className="text-xl font-bold text-fg">사용하는 수집 채널</h2>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {COLLECTION_CHANNELS.map((item) => (
            <article key={item.title} className="rounded-2xl border border-line bg-card/40 p-5">
              <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
              <h3 className="mt-3 font-bold text-fg">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-fg-2">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-card/40 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-good" aria-hidden="true" />
            <h2 className="font-bold text-fg">확인하는 공개 정보</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-fg-2">
            {COLLECTED_FIELDS.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">·</span><span>{item}</span></li>)}
          </ul>
        </article>
        <article className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
          <div className="flex items-center gap-2">
            <Ban size={18} className="text-danger" aria-hidden="true" />
            <h2 className="font-bold text-fg">수집하거나 우회하지 않는 정보</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-fg-2">
            {NEVER_COLLECTED.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">·</span><span>{item}</span></li>)}
          </ul>
        </article>
      </section>

      <section className="mt-10 space-y-4 rounded-2xl border border-line bg-panel/50 p-5 sm:p-6">
        <h2 className="text-xl font-bold text-fg">접근 허용과 재사용 권리는 다릅니다</h2>
        <p className="text-sm leading-7 text-fg-2">
          robots.txt가 경로 접근을 허용하더라도 이미지 캐시, 본문 저장, 수정, AI 입력, 상업 이용, 재배포까지 허용된 것으로 판단하지 않습니다.
          자료마다 메타데이터 표시·썸네일 표시·프로젝트 가져오기·상업 이용 가능성을 분리하여 기록하고, 확인되지 않은 권리는 기본적으로 차단합니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["접근", "robots·로그인·차단 여부"],
            ["저장", "약관·저작권·개인정보"],
            ["활용", "표시·수정·AI·상업 이용"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-line bg-canvas p-4">
              <strong className="text-sm text-fg">{title}</strong>
              <p className="mt-1 text-xs leading-5 text-fg-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-card/40 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <MailQuestion size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold text-fg">정정·삭제·수집 중지 요청</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              권리자나 데이터 제공자는 대상 URL과 요청 근거를 보내 정정, 노출 중지, 캐시 삭제 또는 재수집 방지를 요청할 수 있습니다.
              확인 중인 자료는 우선 공개 노출을 중지하고 처리 이력을 남깁니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/contact" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                문의하기 <ExternalLink size={14} aria-hidden="true" />
              </Link>
              <Link href="/about/data" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-raised">
                데이터 제공처 보기
              </Link>
              <Link href="/copyright" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-raised">
                저작권 안내
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Container>
  );
}
