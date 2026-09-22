import {
  CalendarDays,
  FileCheck2,
  FileText,
  Link2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Fragment } from "react";

import {
  formatPolicyDate,
  getStaticPolicyDocument,
  groupPolicySections,
  parsePolicyBlocks,
  policyPublicUrl,
  shortContentHash,
  splitBoldSegments,
  type PolicyBlock,
  type PolicyDocument,
  type PolicySlug,
} from "./policy-content";
import "./policy-page.css";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { ErrorState } from "@/components/error-state";
import { useDocumentTitle } from "@/hooks/use-document-title";

const POLICY_SUMMARIES: Record<PolicySlug, readonly string[]> = {
  "terms-of-service": [
    "사용자가 만든 원고와 창작물의 권리는 원칙적으로 사용자에게 남습니다.",
    "안전한 운영과 법적 의무를 위해 필요한 최소 범위에서 서비스 이용을 제한할 수 있습니다.",
    "중요한 정책 변경은 시행 전에 알리고, 현재 배포본의 버전과 문서 ID를 함께 표시합니다.",
  ],
  "privacy-policy": [
    "서비스 제공에 필요한 계정·이용 정보만 목적별로 구분해 처리합니다.",
    "기기 내 AI와 MediaPipe 처리는 가능한 한 브라우저 안에서 수행하며 전송 범위를 별도로 안내합니다.",
    "사용자는 개인정보 열람·정정·삭제와 처리 제한을 요청할 수 있습니다.",
  ],
};

function policySectionId(index: number): string {
  return `policy-section-${index + 1}`;
}

