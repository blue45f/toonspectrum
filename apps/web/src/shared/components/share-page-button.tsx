import { Share2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const LazyShareDialog = lazy(async () => {
  const module = await import("@/shared/components/share-dialog");
  return { default: module.ShareDialog };
});

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
  const [dialogRequested, setDialogRequested] = useState(false);
  const triggerLabel = label || t("share.triggerLabel");
  const triggerClassName = cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/55 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
    className,
  );

  function trigger(loading = false) {
    return (
      <button
        type="button"
        aria-label={`${triggerLabel}: ${text}`}
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={() => setDialogRequested(true)}
        className={triggerClassName}
      >
        <Share2 size={14} className="text-accent" aria-hidden="true" />
        {triggerLabel}
      </button>
    );
  }

  if (!dialogRequested) return trigger();

  return (
    <Suspense fallback={trigger(true)}>
      <LazyShareDialog
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
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/55 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              className,
            )}
          >
            <Share2 size={14} className="text-accent" aria-hidden="true" />
            {triggerLabel}
          </button>
        }
      />
    </Suspense>
  );
}
