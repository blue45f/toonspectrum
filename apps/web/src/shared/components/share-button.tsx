import { Share2 } from "lucide-react";

import { ShareDialog } from "@/shared/components/share-dialog";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface ShareButtonProps {
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly className?: string;
}

/** 작품 상세의 미리보기 메타데이터를 포함한 통합 공유 진입점. */
export function ShareButton({
  title,
  slug,
  description,
  imageUrl,
  className,
}: ShareButtonProps) {
  const t = useT();
  const shareTitle = `${title} · ${t("app.name")}`;

  return (
    <ShareDialog
      payload={{
        title: shareTitle,
        text: description || shareTitle,
        url: `/title/${encodeURIComponent(slug)}`,
        imageUrl,
        buttonLabel: t("share.viewContent"),
      }}
      trigger={
        <button
          type="button"
          aria-label={t("share.triggerAria")}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
            className,
          )}
        >
          <Share2 size={15} aria-hidden="true" />
          {t("share.triggerLabel")}
        </button>
      }
    />
  );
}