function InlineText({ text }: { text: string }) {
  const segments = splitBoldSegments(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold text-fg">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

function PolicyBlockView({ block }: { block: PolicyBlock }) {
  if (block.kind === "heading") {
    return <h2 className="mb-2 text-base font-bold text-fg">{block.text}</h2>;
  }
  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className={cn("space-y-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
        {block.items.map((item, index) => (
          <li key={index}><InlineText text={item} /></li>
        ))}
      </ListTag>
    );
  }
  return <p><InlineText text={block.text} /></p>;
}

/** First-party policy body and its reviewed release identity. */
export function PolicyArticle({ doc }: { doc: PolicyDocument }) {
  const sections = groupPolicySections(parsePolicyBlocks(doc.body));
  const effective = formatPolicyDate(doc.effectiveAt);
  return (
    <>
      <div className="policy-page__article space-y-8 text-sm leading-7 text-fg-2">
        {sections.map((section, index) => {
          const id = section.heading ? policySectionId(index) : undefined;
          return (
            <section key={`${section.heading ?? "intro"}-${index}`} id={id} className="scroll-mt-28">
              {section.heading ? (
                <div className="group mb-3 flex items-start gap-2">
                  <h2 className="min-w-0 text-base font-bold leading-7 text-fg sm:text-lg">{section.heading}</h2>
                  <a
                    href={`#${id}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 opacity-70 transition hover:bg-panel hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    aria-label={`${section.heading} 조항 링크`}
                    title="이 조항으로 연결"
                  >
                    <Link2 size={14} aria-hidden="true" />
                  </a>
                </div>
              ) : null}
              <div className="space-y-3">
                {section.blocks.map((block, blockIndex) => <PolicyBlockView key={blockIndex} block={block} />)}
              </div>
            </section>
          );
        })}
      </div>
      <footer className="mt-10 rounded-2xl border border-line/60 bg-card/30 p-4 text-xs leading-relaxed text-fg-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileCheck2 size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="font-medium text-fg-2">툰스펙트럼 게시 정책</span>
          <span>{doc.versionLabel}</span>
          {effective ? <span>· 시행일 {effective}</span> : null}
          <span>· 문서 ID <code className="font-mono text-fg-2">{shortContentHash(doc.contentHash)}</code></span>
        </p>
        <p className="mt-2">이 문서는 서비스 배포본에 포함된 검토 정책입니다. 외부 게시 서비스가 중단되어도 같은 내용으로 계속 제공됩니다.</p>
      </footer>
    </>
  );
}

/** Kept for defensive route-level failures; the canonical link is first-party. */
export function PolicyErrorFallback({ slug, label, onRetry }: { slug: PolicySlug; label: string; onRetry?: () => void }) {
  return (
    <div className="mt-8 space-y-4">
      <ErrorState title={`${label}을 표시하지 못했습니다.`} message="페이지를 새로고침하거나 잠시 후 다시 시도해 주세요." onRetry={onRetry} />
      <a href={policyPublicUrl(slug)} className={buttonClass({ size: "sm", variant: "outline" })}>자사 정책 페이지 다시 열기</a>
    </div>
  );
}

function PolicyPageShell({ slug, eyebrow, fallbackName }: { slug: PolicySlug; eyebrow: string; fallbackName: string }) {
  const doc = getStaticPolicyDocument(slug);
  const sections = groupPolicySections(parsePolicyBlocks(doc.body));
  const outline = sections.flatMap((section, index) => section.heading ? [{ id: policySectionId(index), label: section.heading }] : []);
  const effective = formatPolicyDate(doc.effectiveAt);
  const title = doc.name || fallbackName;
  useDocumentTitle(title);

  return (
    <Container size="wide" className="policy-page py-8 sm:py-12 lg:py-16">
      <header className="max-w-4xl">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,7vw,4.5rem)] font-bold leading-[1] tracking-[-0.055em] text-fg">{title}</h1>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-fg-2">
          {effective ? <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card px-3"><CalendarDays size={14} aria-hidden="true" />시행일 {effective}</span> : null}
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card px-3"><FileText size={14} aria-hidden="true" />{doc.versionLabel}</span>
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card px-3 font-mono">ID {shortContentHash(doc.contentHash)}</span>
        </div>
      </header>

      <section className="policy-page__summary mt-8 rounded-3xl border border-accent/25 bg-accent-soft/25 p-5 sm:p-7" aria-labelledby="policy-summary-title">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-card text-accent"><ShieldCheck size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="policy-summary-title" className="font-display text-lg font-bold text-fg">먼저 보는 쉬운 말 요약</h2>
            <p className="mt-1 text-xs leading-6 text-fg-3">아래 요약은 이해를 돕기 위한 안내이며, 권리와 의무는 전체 정책 본문을 기준으로 합니다.</p>
          </div>
        </div>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {POLICY_SUMMARIES[slug].map((item, index) => (
            <li key={item} className="rounded-2xl border border-line bg-card/80 p-4 text-sm leading-6 text-fg-2">
              <strong className="mb-2 block font-display text-xs text-accent">0{index + 1}</strong>{item}
            </li>
          ))}
        </ul>
      </section>

      <div className="policy-page__layout mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,46rem)] lg:items-start lg:justify-between">
        <aside className="policy-page__toc lg:sticky lg:top-24" aria-label="정책 목차">
          <div className="rounded-2xl border border-line bg-panel/60 p-4">
            <h2 className="font-display text-sm font-bold text-fg">문서 목차</h2>
            <nav className="mt-3 max-h-[58vh] overflow-y-auto pr-1">
              <ol className="space-y-1">
                {outline.map((item, index) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 text-xs leading-5 text-fg-3 hover:bg-card hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                      <span className="mt-px font-mono text-[0.65rem] text-accent">{String(index + 1).padStart(2, "0")}</span>
                      <span>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <button type="button" onClick={() => window.print()} className="policy-page__print mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-3 text-xs font-bold text-fg-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
              <Printer size={15} aria-hidden="true" />인쇄·PDF 저장
            </button>
          </div>
        </aside>
        <article aria-label={`${title} 전체 본문`} className="min-w-0 max-w-[46rem]">
          <PolicyArticle doc={doc} />
        </article>
      </div>
    </Container>
  );
}

export function TermsPage() {
  return <PolicyPageShell slug="terms-of-service" eyebrow="TERMS" fallbackName="이용약관" />;
}

export function PrivacyPage() {
  return <PolicyPageShell slug="privacy-policy" eyebrow="PRIVACY" fallbackName="개인정보처리방침" />;
}
