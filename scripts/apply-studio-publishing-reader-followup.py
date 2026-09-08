#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[1]


def write_new(relative: str, content: str) -> None:
    path = ROOT / relative
    if path.exists():
        raise RuntimeError(f"refusing to replace existing file: {relative}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_exact(relative: str, old: str, new: str, expected: int = 1) -> None:
    path = ROOT / relative
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != expected:
        raise RuntimeError(
            f"{relative}: expected {expected} occurrence(s), found {count}: {old[:140]!r}"
        )
    path.write_text(source.replace(old, new), encoding="utf-8")


write_new(
    "apps/web/src/domains/creator/creator-publication-reader.ts",
    dedent(
        """\
        import {
          createDefaultCreatorPublicationDirective,
          readCreatorPublicationDirective,
          type CreatorPublicationContentRating,
          type CreatorPublicationDirective,
          type CreatorPublicationReadingDirection,
        } from "@/shared/lib/creator-publication-contract";

        export const CREATOR_PUBLICATION_CONTENT_RATING_LABELS = {
          all: "전체 이용",
          teen: "청소년 주의",
          mature: "성인 대상",
        } as const satisfies Readonly<Record<CreatorPublicationContentRating, string>>;

        export interface CreatorPublicationReaderPolicy {
          directive: CreatorPublicationDirective;
          legacy: boolean;
          commentsAllowed: boolean;
          remixAllowed: boolean;
          contentRatingLabel: string;
          readingLabel: string;
          requiresMatureConfirmation: boolean;
        }

        /**
         * Public reader behavior is derived from the durable publication directive. Legacy works
         * retain their historical vertical, open-comment and remix-enabled behavior.
         */
        export function resolveCreatorPublicationReaderPolicy(
          doc: unknown,
        ): CreatorPublicationReaderPolicy {
          const stored = readCreatorPublicationDirective(doc);
          const directive = stored ?? createDefaultCreatorPublicationDirective("UTC");
          const readingLabel =
            directive.readingMode === "vertical"
              ? "세로 스크롤"
              : directive.readingDirection === "rtl"
                ? "페이지 · 오른쪽→왼쪽"
                : "페이지 · 왼쪽→오른쪽";

          return {
            directive,
            legacy: stored === null,
            commentsAllowed: directive.comments === "open",
            remixAllowed: directive.allowRemix,
            contentRatingLabel:
              CREATOR_PUBLICATION_CONTENT_RATING_LABELS[directive.contentRating],
            readingLabel,
            requiresMatureConfirmation: directive.contentRating === "mature",
          };
        }

        export type CreatorPublicationPageCommand =
          | "first"
          | "last"
          | "next"
          | "previous";

        export function resolveCreatorPublicationPageKey(
          key: string,
          direction: CreatorPublicationReadingDirection,
        ): CreatorPublicationPageCommand | null {
          switch (key) {
            case "ArrowLeft":
              return direction === "rtl" ? "next" : "previous";
            case "ArrowRight":
              return direction === "rtl" ? "previous" : "next";
            case "PageUp":
              return "previous";
            case "PageDown":
              return "next";
            case "Home":
              return "first";
            case "End":
              return "last";
            default:
              return null;
          }
        }
        """
    ),
)

write_new(
    "apps/web/src/domains/creator/creator-publication-reader.test.ts",
    dedent(
        """\
        import { describe, expect, it } from "vitest";

        import {
          resolveCreatorPublicationPageKey,
          resolveCreatorPublicationReaderPolicy,
        } from "./creator-publication-reader";

        describe("resolveCreatorPublicationReaderPolicy", () => {
          it("keeps legacy works on the historical open vertical experience", () => {
            const policy = resolveCreatorPublicationReaderPolicy({ legacy: true });

            expect(policy).toMatchObject({
              legacy: true,
              commentsAllowed: true,
              remixAllowed: true,
              contentRatingLabel: "전체 이용",
              readingLabel: "세로 스크롤",
              requiresMatureConfirmation: false,
            });
          });

          it("projects stored reader, engagement and rating policy", () => {
            const policy = resolveCreatorPublicationReaderPolicy({
              publication: {
                version: 1,
                mode: "immediate",
                visibility: "public",
                scheduledAt: null,
                timeZone: "Asia/Seoul",
                comments: "closed",
                allowRemix: false,
                readingMode: "paged",
                readingDirection: "rtl",
                contentRating: "mature",
                searchIndexing: true,
                socialTitle: "공유 제목",
                socialDescription: "공유 설명",
                canonicalSlug: "episode-1",
                publishedAt: "2026-09-09T00:00:00.000Z",
              },
            });

            expect(policy).toMatchObject({
              legacy: false,
              commentsAllowed: false,
              remixAllowed: false,
              contentRatingLabel: "성인 대상",
              readingLabel: "페이지 · 오른쪽→왼쪽",
              requiresMatureConfirmation: true,
            });
          });
        });

        describe("resolveCreatorPublicationPageKey", () => {
          it("maps physical arrow keys to logical page movement for both directions", () => {
            expect(resolveCreatorPublicationPageKey("ArrowRight", "ltr")).toBe("next");
            expect(resolveCreatorPublicationPageKey("ArrowLeft", "ltr")).toBe("previous");
            expect(resolveCreatorPublicationPageKey("ArrowLeft", "rtl")).toBe("next");
            expect(resolveCreatorPublicationPageKey("ArrowRight", "rtl")).toBe("previous");
          });

          it("supports paging and boundary keyboard commands", () => {
            expect(resolveCreatorPublicationPageKey("PageUp", "rtl")).toBe("previous");
            expect(resolveCreatorPublicationPageKey("PageDown", "rtl")).toBe("next");
            expect(resolveCreatorPublicationPageKey("Home", "ltr")).toBe("first");
            expect(resolveCreatorPublicationPageKey("End", "ltr")).toBe("last");
            expect(resolveCreatorPublicationPageKey("Enter", "ltr")).toBeNull();
          });
        });
        """
    ),
)

write_new(
    "apps/web/src/domains/creator/PublishedWorkReader.tsx",
    dedent(
        """\
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
        """
    ),
)

write_new(
    "apps/web/src/domains/creator/PublishedWorkReader.test.tsx",
    dedent(
        """\
        // @vitest-environment jsdom
        import { fireEvent, render, screen } from "@testing-library/react";
        import { describe, expect, it, vi } from "vitest";

        import { PublishedWorkReader } from "./PublishedWorkReader";
        import { resolveCreatorPublicationReaderPolicy } from "./creator-publication-reader";
        import { readWorkFx } from "./studio-motion-fx";

        vi.mock("./WebtoonFxPlayer", () => ({
          WebtoonFxPlayer: ({ title, pages }: { title: string; pages: string[] }) => (
            <div data-testid="vertical-reader">{title}:{pages.length}</div>
          ),
        }));

        function policy(overrides: Record<string, unknown> = {}) {
          return resolveCreatorPublicationReaderPolicy({
            publication: {
              version: 1,
              mode: "immediate",
              visibility: "public",
              scheduledAt: null,
              timeZone: "Asia/Seoul",
              comments: "open",
              allowRemix: true,
              readingMode: "paged",
              readingDirection: "ltr",
              contentRating: "all",
              searchIndexing: true,
              socialTitle: "공유 제목",
              socialDescription: "공유 설명",
              canonicalSlug: "episode-1",
              publishedAt: "2026-09-09T00:00:00.000Z",
              ...overrides,
            },
          });
        }

        const fx = readWorkFx({});

        describe("PublishedWorkReader", () => {
          it("keeps vertical works on the effects reader", () => {
            render(
              <PublishedWorkReader
                workId="work-1"
                pages={["page-1"]}
                fx={fx}
                title="작품"
                policy={policy({ readingMode: "vertical" })}
                isOwner={false}
              />,
            );

            expect(screen.getByTestId("vertical-reader").textContent).toBe("작품:1");
            expect(screen.getByText("세로 스크롤")).toBeTruthy();
          });

          it("supports accessible LTR page navigation and direct page selection", () => {
            render(
              <PublishedWorkReader
                workId="work-1"
                pages={["page-1", "page-2", "page-3"]}
                fx={fx}
                title="작품"
                policy={policy()}
                isOwner={false}
              />,
            );

            expect(screen.getByAltText("작품 1페이지")).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
            expect(screen.getByAltText("작품 2페이지")).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "3페이지로 이동" }));
            expect(screen.getByAltText("작품 3페이지")).toBeTruthy();
          });

          it("maps the physical left arrow to next page for RTL works", () => {
            render(
              <PublishedWorkReader
                workId="work-rtl"
                pages={["page-1", "page-2"]}
                fx={fx}
                title="RTL 작품"
                policy={policy({ readingDirection: "rtl" })}
                isOwner={false}
              />,
            );

            const reader = screen.getByRole("region", { name: "페이지 넘김 독자 보기" });
            fireEvent.keyDown(reader, { key: "ArrowLeft" });
            expect(screen.getByAltText("RTL 작품 2페이지")).toBeTruthy();
          });

          it("requires an explicit confirmation before rendering mature work for readers", () => {
            render(
              <PublishedWorkReader
                workId="mature-work"
                pages={["mature-page"]}
                fx={fx}
                title="성인 작품"
                policy={policy({ readingMode: "vertical", contentRating: "mature" })}
                isOwner={false}
              />,
            );

            expect(screen.getByRole("heading", { name: "성인 대상 콘텐츠입니다" })).toBeTruthy();
            expect(screen.queryByTestId("vertical-reader")).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "확인하고 작품 보기" }));
            expect(screen.getByTestId("vertical-reader")).toBeTruthy();
          });

          it("lets an owner preview mature content without the public confirmation gate", () => {
            render(
              <PublishedWorkReader
                workId="mature-owner-work"
                pages={["mature-page"]}
                fx={fx}
                title="성인 작품"
                policy={policy({ readingMode: "vertical", contentRating: "mature" })}
                isOwner
              />,
            );

            expect(screen.queryByRole("heading", { name: "성인 대상 콘텐츠입니다" })).toBeNull();
            expect(screen.getByTestId("vertical-reader")).toBeTruthy();
          });
        });
        """
    ),
)

write_new(
    "apps/web/src/domains/creator/creator-publication-page-meta.ts",
    dedent(
        """\
        import { SITE_URL } from "@toonspectrum/core";
        import { useEffect } from "react";

        import {
          useDocumentTitle,
          useJsonLd,
          useMetaDescription,
          usePageSocialMeta,
        } from "@/hooks/use-document-title";

        import type { CreatorPublicationDirective } from "@/shared/lib/creator-publication-contract";

        export interface CreatorPublicationPageMetaInput {
          workId: string | null;
          title: string | null;
          description: string | null;
          cover: string | null;
          authorName: string | null;
          createdAt: string | null;
          status: string | null;
          directive: CreatorPublicationDirective | null;
        }

        export interface CreatorPublicationPageMetaModel {
          canonicalPath: string;
          title: string;
          description: string;
          image?: string;
          indexable: boolean;
          structuredData: Record<string, unknown>;
        }

        function publicImage(value: string | null): string | undefined {
          const source = value?.trim() ?? "";
          if (/^https?:\/\//u.test(source)) return source;
          if (source.startsWith("/")) return `${SITE_URL}${source}`;
          return undefined;
        }

        function validIsoDate(value: string | null): string | undefined {
          if (!value) return undefined;
          const timestamp = Date.parse(value);
          if (!Number.isFinite(timestamp)) return undefined;
          return new Date(timestamp).toISOString();
        }

        export function createCreatorPublicationPageMetaModel(
          input: CreatorPublicationPageMetaInput,
        ): CreatorPublicationPageMetaModel | null {
          const workId = input.workId?.trim() ?? "";
          const workTitle = input.title?.trim() ?? "";
          if (!workId || !workTitle || !input.directive) return null;

          const title = input.directive.socialTitle.trim() || workTitle;
          const description =
            input.directive.socialDescription.trim()
            || input.description?.trim()
            || `${workTitle} — 툰스튜디오 창작 게시판에서 감상하세요.`;
          const canonicalPath = `/create/${encodeURIComponent(workId)}`;
          const image = publicImage(input.cover);
          const publishedAt =
            validIsoDate(input.directive.publishedAt) ?? validIsoDate(input.createdAt);
          const indexable =
            input.status === "published"
            && input.directive.visibility === "public"
            && input.directive.searchIndexing;
          const contentRating =
            input.directive.contentRating === "mature"
              ? "성인 대상"
              : input.directive.contentRating === "teen"
                ? "청소년 주의"
                : "전체 이용";
          const url = `${SITE_URL}${canonicalPath}`;
          const structuredData: Record<string, unknown> = {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "@id": `${url}#work`,
            name: title,
            description,
            url,
            inLanguage: "ko",
            contentRating,
            isFamilyFriendly: input.directive.contentRating !== "mature",
          };
          const authorName = input.authorName?.trim();
          if (authorName) structuredData.author = { "@type": "Person", name: authorName };
          if (image) structuredData.image = image;
          if (publishedAt) structuredData.datePublished = publishedAt;

          return {
            canonicalPath,
            title,
            description: description.slice(0, 200),
            ...(image ? { image } : {}),
            indexable,
            structuredData,
          };
        }

        function useCreatorPublicationRobots(indexable: boolean | null): void {
          useEffect(() => {
            if (indexable === null) return;
            let element = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
            const created = element === null;
            if (!element) {
              element = document.createElement("meta");
              element.name = "robots";
              document.head.appendChild(element);
            }
            const previous = element.getAttribute("content");
            element.setAttribute(
              "content",
              indexable
                ? "index,follow,max-image-preview:large"
                : "noindex,nofollow,noarchive",
            );
            return () => {
              if (created) element.remove();
              else if (previous === null) element.removeAttribute("content");
              else element.setAttribute("content", previous);
            };
          }, [indexable]);
        }

        export function useCreatorPublicationPageMeta(
          input: CreatorPublicationPageMetaInput,
        ): void {
          const model = createCreatorPublicationPageMetaModel(input);
          useDocumentTitle(model?.title ?? input.title);
          useMetaDescription(model?.description);
          usePageSocialMeta({
            canonicalPath: model?.canonicalPath ?? "/create",
            title: model?.title ?? "",
            description: model?.description ?? "",
            type: "article",
            ...(model?.image
              ? { image: model.image, imageAlt: `${input.title ?? model.title} 작품 표지` }
              : {}),
          });
          useJsonLd(model?.structuredData);
          useCreatorPublicationRobots(model?.indexable ?? null);
        }
        """
    ),
)

write_new(
    "apps/web/src/domains/creator/creator-publication-page-meta.test.tsx",
    dedent(
        """\
        // @vitest-environment jsdom
        import { render } from "@testing-library/react";
        import { afterEach, describe, expect, it } from "vitest";

        import {
          createCreatorPublicationPageMetaModel,
          useCreatorPublicationPageMeta,
          type CreatorPublicationPageMetaInput,
        } from "./creator-publication-page-meta";

        import { createDefaultCreatorPublicationDirective } from "@/shared/lib/creator-publication-contract";

        function input(
          overrides: Partial<CreatorPublicationPageMetaInput> = {},
        ): CreatorPublicationPageMetaInput {
          return {
            workId: "work/1",
            title: "원래 제목",
            description: "원래 설명",
            cover: "/covers/work-1.png",
            authorName: "작가",
            createdAt: "2026-09-08T00:00:00.000Z",
            status: "published",
            directive: {
              ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
              socialTitle: "공유 제목",
              socialDescription: "공유 설명",
              canonicalSlug: "episode-1",
              publishedAt: "2026-09-09T00:00:00.000Z",
            },
            ...overrides,
          };
        }

        function Harness({ value }: { value: CreatorPublicationPageMetaInput }) {
          useCreatorPublicationPageMeta(value);
          return null;
        }

        afterEach(() => {
          document.head.querySelector('meta[name="robots"]')?.remove();
          document.head
            .querySelectorAll('script[type="application/ld+json"]')
            .forEach((element) => element.remove());
        });

        describe("createCreatorPublicationPageMetaModel", () => {
          it("uses author-provided social metadata and a stable encoded canonical path", () => {
            const model = createCreatorPublicationPageMetaModel(input());

            expect(model).toMatchObject({
              canonicalPath: "/create/work%2F1",
              title: "공유 제목",
              description: "공유 설명",
              indexable: true,
            });
            expect(model?.image).toContain("/covers/work-1.png");
            expect(model?.structuredData).toMatchObject({
              name: "공유 제목",
              contentRating: "전체 이용",
              isFamilyFriendly: true,
            });
          });

          it("forces private, unlisted and draft owner views out of search indexing", () => {
            const directive = {
              ...createDefaultCreatorPublicationDirective("UTC"),
              visibility: "unlisted" as const,
              searchIndexing: false,
            };
            expect(
              createCreatorPublicationPageMetaModel(input({ directive }))?.indexable,
            ).toBe(false);
            expect(
              createCreatorPublicationPageMetaModel(input({ status: "draft" }))?.indexable,
            ).toBe(false);
          });
        });

        describe("useCreatorPublicationPageMeta", () => {
          it("creates a noindex robots contract and restores the head on unmount", () => {
            const directive = {
              ...createDefaultCreatorPublicationDirective("UTC"),
              visibility: "unlisted" as const,
              searchIndexing: false,
            };
            const view = render(<Harness value={input({ directive })} />);

            expect(
              document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
            ).toBe("noindex,nofollow,noarchive");
            expect(document.head.querySelector('script[type="application/ld+json"]')).toBeTruthy();

            view.unmount();
            expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
          });
        });
        """
    ),
)

write_new(
    "docs/studio-publishing-reader-policy-consumption.md",
    dedent(
        """\
        # Studio 게시 정책의 공개 독자 화면 적용

        ## 배경

        게시 명령 센터는 `doc.publication`에 읽기 방식, 진행 방향, 콘텐츠 등급, 댓글·리믹스,
        검색 색인과 공유 카드 메타데이터를 저장한다. 저장만 하고 공개 화면이 소비하지 않으면
        작가가 최종 확인한 게시 계약과 독자가 경험하는 결과가 달라진다.

        ## 적용 범위

        - `vertical`: 기존 효과툰 세로 리더와 BGM·컷 연출을 그대로 사용한다.
        - `paged`: 한 페이지 집중 보기, 썸네일 점프, 이전/다음, Home/End/PageUp/PageDown을 제공한다.
        - `rtl`: 문서 페이지 순서는 보존하고 물리적 좌우 화살표의 논리 이동만 반전한다.
        - `mature`: 소유자 미리보기를 제외한 독자에게 명시적 확인 단계를 제공한다.
        - `comments=closed`: 댓글 API를 불필요하게 호출하지 않고 닫힘 상태를 설명한다.
        - `allowRemix=false`: 공개 화면에서 리믹스 진입점을 제거하며 서버 차단과 UI를 일치시킨다.
        - `searchIndexing=false`: SPA head에 `noindex,nofollow,noarchive`를 설정하고 이탈 시 복원한다.
        - `socialTitle/socialDescription`: 브라우저 title, description, Open Graph, Twitter와 JSON-LD에 반영한다.

        ## 벤치마크 반영

        - WEBTOON CANVAS: PC·모바일 미리보기, 연령 등급, 예약 게시 전 최종 검토
        - GlobalComix: 세로/전통식 레이아웃, 예약 공개, 독자 알림 및 분석
        - Clip Studio Share: 좌→우/우→좌/세로 읽기와 배포 전 레이아웃 확인
        - Tapas: 데스크톱·모바일 미리보기, 예약 게시, 댓글 운영

        ## 안전성과 호환성

        - publication 계약이 없는 레거시 작품은 세로 스크롤·댓글 허용·리믹스 허용으로 유지한다.
        - 공개 API가 제거한 예약 시각과 시간대는 독자 UI에서 다시 추론하지 않는다.
        - 성인 확인은 콘텐츠 경고 UX이며 법적 연령 검증을 가장하지 않는다.
        - 저장·예약·권한 판단은 기존 서버 계약이 계속 권위(authoritative)를 가진다.
        - canonical slug 전용 공개 라우트가 아직 없으므로 canonical URL은 안정적인 작품 ID 경로를 쓴다.
        """
    ),
)

replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    'import { lazy, Suspense, useEffect, useState } from "react";',
    'import { lazy, Suspense, useEffect, useMemo, useState } from "react";',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    '''import { STUDIO_RASTER_ASSETS } from "./render/studio-raster-assets";
import { BUBBLE_VARIANTS } from "./studio-assets";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeleteWorkRequest } from "./studio-destructive-command-catalog";
import { readWorkFx } from "./studio-motion-fx";
import { StudioDestructiveConfirmHost } from "./StudioDestructiveConfirmHost";
import { WebtoonFxPlayer } from "./WebtoonFxPlayer";
import { WorkFxPanel } from "./WorkFxPanel";''',
    '''import { resolveCreatorPublicationReaderPolicy } from "./creator-publication-reader";
import { useCreatorPublicationPageMeta } from "./creator-publication-page-meta";
import { PublishedWorkReader } from "./PublishedWorkReader";
import { STUDIO_RASTER_ASSETS } from "./render/studio-raster-assets";
import { BUBBLE_VARIANTS } from "./studio-assets";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeleteWorkRequest } from "./studio-destructive-command-catalog";
import { readWorkFx } from "./studio-motion-fx";
import { StudioDestructiveConfirmHost } from "./StudioDestructiveConfirmHost";
import { WorkFxPanel } from "./WorkFxPanel";''',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    'import { useDocumentTitle } from "@/hooks/use-document-title";\n',
    '',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    '''  const [liking, setLiking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useDocumentTitle(work?.title);
''',
    '''  const [liking, setLiking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const publicationPolicy = useMemo(
    () => resolveCreatorPublicationReaderPolicy(work?.doc),
    [work?.doc],
  );

  useCreatorPublicationPageMeta({
    workId: work?.id ?? id ?? null,
    title: work?.title ?? null,
    description: work?.description ?? null,
    cover: work?.cover ?? null,
    authorName: work?.author.name ?? null,
    createdAt: work?.createdAt ?? null,
    status: work?.status ?? null,
    directive: work ? publicationPolicy.directive : null,
  });
''',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    '''          <Link
            href={`/studio?remix=${encodeURIComponent(work.id)}`}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: "gap-1.5 border-accent/40 bg-accent-soft/20 text-accent hover:bg-accent-soft/30 ml-2 border-solid",
            })}
          >
            <WandSparkles size={14} />
            <span>이어서 편집 (Remix)</span>
          </Link>''',
    '''          {publicationPolicy.remixAllowed ? (
            <Link
              href={`/studio?remix=${encodeURIComponent(work.id)}`}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "gap-1.5 border-accent/40 bg-accent-soft/20 text-accent hover:bg-accent-soft/30 ml-2 border-solid",
              })}
            >
              <WandSparkles size={14} />
              <span>이어서 편집 (Remix)</span>
            </Link>
          ) : work.isOwner ? (
            <span className="ml-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-3">
              <WandSparkles size={14} aria-hidden />
              리믹스 비허용
            </span>
          ) : null}''',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    '''      {/* 세로 웹툰 스크롤 — 효과툰 리더(스크롤 모션·분위기·BGM, doc.fx 기반) */}
      <WebtoonFxPlayer pages={work.pages} fx={readWorkFx(work.doc)} title={work.title} />''',
    '''      {/* 게시 계약을 소비하는 독자 보기 — 세로 효과툰 또는 LTR/RTL 페이지 모드 */}
      <PublishedWorkReader
        key={work.id}
        workId={work.id}
        pages={work.pages}
        fx={readWorkFx(work.doc)}
        title={work.title}
        policy={publicationPolicy}
        isOwner={work.isOwner}
      />''',
)
replace_exact(
    "apps/web/src/domains/creator/CreateWorkPage.tsx",
    '''      <WorkComments workId={work.id} />''',
    '''      {publicationPolicy.commentsAllowed ? (
        <WorkComments workId={work.id} />
      ) : (
        <section className="rounded-2xl border border-line bg-panel/30 p-5 text-center">
          <MessageCircle size={18} className="mx-auto text-fg-3" aria-hidden />
          <h2 className="mt-2 text-sm font-bold text-fg">댓글이 닫혀 있습니다</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            작가가 이 작품의 댓글을 받지 않도록 게시했습니다.
          </p>
        </section>
      )}''',
)

stale_workflow = ROOT / ".github/workflows/codex-patch-pr-977.yml"
if not stale_workflow.exists():
    raise RuntimeError("expected stale PR 977 patch workflow to exist")
stale_workflow.unlink()

print("studio publishing reader policy follow-up applied")
