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
