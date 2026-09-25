import {
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  EyeOff,
  FilePenLine,
  Loader2,
  LockKeyhole,
  Settings2,
} from "lucide-react";
import { useId, useMemo } from "react";

import {
  createStudioPublishReceipt,
  studioPublishReceiptFileName,
  type StudioPublishReceiptDetails,
} from "./studio-publish-receipt-data";
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
import Link from "@/shared/navigation/router-link";

export interface StudioPublishResultReceiptProps {
  readonly kind: StudioPublishResultKind;
  readonly workId: string;
  readonly revision?: number;
  readonly environment: StudioPublishEnvironment;
  readonly details?: StudioPublishReceiptDetails | null;
  readonly onContinueEditing: () => void;
  readonly onReviewSettings: () => void;
  readonly onMakePrivate?: () => void;
  readonly recoveryBusy?: boolean;
  readonly recoveryError?: string | null;
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
  details = null,
  onContinueEditing,
  onReviewSettings,
  onMakePrivate,
  recoveryBusy = false,
  recoveryError = null,
}: StudioPublishResultReceiptProps) {
  const titleId = useId();
  const copy = studioPublishResultCopy(kind);
  const published = kind === "published";
  const recoverable = kind === "published" || kind === "scheduled";
  const recoveryLabel = kind === "scheduled" ? "게시 예약 취소" : "즉시 비공개 전환";
  const receipt = useMemo(() => createStudioPublishReceipt({
    kind,
    workId,
    revision,
    environment,
    details,
  }), [details, environment, kind, revision, workId]);

  const downloadReceipt = () => {
    const blob = new Blob([`${JSON.stringify(receipt, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = studioPublishReceiptFileName(receipt);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

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

      <dl className="mt-4 grid gap-2 rounded-xl border border-line bg-card/65 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-fg-3">작품 ID</dt>
          <dd className="mt-0.5 break-all font-mono font-semibold text-fg">{workId}</dd>
        </div>
        <div>
          <dt className="text-fg-3">저장 revision</dt>
          <dd className="numeral mt-0.5 font-semibold text-fg">{revision ?? "확인 중"}</dd>
        </div>
        <div>
          <dt className="text-fg-3">공개 범위</dt>
          <dd className="mt-0.5 font-semibold text-fg">{details?.visibility ?? "확인 중"}</dd>
        </div>
        <div>
          <dt className="text-fg-3">페이지</dt>
          <dd className="numeral mt-0.5 font-semibold text-fg">{details?.pages.length ?? "확인 중"}</dd>
        </div>
        {details?.source?.revisionId ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-fg-3">원본 revision</dt>
            <dd className="mt-0.5 break-all font-mono font-semibold text-fg">{details.source.revisionId}</dd>
          </div>
        ) : null}
        {details?.source?.contentChecksum ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-fg-3">콘텐츠 SHA-256</dt>
            <dd className="mt-0.5 break-all font-mono font-semibold text-fg">{details.source.contentChecksum}</dd>
          </div>
        ) : null}
      </dl>

      {recoveryError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm leading-relaxed text-bad"
        >
          {recoveryError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {recoverable && onMakePrivate ? (
          <button
            type="button"
            onClick={onMakePrivate}
            disabled={recoveryBusy}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className:
                "min-h-11 gap-1.5 border-bad/45 text-bad hover:border-bad/70 hover:bg-bad/10 hover:text-bad",
            })}
          >
            {recoveryBusy ? (
              <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <EyeOff size={14} aria-hidden />
            )}
            {recoveryBusy ? "비공개 전환 중..." : recoveryLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={downloadReceipt}
          className={buttonClass({
            size: "sm",
            variant: "outline",
            className: "min-h-11 gap-1.5",
          })}
        >
          <Download size={14} aria-hidden />
          게시 영수증 JSON
        </button>
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
        {receipt.anonymousPreviewPath ? (
          <Link
            href={receipt.anonymousPreviewPath}
            target="_blank"
            rel="noreferrer"
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: "min-h-11 gap-1.5",
            })}
          >
            <ExternalLink size={14} aria-hidden />
            비로그인 독자 보기
          </Link>
        ) : null}
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
