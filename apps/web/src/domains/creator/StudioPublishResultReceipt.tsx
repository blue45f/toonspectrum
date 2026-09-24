import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  LockKeyhole,
  Settings2,
} from "lucide-react";
import { useId } from "react";

import {
  studioPublishEnvironmentLabel,
  type StudioPublishEnvironment,
} from "./studio-publish-review-safety";
import {
  studioPublishResultCopy,
  type StudioPublishResultKind,
} from "./studio-publish-result";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

export interface StudioPublishResultReceiptProps {
  readonly kind: StudioPublishResultKind;
  readonly workId: string;
  readonly revision?: number;
  readonly environment: StudioPublishEnvironment;
  readonly onContinueEditing: () => void;
  readonly onReviewSettings: () => void;
}

function ResultIcon({ kind }: { kind: StudioPublishResultKind }) {
  if (kind === "scheduled") return <CalendarClock size={22} aria-hidden />;
  if (kind === "private") return <LockKeyhole size={22} aria-hidden />;
  if (kind === "draft") return <FilePenLine size={22} aria-hidden />;
  return <CheckCircle2 size={22} aria-hidden />;
}

export function StudioPublishResultReceipt({
  kind,
  workId,
  revision,
  environment,
  onContinueEditing,
  onReviewSettings,
}: StudioPublishResultReceiptProps) {
  const titleId = useId();
  const copy = studioPublishResultCopy(kind);
  const published = kind === "published";

  return (
    <section
      aria-labelledby={titleId}
      data-studio-publish-result={kind}
      className={cn(
        "mb-5 overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-5",
        published
          ? "border-good/45 bg-good/10"
          : kind === "scheduled"
            ? "border-accent/40 bg-accent/8"
            : "border-line bg-panel/50",
      )}
    >
      <span role="status" aria-live="polite" className="sr-only">게시 결과: {copy.title}</span>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border",
            published
              ? "border-good/40 bg-good/15 text-good"
              : kind === "scheduled"
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-line bg-card text-fg-2",
          )}
        >
          <ResultIcon kind={kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("eyebrow", published ? "text-good" : "text-accent")}>{copy.eyebrow}</p>
          <h2 id={titleId} className="mt-1 text-lg font-black text-fg">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-2">{copy.description}</p>
        </div>
        <span className="rounded-full border border-line bg-card/75 px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
          {studioPublishEnvironmentLabel(environment)}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 rounded-xl border border-line bg-card/65 p-3 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-fg-3">작품 ID</dt>
          <dd className="mt-0.5 break-all font-mono font-semibold text-fg">{workId}</dd>
        </div>
        <div>
          <dt className="text-fg-3">저장 revision</dt>
          <dd className="numeral mt-0.5 font-semibold text-fg">{revision ?? "확인 중"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onContinueEditing}
          className={buttonClass({
            size: "sm",
            variant: "ghost",
            className: "min-h-11 gap-1.5",
          })}
        >
          <FilePenLine size={14} aria-hidden />
          원고 수정 계속
        </button>
        <button
          type="button"
          onClick={onReviewSettings}
          className={buttonClass({
            size: "sm",
            variant: "outline",
            className: "min-h-11 gap-1.5",
          })}
        >
          <Settings2 size={14} aria-hidden />
          공개 설정 다시 확인
        </button>
        {copy.readerActionLabel ? (
          <Link
            href={`/create/${encodeURIComponent(workId)}`}
            className={buttonClass({
              size: "sm",
              variant: "solid",
              className: "min-h-11 gap-1.5",
            })}
          >
            <ExternalLink size={14} aria-hidden />
            {copy.readerActionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
