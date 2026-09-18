/** Privacy-minimal contract for private business, IR and sponsorship inquiries. */
export const BUSINESS_INQUIRY_TYPES = [
  "investment",
  "partnership",
  "content_ip",
  "sponsorship",
  "ir_material",
  "meeting",
] as const;

export type BusinessInquiryType = (typeof BUSINESS_INQUIRY_TYPES)[number];

export const BUSINESS_INQUIRY_TYPE_LABELS: Record<BusinessInquiryType, string> = {
  investment: "투자 · IR 문의",
  partnership: "사업 제휴",
  content_ip: "콘텐츠 · IP 제휴",
  sponsorship: "후원 · 스폰서십",
  ir_material: "IR 자료 요청",
  meeting: "미팅 요청",
};

export const BUSINESS_INQUIRY_STATUSES = [
  "new",
  "reviewing",
  "meeting_scheduled",
  "negotiating",
  "completed",
  "on_hold",
] as const;

export type BusinessInquiryStatus = (typeof BUSINESS_INQUIRY_STATUSES)[number];

export const BUSINESS_INQUIRY_STATUS_LABELS: Record<BusinessInquiryStatus, string> = {
  new: "신규",
  reviewing: "검토 중",
  meeting_scheduled: "미팅 예정",
  negotiating: "협의 중",
  completed: "완료",
  on_hold: "보류",
};

export interface BusinessInquiryInput {
  type: BusinessInquiryType;
  organization: string;
  contactName: string;
  email: string;
  website: string;
  message: string;
  sourcePath: string;
  consentAccepted: true;
  /** Hidden anti-bot field. Real users should never populate it. */
  faxNumber?: string;
}

export interface BusinessInquiryEntry {
  id: string;
  type: BusinessInquiryType;
  organization: string;
  contactName: string;
  email: string;
  website: string;
  message: string;
  sourcePath: string;
  status: BusinessInquiryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessInquiryPage {
  items: BusinessInquiryEntry[];
  total: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanLine(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanMessage(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").trim().replace(/\n{3,}/g, "\n\n")
    : "";
}

export function isBusinessInquiryType(value: unknown): value is BusinessInquiryType {
  return typeof value === "string" && BUSINESS_INQUIRY_TYPES.some((item) => item === value);
}

export function isBusinessInquiryStatus(value: unknown): value is BusinessInquiryStatus {
  return typeof value === "string" && BUSINESS_INQUIRY_STATUSES.some((item) => item === value);
}

export function safeBusinessSourcePath(value: unknown): string {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "";
  const path = value.split(/[?#]/u, 1)[0];
  return /^\/(?:business|contact)\/?$/u.test(path) ? path : "";
}

export function validateBusinessInquiryInput(input: unknown): { value?: BusinessInquiryInput; error?: string; spam?: boolean } {
  const body = record(input);
  if (!body) return { error: "문의 내용을 확인해 주세요." };
  if (typeof body.faxNumber === "string" && body.faxNumber.trim()) {
    return { error: "문의 내용을 확인해 주세요.", spam: true };
  }
  if (!isBusinessInquiryType(body.type)) return { error: "문의 유형을 선택해 주세요." };

  const organization = cleanLine(body.organization, 120);
  const contactName = cleanLine(body.contactName, 80);
  const email = cleanLine(body.email, 254).toLowerCase();
  const website = cleanLine(body.website, 300);
  const message = cleanMessage(body.message);
  const sourcePath = safeBusinessSourcePath(body.sourcePath);

  if (contactName.length < 2) return { error: "담당자 이름을 2자 이상 입력해 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return { error: "회신받을 이메일 주소를 확인해 주세요." };
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid protocol");
    } catch {
      return { error: "웹사이트 주소는 http 또는 https 주소로 입력해 주세요." };
    }
  }
  if (message.length < 10) return { error: "문의 내용을 10자 이상 입력해 주세요." };
  if (message.length > 5000) return { error: "문의 내용은 5000자 이하로 입력해 주세요." };
  if (body.consentAccepted !== true) return { error: "문의 처리를 위한 개인정보 수집·이용에 동의해 주세요." };

  return {
    value: {
      type: body.type,
      organization,
      contactName,
      email,
      website,
      message,
      sourcePath,
      consentAccepted: true,
      faxNumber: "",
    },
  };
}

export function businessInquiryListLimit(value: unknown): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}
