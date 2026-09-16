// Legal policies are first-party release assets. The browser never depends on
// an external publication service to display the reviewed policy text.
import {
  getStaticPolicyDocument,
  isPolicySlug,
} from "../../../../../packages/core/src/legal-policy";

import type { PolicyDocument } from "../../../../../packages/core/src/legal-policy";

import { apiPath } from "@/infrastructure/api";

export {
  getStaticPolicyDocument,
  type PolicyDocument,
  type PolicySlug,
} from "../../../../../packages/core/src/legal-policy";

/** Same-origin JSON endpoint for non-React clients and operational checks. */
export function policyApiUrl(slug: string): string {
  return apiPath(`/legal/policies/${slug}`);
}

/** Canonical first-party page for people reading the policy. */
export function policyPublicUrl(slug: string): string {
  return slug === "privacy-policy" ? "/privacy" : "/terms";
}

/** Content identity display (first 12 characters). */
export function shortContentHash(hash: string): string {
  return hash.slice(0, 12);
}

/** Format an effective date in Korean/KST. */
export function formatPolicyDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

/**
 * Compatibility helper retained for callers that previously fetched TermsDesk.
 * It now resolves from the reviewed first-party bundle without network I/O.
 */
export async function fetchPolicyDocument(
  slug: string,
  _signal?: AbortSignal,
): Promise<PolicyDocument> {
  if (!isPolicySlug(slug)) throw new Error("policy_not_found");
  return { ...getStaticPolicyDocument(slug) };
}

export type PolicyBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

// "제1조 (목적)" / "부칙"처럼 조항 번호(+선택적 괄호 제목)만 있는 줄을 헤딩으로 본다.
const ARTICLE_HEADING = /^(제\d+조|부칙)(\s*\([^)]*\))?$/;
const MD_HEADING = /^#{1,6}\s+(.*)$/;
const UL_ITEM = /^[-*]\s+(.*)$/;
const OL_ITEM = /^\d+[.)]\s+(.*)$/;

/** Parse plain-text/Markdown policy bodies without rendering raw HTML. */
export function parsePolicyBlocks(body: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const md = line.match(MD_HEADING);
    if (md || ARTICLE_HEADING.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: (md ? md[1] : line).trim() });
      continue;
    }
    const ol = line.match(OL_ITEM);
    const ul = ol ? null : line.match(UL_ITEM);
    if (ol || ul) {
      flushParagraph();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ol?.[1] ?? ul?.[1] ?? "").trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export interface PolicySection {
  heading: string | null;
  blocks: PolicyBlock[];
}

/** Group parsed blocks into visually coherent sections. */
export function groupPolicySections(blocks: PolicyBlock[]): PolicySection[] {
  const sections: PolicySection[] = [];
  for (const block of blocks) {
    if (block.kind === "heading") {
      sections.push({ heading: block.text, blocks: [] });
      continue;
    }
    let current = sections[sections.length - 1];
    if (!current) {
      current = { heading: null, blocks: [] };
      sections.push(current);
    }
    current.blocks.push(block);
  }
  return sections;
}

export interface InlineSegment {
  text: string;
  bold: boolean;
}

/** Support only **bold** inline Markdown; raw HTML is never rendered. */
export function splitBoldSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), bold: false });
  }
  return segments.length > 0 ? segments : [{ text, bold: false }];
}
