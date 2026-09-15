// Optional legacy inquiry-board adapter.
//
// The product routes users to the first-party /feedback community. This module
// is retained only for explicitly configured compatibility deployments and has
// no hosted default, preventing accidental browser calls to a third-party app.
const BASE = import.meta.env.VITE_DESK_PLATFORM_URL?.trim() ?? "";

export const APP_ID = "toonspectrum";

export type InquiryCategory = "partnership" | "bug" | "feedback" | "usage";
export type InquiryStatus = "new" | "in_progress" | "resolved" | "closed";

export const INQUIRY_CATEGORY_LABELS: Record<InquiryCategory, string> = {
  partnership: "제휴 문의",
  bug: "버그 신고",
  feedback: "사이트 의견",
  usage: "이용 문의",
};

export const INQUIRY_CATEGORIES: InquiryCategory[] = [
  "partnership",
  "bug",
  "feedback",
  "usage",
];

export const INQUIRY_CATEGORY_HINTS: Record<InquiryCategory, string> = {
  partnership: "협업·제휴 제안",
  bug: "사이트 오류 신고",
  feedback: "개선 의견·제안",
  usage: "사용법·일반 문의",
};

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "접수",
  in_progress: "처리 중",
  resolved: "해결됨",
  closed: "종료",
};

export const INQUIRY_TITLE_MAX = 120;
export const INQUIRY_BODY_MAX = 4000;
export const INQUIRY_NAME_MAX = 80;

export interface Inquiry {
  id: string;
  appId: string;
  category: InquiryCategory;
  status: InquiryStatus;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryList {
  appId: string;
  items: Inquiry[];
  limit: number;
  offset: number;
}

export interface SubmitInquiryInput {
  category: InquiryCategory;
  title: string;
  body: string;
  contactEmail?: string;
  authorName?: string;
}

function endpoint(path: string): URL {
  if (!BASE) {
    throw new Error(
      "외부 문의 서비스가 구성되지 않았습니다. 툰스펙트럼의 /feedback 보드를 이용해 주세요.",
    );
  }
  return new URL(path, BASE);
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      const joined = data.message
        .filter((item) => typeof item === "string" && item.trim())
        .join(", ");
      if (joined) return joined;
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // A missing or malformed response body uses the bounded fallback message.
  }
  return fallback;
}

export async function submitInquiry(
  input: SubmitInquiryInput,
): Promise<Inquiry> {
  const url = endpoint(`/api/v1/apps/${APP_ID}/inquiries`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      originUrl: typeof location !== "undefined" ? location.href : undefined,
      website: "",
    }),
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "문의 등록에 실패했어요. 잠시 후 다시 시도해 주세요.",
      ),
    );
  }
  return (await response.json()) as Inquiry;
}

export async function listInquiries(
  limit = 20,
  offset = 0,
): Promise<InquiryList> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  const url = endpoint(`/api/v1/apps/${APP_ID}/inquiries`);
  url.searchParams.set("limit", String(safeLimit));
  url.searchParams.set("offset", String(safeOffset));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "문의 목록을 불러오지 못했어요."),
    );
  }
  return (await response.json()) as InquiryList;
}
