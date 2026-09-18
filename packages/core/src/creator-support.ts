export const CREATOR_SUPPORT_CATEGORIES = [
  "student",
  "amateur",
  "emerging",
] as const;
export type CreatorSupportCategory = (typeof CREATOR_SUPPORT_CATEGORIES)[number];

export const CREATOR_SUPPORT_AGE_BANDS = [
  "adult",
  "youth_14_18",
  "under14_guardian",
] as const;
export type CreatorSupportAgeBand = (typeof CREATOR_SUPPORT_AGE_BANDS)[number];

export const CREATOR_SUPPORT_NEEDS = [
  "operating_cost",
  "materials_equipment",
  "software_license",
  "mentorship",
  "portfolio_feedback",
  "collaboration",
  "opportunity",
  "sponsorship",
] as const;
export type CreatorSupportNeed = (typeof CREATOR_SUPPORT_NEEDS)[number];

export const CREATOR_SUPPORT_STATUSES = [
  "submitted",
  "reviewing",
  "approved",
  "rejected",
  "on_hold",
] as const;
export type CreatorSupportStatus = (typeof CREATOR_SUPPORT_STATUSES)[number];
export const CREATOR_SUPPORT_OFFER_TYPES = [
  "mentorship",
  "equipment",
  "software_license",
  "portfolio_feedback",
  "collaboration",
  "opportunity",
  "sponsorship",
] as const;
export type CreatorSupportOfferType = (typeof CREATOR_SUPPORT_OFFER_TYPES)[number];

export interface CreatorSupportApplicationInput {
  category: CreatorSupportCategory;
  ageBand: CreatorSupportAgeBand;
  applicantRole: "self" | "guardian";
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: CreatorSupportNeed[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  guardianConfirmed: boolean;
  consentAccepted: boolean;
}

export interface CreatorSupportProject {
  id: string;
  creatorId: string;
  creatorName: string;
  category: CreatorSupportCategory;
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: CreatorSupportNeed[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  monetarySupportEnabled: boolean;
  createdAt: string;
}
export interface CreatorSupportOfferInput {
  type: CreatorSupportOfferType;
  message: string;
  contactEmail: string;
  consentAccepted: boolean;
  website: string;
}

export interface CreatorSupportOfferEntry {
  id: string;
  applicationId: string;
  supporterId: string;
  type: CreatorSupportOfferType;
  message: string;
  contactEmail: string;
  status: "new" | "shared" | "closed";
  createdAt: string;
}

function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/gu, " ").slice(0, maximum);
}

function inList<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function safeHttpsUrl(value: unknown): string {
  const raw = cleanText(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}
export function validateCreatorSupportApplication(input: unknown):
  | { ok: true; value: CreatorSupportApplicationInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "지원 프로그램 신청 내용을 확인해 주세요." };
  }
  const body = input as Record<string, unknown>;
  if (!inList(CREATOR_SUPPORT_CATEGORIES, body.category)) {
    return { ok: false, error: "창작자 유형을 확인해 주세요." };
  }
  if (!inList(CREATOR_SUPPORT_AGE_BANDS, body.ageBand)) {
    return { ok: false, error: "연령 구분을 확인해 주세요." };
  }
  const applicantRole = body.applicantRole === "guardian" ? "guardian" : "self";
  const guardianConfirmed = body.guardianConfirmed === true;
  if (body.ageBand === "under14_guardian" && (applicantRole !== "guardian" || !guardianConfirmed)) {
    return { ok: false, error: "만 14세 미만 신청은 법정대리인이 직접 신청하고 동의해야 합니다." };
  }
  if (body.ageBand === "youth_14_18" && !guardianConfirmed) {
    return { ok: false, error: "미성년 창작자 지원은 보호자 확인이 필요합니다." };
  }
  if (body.consentAccepted !== true) {
    return { ok: false, error: "지원 프로그램 운영 및 연락 안내에 동의해 주세요." };
  }
  const title = cleanText(body.title, 120);
  const story = cleanText(body.story, 3000);
  const intendedUse = cleanText(body.intendedUse, 2000);
  if (title.length < 3 || story.length < 20 || intendedUse.length < 10) {
    return { ok: false, error: "프로젝트 제목과 소개, 필요한 지원 설명을 충분히 입력해 주세요." };
  }
  const needs = Array.isArray(body.supportNeeds)
    ? [...new Set(body.supportNeeds.filter((value): value is CreatorSupportNeed =>
        inList(CREATOR_SUPPORT_NEEDS, value)))]
    : [];
  if (needs.length === 0) {
    return { ok: false, error: "필요한 지원 유형을 하나 이상 선택해 주세요." };
  }
  const budget = Number(body.estimatedBudgetWon ?? 0);
  if (!Number.isInteger(budget) || budget < 0 || budget > 100_000_000) {
    return { ok: false, error: "예상 필요 비용을 확인해 주세요." };
  }
  const portfolioUrl = safeHttpsUrl(body.portfolioUrl);
  if (cleanText(body.portfolioUrl, 500) && !portfolioUrl) {
    return { ok: false, error: "포트폴리오 주소는 안전한 HTTPS 주소만 사용할 수 있어요." };
  }
  return {
    ok: true,
    value: {
      category: body.category,
      ageBand: body.ageBand,
      applicantRole,
      title,
      story,
      intendedUse,
      supportNeeds: needs,
      portfolioUrl,
      estimatedBudgetWon: budget,
      guardianConfirmed,
      consentAccepted: true,
    },
  };
}
export function validateCreatorSupportOffer(input: unknown):
  | { ok: true; spam: false; value: CreatorSupportOfferInput }
  | { ok: true; spam: true; value: null }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "지원 제안 내용을 확인해 주세요." };
  }
  const body = input as Record<string, unknown>;
  if (cleanText(body.website, 300)) return { ok: true, spam: true, value: null };
  if (!inList(CREATOR_SUPPORT_OFFER_TYPES, body.type)) {
    return { ok: false, error: "지원 제안 유형을 확인해 주세요." };
  }
  const message = cleanText(body.message, 2000);
  if (message.length < 10) {
    return { ok: false, error: "지원 제안 내용을 10자 이상 입력해 주세요." };
  }
  const contactEmail = cleanText(body.contactEmail, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail)) {
    return { ok: false, error: "연락받을 이메일을 확인해 주세요." };
  }
  if (body.consentAccepted !== true) {
    return { ok: false, error: "연락 정보 전달 안내에 동의해 주세요." };
  }
  return {
    ok: true,
    spam: false,
    value: {
      type: body.type,
      message,
      contactEmail,
      consentAccepted: true,
      website: "",
    },
  };
}

export function isCreatorSupportStatus(value: unknown): value is CreatorSupportStatus {
  return inList(CREATOR_SUPPORT_STATUSES, value);
}
