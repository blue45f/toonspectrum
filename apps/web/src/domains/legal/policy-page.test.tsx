import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchPolicyDocument,
  formatPolicyDate,
  getStaticPolicyDocument,
  groupPolicySections,
  parsePolicyBlocks,
  policyApiUrl,
  policyPublicUrl,
  shortContentHash,
  splitBoldSegments,
  type PolicyDocument,
} from "./policy-content";
import { PolicyArticle, PolicyErrorFallback } from "./PolicyPage";

const HASH = "746985ca84104e2b6f05bf0da2569c39b6909f7283badb7f3edbec47be5bb875";

describe("policy URL builders", () => {
  it("keeps JSON and human-readable policies on the first-party origin", () => {
    expect(policyApiUrl("terms-of-service")).toBe(
      "/api/legal/policies/terms-of-service",
    );
    expect(policyPublicUrl("privacy-policy")).toBe("/privacy");
    expect(policyPublicUrl("terms-of-service")).toBe("/terms");
  });
});

describe("fetchPolicyDocument", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the reviewed bundled document without network I/O", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const doc = await fetchPolicyDocument("terms-of-service");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(doc).toEqual(getStaticPolicyDocument("terms-of-service"));
    expect(doc).not.toBe(getStaticPolicyDocument("terms-of-service"));
  });

  it("rejects unknown policy slugs without network I/O", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(fetchPolicyDocument("unknown")).rejects.toThrow(
      "policy_not_found",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("parsePolicyBlocks", () => {
  it("parses Korean article headings, paragraphs and lists", () => {
    const body = [
      "제1조 (목적)",
      "이 약관은 서비스 이용 조건을 정합니다.",
      "",
      "제2조 (처리 항목)",
      "처리될 수 있는 정보는 다음과 같습니다.",
      "- 계정 정보: 이메일",
      "- 이용 정보: 접속 기록",
    ].join("\n");

    expect(parsePolicyBlocks(body)).toEqual([
      { kind: "heading", text: "제1조 (목적)" },
      { kind: "paragraph", text: "이 약관은 서비스 이용 조건을 정합니다." },
      { kind: "heading", text: "제2조 (처리 항목)" },
      { kind: "paragraph", text: "처리될 수 있는 정보는 다음과 같습니다." },
      {
        kind: "list",
        ordered: false,
        items: ["계정 정보: 이메일", "이용 정보: 접속 기록"],
      },
    ]);
  });

  it("parses markdown headings and ordered lists, and joins wrapped paragraphs", () => {
    const body = "## 부가 안내\n첫 줄과\n둘째 줄은 한 문단입니다.\n\n1. 첫째\n2. 둘째";

    expect(parsePolicyBlocks(body)).toEqual([
      { kind: "heading", text: "부가 안내" },
      { kind: "paragraph", text: "첫 줄과 둘째 줄은 한 문단입니다." },
      { kind: "list", ordered: true, items: ["첫째", "둘째"] },
    ]);
  });

  it("does not treat a sentence beginning with 제N조 as a heading", () => {
    expect(parsePolicyBlocks("제3조에 따라 운영합니다.")).toEqual([
      { kind: "paragraph", text: "제3조에 따라 운영합니다." },
    ]);
  });
});

describe("groupPolicySections", () => {
  it("groups blocks under headings and keeps a heading-less preface", () => {
    const sections = groupPolicySections(
      parsePolicyBlocks("머리말 문단\n\n제1조 (목적)\n본문"),
    );
    expect(sections).toEqual([
      {
        heading: null,
        blocks: [{ kind: "paragraph", text: "머리말 문단" }],
      },
      {
        heading: "제1조 (목적)",
        blocks: [{ kind: "paragraph", text: "본문" }],
      },
    ]);
  });
});

describe("inline and trust-surface formatting", () => {
  it("splits bold runs without rendering raw HTML", () => {
    expect(splitBoldSegments("이 중 **중요** 항목")).toEqual([
      { text: "이 중 ", bold: false },
      { text: "중요", bold: true },
      { text: " 항목", bold: false },
    ]);
    expect(splitBoldSegments("플레인")).toEqual([
      { text: "플레인", bold: false },
    ]);
  });

  it("shortens content identity and formats dates in KST", () => {
    expect(shortContentHash(HASH)).toBe("746985ca8410");
    expect(formatPolicyDate("2026-06-08T00:00:00.000Z")).toBe(
      "2026년 6월 8일",
    );
    expect(formatPolicyDate("nonsense")).toBeNull();
    expect(formatPolicyDate(null)).toBeNull();
  });
});

describe("PolicyArticle", () => {
  const doc: PolicyDocument = {
    policySlug: "terms-of-service",
    name: "이용약관",
    versionLabel: "v1",
    contentHash: HASH,
    body: "제1조 (목적)\n이 약관은 **서비스** 이용 조건을 정합니다.\n- 항목 하나",
    effectiveAt: "2026-06-08T00:00:00.000Z",
  };

  it("renders the reviewed first-party version and content identity", () => {
    const html = renderToStaticMarkup(<PolicyArticle doc={doc} />);

    expect(html).toContain("제1조 (목적)");
    expect(html).toContain('id="policy-section-1"');
    expect(html).toContain('href="#policy-section-1"');
    expect(html).toMatch(/<h2[^>]*>.*제1조 \(목적\).*<\/h2>/s);
    expect(html).toContain("<strong");
    expect(html).toContain("<li>항목 하나</li>");
    expect(html).toContain("v1");
    expect(html).toContain("툰스펙트럼 게시 정책");
    expect(html).toContain("746985ca8410");
    expect(html).not.toContain(HASH);
    expect(html).toContain("2026년 6월 8일");
    expect(html).not.toContain("vercel.app");
    expect(html).not.toContain("TermsDesk");
  });

  it("renders the bundled privacy policy as the canonical first-party copy", () => {
    const policy = getStaticPolicyDocument("privacy-policy");
    const html = renderToStaticMarkup(<PolicyArticle doc={policy} />);

    expect(policy.source).toBe("static");
    expect(html).toContain("1. 수집하는 항목");
    expect(html).toContain("기기 내 AI 기능과 MediaPipe");
    expect(html).toContain("이용·성능 메타데이터");
    expect(html).toContain("툰스펙트럼 게시 정책");
    expect(html).not.toContain("TermsDesk");
  });
});

describe("PolicyErrorFallback", () => {
  it("offers a retry action and only a first-party canonical link", () => {
    const html = renderToStaticMarkup(
      <PolicyErrorFallback
        slug="privacy-policy"
        label="개인정보처리방침"
        onRetry={() => {}}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("개인정보처리방침을 표시하지 못했습니다.");
    expect(html).toContain("다시 시도");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("vercel.app");
  });
});
