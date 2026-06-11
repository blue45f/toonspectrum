// TermsDesk(중앙 약관 게시 서비스)의 공개 API에서 게시 정본을 읽어 오는 순수 로직.
// 브라우저는 같은 출처 API 프록시(/api/legal/policies/:slug)를 호출하고,
// 서버가 TermsDesk 공개 JSON을 대신 가져온다(CORS/프리플라이트 배포 차이 회피).
// 본문은 마크다운/플레인텍스트가 섞일 수 있어 의존성 없이 최소 블록 파서로 렌더한다.
import { apiPath } from "@/src/vite/api";

export const TERMSDESK_BASE = "https://termsdesk.vercel.app";
export const TERMSDESK_ORG_SLUG = "webtoon-index";

export type PolicySlug = "terms-of-service" | "privacy-policy";

export interface PolicyDocument {
  policySlug: string;
  name: string;
  versionLabel: string;
  contentHash: string;
  body: string;
  effectiveAt: string | null;
}

/** JSON 엔드포인트(GET, 무인증). */
export function policyApiUrl(slug: string): string {
  return apiPath(`/legal/policies/${slug}`);
}

/** 사람이 보는 TermsDesk 게시 페이지 — 에러 폴백·원문 확인 링크로 쓴다. */
export function policyPublicUrl(slug: string): string {
  return `${TERMSDESK_BASE}/p/${TERMSDESK_ORG_SLUG}/${slug}`;
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

/** 게시 정본을 가져와 화면에 필요한 필드만 검증·정규화한다. 형식이 어긋나면 throw. */
export async function fetchPolicyDocument(slug: string, signal?: AbortSignal): Promise<PolicyDocument> {
  const response = await fetch(policyApiUrl(slug), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`policy_fetch_failed:${response.status}`);
  const payload = (await response.json()) as Record<string, unknown> | null;
  if (
    !payload ||
    typeof payload.body !== "string" ||
    typeof payload.contentHash !== "string" ||
    typeof payload.versionLabel !== "string"
  ) {
    throw new Error("policy_payload_malformed");
  }
  return {
    policySlug: typeof payload.policySlug === "string" ? payload.policySlug : slug,
    name: typeof payload.name === "string" ? payload.name : "",
    versionLabel: payload.versionLabel,
    contentHash: payload.contentHash,
    body: payload.body,
    effectiveAt: typeof payload.effectiveAt === "string" ? payload.effectiveAt : null,
  };
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
