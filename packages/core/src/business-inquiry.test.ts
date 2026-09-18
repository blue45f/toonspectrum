import { describe, expect, it } from "vitest";

import {
  BUSINESS_INQUIRY_STATUSES,
  BUSINESS_INQUIRY_TYPES,
  businessInquiryListLimit,
  isBusinessInquiryStatus,
  safeBusinessSourcePath,
  validateBusinessInquiryInput,
} from "./business-inquiry";

const validInput = {
  type: "investment",
  organization: "  Spectrum Ventures  ",
  contactName: " 김 담당 ",
  email: " Partner@Example.COM ",
  website: "https://example.com/about",
  message: " ToonSpectrum 투자 및 IR 자료에 대해 논의하고 싶습니다. ",
  sourcePath: "/business?type=investment#form",
  consentAccepted: true,
  faxNumber: "",
};

describe("business inquiry shared contract", () => {
  it.each(BUSINESS_INQUIRY_TYPES)("accepts supported type %s", (type) => {
    const result = validateBusinessInquiryInput({ ...validInput, type });
    expect(result.error).toBeUndefined();
    expect(result.value?.type).toBe(type);
  });

  it("normalizes reply fields and strips query/hash from the source path", () => {
    const result = validateBusinessInquiryInput(validInput);
    expect(result.value).toMatchObject({
      organization: "Spectrum Ventures",
      contactName: "김 담당",
      email: "partner@example.com",
      website: "https://example.com/about",
      sourcePath: "/business",
      consentAccepted: true,
    });
  });

  it("requires consent, a reply email and meaningful content", () => {
    expect(validateBusinessInquiryInput({ ...validInput, consentAccepted: false }).error).toContain("동의");
    expect(validateBusinessInquiryInput({ ...validInput, email: "not-an-email" }).error).toContain("이메일");
    expect(validateBusinessInquiryInput({ ...validInput, message: "짧음" }).error).toContain("10자");
  });

  it("treats a populated honeypot as spam without returning parsed data", () => {
    const result = validateBusinessInquiryInput({ ...validInput, faxNumber: "010-0000-0000" });
    expect(result.spam).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("accepts only first-party inquiry source paths", () => {
    expect(safeBusinessSourcePath("/contact?from=footer")).toBe("/contact");
    expect(safeBusinessSourcePath("/feedback")).toBe("");
    expect(safeBusinessSourcePath("//evil.example/business")).toBe("");
  });

  it("keeps status and list limits bounded", () => {
    expect(BUSINESS_INQUIRY_STATUSES.every(isBusinessInquiryStatus)).toBe(true);
    expect(businessInquiryListLimit("1000")).toBe(100);
    expect(businessInquiryListLimit("0")).toBe(1);
    expect(businessInquiryListLimit("invalid")).toBe(50);
  });
});
