import { describe, expect, it } from "vitest";

import {
  buildInquiryPayload,
  INQUIRY_BODY_MAX,
  INQUIRY_TITLE_MAX,
  isHoneypotTripped,
  TERMSDESK_INQUIRY_ENDPOINT,
  validateInquiryInput,
} from "../inquiry";

const validInput = {
  category: "contact",
  title: "데이터 문의",
  body: "랭킹 수치가 이상해 보여서 문의드립니다.",
};

describe("inquiry 인앱 문의", () => {
  it("termsdesk 공개 문의함 엔드포인트(slug=webtoon-index)를 가리킨다", () => {
    expect(TERMSDESK_INQUIRY_ENDPOINT).toBe("https://termsdesk.vercel.app/api/public/webtoon-index/inquiries");
  });

  it("카테고리·제목·본문 경계를 검증한다", () => {
    expect(validateInquiryInput({ ...validInput, category: "spam" }).error).toBeTruthy();
    expect(validateInquiryInput({ ...validInput, title: "a" }).error).toBeTruthy();
    expect(validateInquiryInput({ ...validInput, title: "t".repeat(INQUIRY_TITLE_MAX + 1) }).error).toBeTruthy();
    expect(validateInquiryInput({ ...validInput, body: "짧음" }).error).toBeTruthy();
    expect(validateInquiryInput({ ...validInput, body: "b".repeat(INQUIRY_BODY_MAX + 1) }).error).toBeTruthy();

    const ok = validateInquiryInput({ ...validInput, title: "  데이터 문의  " });
    expect(ok.error).toBeUndefined();
    expect(ok.value?.title).toBe("데이터 문의");
    expect(ok.value?.category).toBe("contact");
  });

  it("허니팟(website)이 채워지면 봇으로 판정한다", () => {
    expect(isHoneypotTripped({ website: "http://spam.example" })).toBe(true);
    expect(isHoneypotTripped({ website: "   " })).toBe(false);
    expect(isHoneypotTripped({ website: "" })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
  });

  it("이메일 연락처는 contactEmail 필드로, 그 외는 본문 푸터로 전달한다", () => {
    const withEmail = buildInquiryPayload({ ...validInput, category: "contact", contact: "user@example.com" });
    expect(withEmail.contactEmail).toBe("user@example.com");
    expect(withEmail.body).not.toContain("연락처");

    const withPhone = buildInquiryPayload({ ...validInput, category: "contact", contact: "010-1234-5678" });
    expect(withPhone.contactEmail).toBeUndefined();
    expect(withPhone.body).toContain("010-1234-5678");

    const plain = buildInquiryPayload({ ...validInput, category: "contact" });
    expect(plain.contactEmail).toBeUndefined();
    expect(plain.body).toBe(validInput.body);
    expect(plain.website).toBe("");
  });
});
