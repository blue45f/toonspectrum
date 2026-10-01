import type { LocalizedText } from "./engineering-story-content";
import { ENGINEERING_REFERENCES } from "./engineering-story-deep-dive-content";
import {
  PUBLISHED_ENGINEERING_CHAPTERS,
  PUBLISHED_ENGINEERING_GUIDES,
} from "./engineering-story-published-content";

/**
 * 용어집 ‘더 읽기’ 링크의 실제 도착지.
 * 용어가 가리키는 id는 제작 스토리 챕터·적용 가이드·참고 자료 중 하나이며, 각 페이지의 앵커로 연결한다.
 * 같은 id가 여러 곳에 있으면 스토리 → 가이드 → 참고 자료 순서로 먼저 찾은 곳을 쓴다.
 */

export type GlossaryLinkPage = "story" | "guides" | "references";

export interface GlossaryLinkTarget {
  readonly id: string;
  readonly page: GlossaryLinkPage;
  readonly href: string;
  readonly title: LocalizedText;
}

export const GLOSSARY_LINK_PAGE_LABELS: Record<GlossaryLinkPage, LocalizedText> = {
  story: { ko: "스토리", en: "Story" },
  guides: { ko: "가이드", en: "Guide" },
  references: { ko: "참고", en: "Reference" },
};

const TARGETS = new Map<string, GlossaryLinkTarget>();

function register(page: GlossaryLinkPage, id: string, title: LocalizedText): void {
  if (TARGETS.has(id)) return;
  TARGETS.set(id, { id, page, href: `/about/technology/${page}#${id}`, title });
}

for (const chapter of PUBLISHED_ENGINEERING_CHAPTERS) register("story", chapter.id, chapter.title);
for (const guide of PUBLISHED_ENGINEERING_GUIDES) register("guides", guide.id, guide.title);
for (const reference of ENGINEERING_REFERENCES) register("references", reference.id, { ko: reference.title, en: reference.title });

export function resolveGlossaryLink(id: string): GlossaryLinkTarget | undefined {
  return TARGETS.get(id);
}
