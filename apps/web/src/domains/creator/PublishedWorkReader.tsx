import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  MessageCircleOff,
  Repeat2,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  resolveCreatorPublicationPageKey,
  type CreatorPublicationPageCommand,
  type CreatorPublicationReaderPolicy,
} from "./creator-publication-reader";
import { WebtoonFxPlayer } from "./WebtoonFxPlayer";

import { CoverImage } from "@/shared/components/cover-image";
import { buttonClass } from "@/shared/components/ui/button-utils";

import type { WorkFxSettings } from "./studio-motion-fx";
import type { CreatorPublicationReadingDirection } from "@/shared/lib/creator-publication-contract";

interface PublishedWorkReaderProps {
  workId: string;
  pages: string[];
  fx: WorkFxSettings;
  title: string;
  policy: CreatorPublicationReaderPolicy;
  isOwner: boolean;
}

function nextPageIndex(
  current: number,
  pageCount: number,
  command: CreatorPublicationPageCommand,
): number {
  const last = Math.max(0, pageCount - 1);
  switch (command) {
    case "first":
      return 0;
    case "last":
      return last;
    case "next":
      return Math.min(last, current + 1);
    case "previous":
      return Math.max(0, current - 1);
  }
}

function commandDisabled(
  command: CreatorPublicationPageCommand,
  pageIndex: number,
  pageCount: number,
): boolean {
  if (pageCount === 0) return true;
  if (command === "first" || command === "previous") return pageIndex === 0;
  return pageIndex >= pageCount - 1;
}

function PagedPublishedWorkReader({
  pages,
  title,
  direction,
}: {
  pages: string[];
  title: string;
  direction: CreatorPublicationReadingDirection;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const leftCommand: CreatorPublicationPageCommand =
    direction === "rtl" ? "next" : "previous";
  const rightCommand: CreatorPublicationPageCommand =
    direction === "rtl" ? "previous" : "next";

  const runCommand = (command: CreatorPublicationPageCommand) => {
    setPageIndex((current) => nextPageIndex(current, pages.length, command));
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const command = resolveCreatorPublicationPageKey(event.key, direction);
    if (!command) return;
    event.preventDefault();
    runCommand(command);
  };
  const commandLabel = (command: CreatorPublicationPageCommand) =>
    command === "next" || command === "last" ? "다음 페이지" : "이전 페이지";

  return (
    <section
      aria-label="페이지 넘김 독자 보기"
      className="mb-8 overflow-hidden rounded-2xl border border-line bg-panel"
      data-reading-direction={direction}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {pages.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-fg-3">
          표시할 페이지가 없습니다.
        </p>
      ) : (
        <>
          <div className="grid min-h-[36rem] place-items-center bg-canvas/60 p-3 sm:p-6">
            <CoverImage
              src={pages[pageIndex] ?? ""}
              alt={`${title} ${pageIndex + 1}페이지`}
              className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-lg"
              fallback={
                <span className="grid aspect-[3/4] w-full max-w-xl place-items-center rounded-lg bg-raised/40 text-xs text-fg-3">
                  이미지를 불러올 수 없습니다.
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-line px-3 py-3">
            <button
              type="button"
              onClick={() => runCommand(leftCommand)}
              disabled={commandDisabled(leftCommand, pageIndex, pages.length)}
              aria-label={commandLabel(leftCommand)}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "justify-self-start gap-1.5",
              })}
            >
              <ChevronLeft size={15} aria-hidden />
              <span className="hidden sm:inline">{commandLabel(leftCommand)}</span>
            </button>
            <span className="numeral text-xs font-semibold text-fg-2" aria-live="polite">
              {pageIndex + 1} / {pages.length}
            </span>
            <button
              type="button"
              onClick={() => runCommand(rightCommand)}
              disabled={commandDisabled(rightCommand, pageIndex, pages.length)}
              aria-label={commandLabel(rightCommand)}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "justify-self-end gap-1.5",
              })}
            >
              <span className="hidden sm:inline">{commandLabel(rightCommand)}</span>
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>

          {pages.length > 1 && (
            <nav
              aria-label="페이지 바로가기"
              className="flex gap-2 overflow-x-auto border-t border-line px-3 py-3"
            >
              {pages.map((page, index) => (
                <button
                  key={`${index}-${page.slice(0, 24)}`}
                  type="button"
                  onClick={() => setPageIndex(index)}
                  aria-label={`${index + 1}페이지로 이동`}
                  aria-current={index === pageIndex ? "page" : undefined}
                  className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    index === pageIndex
                      ? "border-accent ring-1 ring-accent/30"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <CoverImage
                    src={page}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={<span className="block h-full w-full bg-raised" />}
                  />
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-canvas/85 px-1 text-[0.6rem] font-bold text-fg">
                    {index + 1}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export function PublishedWorkReader({
  workId,
  pages,
  fx,
  title,
  policy,
  isOwner,
}: PublishedWorkReaderProps) {
  const maturePolicyKey = policy.requiresMatureConfirmation
    ? `${workId}:mature`
    : null;
  const [confirmedPolicyKey, setConfirmedPolicyKey] = useState<string | null>(null);
  const canRenderContent =
    isOwner || maturePolicyKey === null || confirmedPolicyKey === maturePolicyKey;

  return (
    <section aria-labelledby="published-work-reader-heading">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <h2 id="published-work-reader-heading" className="sr-only">
          작품 독자 보기
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-fg-2">
          {policy.directive.readingMode === "vertical" ? (
            <ScrollText size={12} aria-hidden />
          ) : (
            <BookOpenCheck size={12} aria-hidden />
          )}
          {policy.readingLabel}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
            policy.directive.contentRating === "mature"
              ? "border-bad/35 bg-bad/10 text-bad"
              : "border-line bg-card text-fg-2"
          }`}
        >
          <ShieldAlert size={12} aria-hidden />
          {policy.contentRatingLabel}
        </span>
        {!policy.commentsAllowed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-fg-3">
            <MessageCircleOff size={12} aria-hidden />
            댓글 닫힘
          </span>
        )}
        {!policy.remixAllowed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-fg-3">
            <Repeat2 size={12} aria-hidden />
            리믹스 비허용
          </span>
        )}
      </div>

      {!canRenderContent ? (
        <section
          aria-labelledby="mature-content-heading"
          className="mb-8 rounded-2xl border border-bad/30 bg-bad/5 px-5 py-12 text-center sm:px-10"
        >
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-bad/30 bg-card text-bad">
            <ShieldAlert size={22} aria-hidden />
          </span>
          <h3 id="mature-content-heading" className="mt-4 text-lg font-bold text-fg">
            성인 대상 콘텐츠입니다
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-fg-2">
            작가가 성인 대상 등급으로 게시한 작품입니다. 민감하거나 강한 표현이 포함될 수
            있으므로 내용을 확인한 뒤 열어 주세요.
          </p>
          <button
            type="button"
            onClick={() => setConfirmedPolicyKey(maturePolicyKey)}
            className={buttonClass({
              size: "md",
              variant: "solid",
              className: "mt-5",
            })}
          >
            확인하고 작품 보기
          </button>
        </section>
      ) : policy.directive.readingMode === "vertical" ? (
        <WebtoonFxPlayer pages={pages} fx={fx} title={title} />
      ) : (
        <PagedPublishedWorkReader
          pages={pages}
          title={title}
          direction={policy.directive.readingDirection}
        />
      )}
    </section>
  );
}
