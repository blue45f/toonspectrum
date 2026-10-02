import { RefreshCw } from "lucide-react";

/** 불러오는 중 자리표시(4칸). */
export function LoadingSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl border border-line bg-panel motion-reduce:animate-none"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** 불러오기 실패 안내와 '다시 시도'. */
export function RetryNotice({ message, onRetry, retryLabel }: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm"
    >
      <p className="text-fg-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 py-2 text-sm font-bold text-fg hover:bg-raised"
      >
        <RefreshCw size={15} aria-hidden="true" />
        {retryLabel}
      </button>
    </div>
  );
}
