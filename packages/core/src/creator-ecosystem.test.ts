import { describe, expect, it } from "vitest";

import {
  normalizeIsbn13,
  validateCollaborationPreference,
  validateCollaborationProposal,
  validateComicCollectionItem,
  validateCreatorBusinessProfile,
} from "./creator-ecosystem";

describe("creator ecosystem contracts", () => {
  it("normalizes valid ISBN-13 and rejects malformed values", () => {
    expect(normalizeIsbn13("978-89-1234-567-8")).toBe("9788912345678");
    expect(normalizeIsbn13("123")).toBe("");
  });

  it("sanitizes creator collaboration preferences", () => {
    const result = validateCollaborationPreference({
      discoverable: true,
      acceptedTypes: ["goods", "video", "goods", "invalid"],
      acceptUnverified: false,
      note: "  국내  굿즈 협업 우선  ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        discoverable: true,
        acceptedTypes: ["goods", "video"],
        acceptUnverified: false,
        note: "국내 굿즈 협업 우선",
      },
    });
  });

  it("requires a secure verified-business profile payload", () => {
    expect(validateCreatorBusinessProfile({
      organization: "Studio Partner",
      website: "https://example.com",
      contactEmail: "biz@example.com",
      evidenceNote: "공식 사이트에서 담당 조직 확인 가능",
      consentAccepted: true,
    }).ok).toBe(true);

    expect(validateCreatorBusinessProfile({
      organization: "Studio Partner",
      website: "http://example.com",
      contactEmail: "biz@example.com",
      evidenceNote: "공식 사이트",
      consentAccepted: true,
    })).toEqual({
      ok: false,
      error: "기업 웹사이트는 안전한 HTTPS 주소를 입력해 주세요.",
    });
  });

  it("validates structured IP proposal ranges and rights", () => {
    const result = validateCollaborationProposal({
      targetCreatorId: "creator-1",
      type: "goods",
      title: "캐릭터 굿즈 협업 제안",
      summary: "국내 팝업과 온라인 판매를 위한 비독점 굿즈 제작 협업을 제안합니다.",
      budgetMinWon: 10_000_000,
      budgetMaxWon: 30_000_000,
      currency: "KRW",
      territories: ["대한민국", "일본", "대한민국"],
      exclusive: false,
      durationMonths: 12,
      projectUrl: "https://example.com/project",
      rightsRequested: ["상품화권", "홍보 사용권", "상품화권"],
      consentAccepted: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.territories).toEqual(["대한민국", "일본"]);
    expect(result.value.rightsRequested).toEqual(["상품화권", "홍보 사용권"]);
  });

  it("rejects inverted proposal budgets", () => {
    const result = validateCollaborationProposal({
      targetCreatorId: "creator-1",
      type: "video",
      title: "영상 제작 협업",
      summary: "공식 숏폼 홍보 영상을 공동 제작하는 프로젝트를 제안드립니다.",
      budgetMinWon: 5_000_000,
      budgetMaxWon: 1_000_000,
      durationMonths: 3,
      consentAccepted: true,
    });
    expect(result).toEqual({
      ok: false,
      error: "예산 범위를 확인해 주세요.",
    });
  });

  it("validates collection status and secure source URLs", () => {
    const result = validateComicCollectionItem({
      isbn13: "9788912345678",
      title: "테스트 웹툰 1권",
      creator: "작가",
      publisher: "출판사",
      volumeLabel: "1권",
      coverUrl: "https://example.com/cover.webp",
      ownershipStatus: "lent",
      readStatus: "read",
      editionType: "signed",
      lentTo: "친구",
      notes: "초판 사인본",
      sourceProvider: "kakao",
      sourceUrl: "https://example.com/book",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ownershipStatus).toBe("lent");
    expect(result.value.editionType).toBe("signed");
  });
});
