// 브라우저는 같은 출처 API를 사용하고 사본/게시 정본의 출처를 그대로 보존한다.
import {
  isPolicySlug,
  parsePolicyDocument,
  TERMSDESK_BASE,
  TERMSDESK_ORG_SLUG,
} from "../../../../../packages/core/src/legal-policy";

import type { PolicyDocument } from "../../../../../packages/core/src/legal-policy";

import { api, apiPath, httpStatus } from "@/infrastructure/api";

export {
  getStaticPolicyDocument,
  TERMSDESK_BASE,
  TERMSDESK_ORG_SLUG,
  type PolicyDocument,
  type PolicySlug,
} from "../../../../../packages/core/src/legal-policy";

/** JSON 엔드포인트(GET, 무인증). */
export function policyApiUrl(slug: string): string {
  return apiPath(`/legal/policies/${slug}`);
}

/** 사람이 보는 TermsDesk 게시 페이지 — 에러 폴백·원문 확인 링크로 쓴다. */
export function policyPublicUrl(slug: string): string {
  return `${TERMSDESK_BASE}/p/${TERMSDESK_ORG_SLUG}/${encodeURIComponent(slug)}`;
}

/** 무결성 표기용 콘텐츠 해시 축약(앞 12자). */
export function shortContentHash(hash: string): string {
  return hash.slice(0, 12);
}

/** 시행일을 한국 표기(예: 2026년 6월 8일)로. 약관 시행일은 한국 기준이라 KST로 고정한다. */
export function formatPolicyDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(date);
}

export function shouldAutoFetchPolicyDocument(): boolean {
  if (typeof window === "undefined") return true;
  const explicit = import.meta.env.VITE_POLICY_API_AUTO;
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  const { hostname } = globalThis.location;
  const isLocalPreview = hostname === "127.0.0.1" || hostname === "localhost";
  return !isLocalPreview;
}

/** Validate the display payload without relabeling a fallback as a published original. */
export async function fetchPolicyDocument(slug: string, signal?: AbortSignal): Promise<PolicyDocument> {
  if (!isPolicySlug(slug)) throw new Error("policy_not_found");
  let payload: unknown;
  try {
    payload = await api.get<unknown>(`/legal/policies/${slug}`, {
      cache: "no-store",
      signal,
    });
  } catch (err) {
    const status = httpStatus(err);
    if (status !== null) throw new Error(`policy_fetch_failed:${status}`, { cause: err });
    throw err;
  }
  return parsePolicyDocument(payload, slug, true);
}

export type PolicyBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

// "제1조 (목적)" / "부칙" 처럼 조항 번호(+선택적 괄호 제목)만 있는 줄을 헤딩으로 본다.
// "제3조에 따라 …" 같이 문장이 이어지는 줄은 매치되지 않는다.
const ARTICLE_HEADING = /^(제\d+조|부칙)(\s*\([^)]*\))?$/;
const MD_HEADING = /^#{1,6}\s+(.*)$/;
const UL_ITEM = /^[-*]\s+(.*)$/;
const OL_ITEM = /^\d+[.)]\s+(.*)$/;

/** 본문을 헤딩·문단·리스트 블록으로 파싱한다(마크다운 #, -, 1. + 한국 약관 조항 컨벤션). */
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

/** 헤딩 단위로 묶어 CopyrightPage와 같은 섹션 리듬(space-y)으로 렌더할 수 있게 한다. */
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

/** 인라인 마크다운 중 **굵게**만 지원한다(HTML 미사용 — XSS 표면 없음). */
export function splitBoldSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), bold: false });
    segments.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.length > 0 ? segments : [{ text, bold: false }];
}
