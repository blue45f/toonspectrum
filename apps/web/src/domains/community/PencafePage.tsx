import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { PenLine } from "lucide-react";
import { useParams } from "react-router-dom";

import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { compactPublicShareDescription } from "@/shared/lib/public-share-policy";
import {
  defineBilingualText,
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import { useDocumentTitle, useMetaDescription, usePageSocialMeta } from "@/shared/seo/use-document-title";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

const COPY = {
  eyebrow: defineBilingualText("pencafePage", "eyebrow", "펜카페", "PENCAFE"),
  feedRegion: defineBilingualText("pencafePage", "feedRegion", "펜카페 피드", "Pencafe feed"),
  titleTemplate: defineBilingualText("pencafePage", "titleTemplate", "{v0} 펜카페", "{v0} Pencafe"),
  fallbackTitle: defineBilingualText("pencafePage", "fallbackTitle", "펜카페", "Pencafe"),
  lede: defineBilingualText(
    "pencafePage",
    "lede",
    "펜카페/번역자/편집자 커뮤니티를 중심으로 대화, 정리, 번역 소식, 창작 노하우를 공유합니다.",
    "Share conversations, digests, translation news, and creation know-how around pencafe, translator, and editor communities.",
  ),
  shareDescriptionTemplate: defineBilingualText(
    "pencafePage",
    "shareDescriptionTemplate",
    "{v0} 독자와 창작자가 대화, 번역 소식과 창작 노하우를 나누는 공개 펜카페입니다.",
    "A public pencafe where {v0} readers and creators talk, share translation news, and exchange creation know-how.",
  ),
  shareDescriptionFallback: defineBilingualText(
    "pencafePage",
    "shareDescriptionFallback",
    "웹툰 독자와 창작자가 함께 이야기하는 공개 펜카페입니다.",
    "A public pencafe where webtoon readers and creators talk together.",
  ),
  shareLabel: defineBilingualText("pencafePage", "shareLabel", "펜카페 공유", "Share pencafe"),
  shareActionLabel: defineBilingualText("pencafePage", "shareActionLabel", "펜카페 보기", "View pencafe"),
  feedErrorTitle: defineBilingualText(
    "pencafePage",
    "feedErrorTitle",
    "펜카페 피드를 불러오지 못했습니다.",
    "Couldn't load the pencafe feed.",
  ),
  feedErrorMessage: defineBilingualText(
    "pencafePage",
    "feedErrorMessage",
    "일시적인 문제일 수 있습니다. 다시 시도해 보세요.",
    "This might be temporary — please try again.",
  ),
  feedErrorRetry: defineBilingualText("pencafePage", "feedErrorRetry", "다시 시도", "Retry"),
} as const;

interface PencafeFeedBoundaryProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
}

interface PencafeFeedBoundaryState {
  hasError: boolean;
}

/**
 * 페이지 레벨 에러 경계. FanCafePanel 내부의 로딩/에러 처리를 보완해
 * 렌더 크래시나 지연 로드 실패 시에도 페이지가 빈 화면이 되지 않게 한다.
 */
class PencafeFeedBoundary extends Component<PencafeFeedBoundaryProps, PencafeFeedBoundaryState> {
  state: PencafeFeedBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PencafeFeedBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[PencafePage] pencafe feed crashed", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-bad/35 bg-bad/10 px-6 py-10 text-center" role="alert">
          <p className="text-sm font-medium text-bad">{this.props.title}</p>
          <p className="mt-1 text-xs text-fg-3">{this.props.message}</p>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="mt-4 min-h-11 rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad"
          >
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PencafePage() {
  useBilingualI18nRevision();
  const t = useT();
  const { name } = useParams();
  // Router parameters are already decoded, including literal percent characters.
  const targetLabel = name ?? "";
  const [feedRetryTick, setFeedRetryTick] = useState(0);
  const sharePath = targetLabel
    ? `/pencafe/${encodeURIComponent(targetLabel)}`
    : "/community/pencafe";
  const shareTitle = targetLabel
    ? formatI18nTemplate(t(COPY.titleTemplate), { v0: targetLabel })
    : t(COPY.fallbackTitle);
  const shareDescription = compactPublicShareDescription(
    targetLabel
      ? formatI18nTemplate(t(COPY.shareDescriptionTemplate), { v0: targetLabel })
      : null,
    t(COPY.shareDescriptionFallback),
  );

  useDocumentTitle(shareTitle);
  useMetaDescription(shareDescription);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: shareTitle,
    description: shareDescription,
    type: "website",
  });

  return (
    <Container size="wide" className="relative py-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} />
            {t(COPY.eyebrow)}</p>
          <h1 className="mt-2 text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight sm:text-4xl">{shareTitle}</h1>
          <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
            {t(COPY.lede)}</p>
        </div>
        {targetLabel && (
          <Suspense fallback={null}>
            <SharePageButton
              path={sharePath}
              text={shareTitle}
              description={shareDescription}
              label={t(COPY.shareLabel)}
              actionLabel={t(COPY.shareActionLabel)}
            />
          </Suspense>
        )}
      </header>

      <img
        src="/images/section-community.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-6 h-36 w-full rounded-3xl object-cover sm:h-44"
      />

      <section aria-label={t(COPY.feedRegion)}>
        <PencafeFeedBoundary
        key={feedRetryTick}
        title={t(COPY.feedErrorTitle)}
        message={t(COPY.feedErrorMessage)}
        retryLabel={t(COPY.feedErrorRetry)}
        onRetry={() => setFeedRetryTick((tick) => tick + 1)}
      >
        <FanCafePanel scope="pencafe" targetId={targetLabel} targetLabel={targetLabel} compact />
        </PencafeFeedBoundary>
      </section>
    </Container>
  );
}
