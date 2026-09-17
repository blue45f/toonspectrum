import { Share2 } from "lucide-react";

import { ShareDialog } from "@/shared/components/share-dialog";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface SharePageButtonProps {
  readonly path: string;
  readonly text: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly label?: string;
  readonly actionLabel?: string;
  readonly className?: string;
}

/** 작품 상세 외 공유 가치가 높은 화면을 위한 통합 공유 버튼. */
export function SharePageButton({
  path,
  text,
  description,
  imageUrl,
  label,
  actionLabel,
  className,
}: SharePageButtonProps) {
  const t = useT();
  const triggerLabel = label || t("share.triggerLabel");

  return (
    <ShareDialog
      payload={{
        title: text,
        text: description || `${text} · ${t("app.name")}`,
        url: path,
        imageUrl,
        buttonLabel: actionLabel || t("share.viewContent"),
      }}
      trigger={
        <button
          type="button"
          aria-label={`${triggerLabel}: ${text}`}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/55 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
            className,
          )}
        >
          <Share2 size={14} className="text-accent" aria-hidden="true" />
          {triggerLabel}
        </button>
      }
    />
  );
}
