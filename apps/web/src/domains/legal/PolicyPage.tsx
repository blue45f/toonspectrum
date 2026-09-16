import { FileCheck2 } from "lucide-react";
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

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { ErrorState } from "@/components/error-state";

// 이용약관(/terms)·개인정보처리방침(/privacy)은 배포 산출물에 포함된
// first-party 정본을 직접 렌더한다. 외부 게시 서비스나 네트워크가 필요 없다.

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
      <ListTag
        className={cn(
          "space-y-1.5 pl-5",
          block.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {block.items.map((item, index) => (
          <li key={index}>
            <InlineText text={item} />
          </li>
        ))}
      </ListTag>
    );
  }
  return (
    <p>
      <InlineText text={block.text} />
    </p>
  );
}

/** First-party policy body and its reviewed release identity. */
export function PolicyArticle({ doc }: { doc: PolicyDocument }) {
  const sections = groupPolicySections(parsePolicyBlocks(doc.body));
  const effective = formatPolicyDate(doc.effectiveAt);
  return (
    <>
      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        {sections.map((section, index) => (
          <section key={`${section.heading ?? "intro"}-${index}`}>
            {section.heading ? (
              <h2 className="mb-2 text-base font-bold text-fg">
                {section.heading}
              </h2>
            ) : null}
            <div className="space-y-3">
              {section.blocks.map((block, blockIndex) => (
                <PolicyBlockView key={blockIndex} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="mt-10 rounded-2xl border border-line/60 bg-card/20 p-4 text-xs leading-relaxed text-fg-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileCheck2 size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="font-medium text-fg-2">툰스펙트럼 게시 정책</span>
          <span>{doc.versionLabel}</span>
          {effective ? <span>· 시행일 {effective}</span> : null}
          <span>
            · 문서 ID{" "}
            <code className="font-mono text-fg-2">
              {shortContentHash(doc.contentHash)}
            </code>
          </span>
        </p>
        <p className="mt-2">
          이 문서는 서비스 배포본에 포함된 검토 정책입니다. 외부 게시 서비스가
          중단되어도 같은 내용으로 계속 제공됩니다.
        </p>
      </footer>
    </>
  );
}

/** Kept for defensive route-level failures; the canonical link is first-party. */
export function PolicyErrorFallback({
  slug,
  label,
  onRetry,
}: {
  slug: PolicySlug;
  label: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-8 space-y-4">
      <ErrorState
        title={`${label}을 표시하지 못했습니다.`}
        message="페이지를 새로고침하거나 잠시 후 다시 시도해 주세요."
        onRetry={onRetry}
      />
      <a
        href={policyPublicUrl(slug)}
        className={buttonClass({ size: "sm", variant: "outline" })}
      >
        자사 정책 페이지 다시 열기
      </a>
    </div>
  );
}

function PolicyPageShell({
  slug,
  eyebrow,
  fallbackName,
}: {
  slug: PolicySlug;
  eyebrow: string;
  fallbackName: string;
}) {
  const doc = getStaticPolicyDocument(slug);
  return (
    <Container size="prose" className="py-8 sm:py-12 lg:py-16">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h1 className="mt-3 text-pretty text-[clamp(1.6rem,7vw,1.875rem)] font-bold leading-tight sm:text-4xl">
        {doc.name || fallbackName}
      </h1>
      <PolicyArticle doc={doc} />
    </Container>
  );
}

export function TermsPage() {
  return (
    <PolicyPageShell
      slug="terms-of-service"
      eyebrow="TERMS"
      fallbackName="이용약관"
    />
  );
}

export function PrivacyPage() {
  return (
    <PolicyPageShell
      slug="privacy-policy"
      eyebrow="PRIVACY"
      fallbackName="개인정보처리방침"
    />
  );
}
