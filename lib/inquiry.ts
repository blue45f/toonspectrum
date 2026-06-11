// 인앱 문의 — TermsDesk 공개 문의함(https://termsdesk.vercel.app/api/public/webtoon-index/inquiries) 연동.
// 배포된 계약: { category: contact|partnership|bug|qa|question, title(≥2), body(≥10), website?(허니팟) }.
// 연락처 필드는 계약에 없으므로 본문 끝에 라벨을 붙여 함께 보낸다.
// 브라우저 → termsdesk 직접 POST는 CORS 프리플라이트가 막혀 있어(OPTIONS 500),
// 자체 API(/api/support/inquiries)가 서버에서 대신 전달한다. lib/server/inquiry.ts 참고.

export const TERMSDESK_PROJECT_SLUG = "webtoon-index";
export const TERMSDESK_INQUIRY_ENDPOINT = `https://termsdesk.vercel.app/api/public/${TERMSDESK_PROJECT_SLUG}/inquiries`;
export const TERMSDESK_SUPPORT_URL = `https://termsdesk.vercel.app/support/${TERMSDESK_PROJECT_SLUG}`;

export const INQUIRY_CATEGORIES = [
  { value: "contact", label: "일반 문의", description: "서비스 이용, 계정, 데이터 표시 등 일반적인 문의" },
  { value: "partnership", label: "광고·제휴", description: "광고 집행, 플랫폼 연동, 콘텐츠 제휴, 비즈니스 제안" },
  { value: "bug", label: "버그 제보", description: "오류 화면, 재현 경로, 기대 동작" },
  { value: "qa", label: "데이터 검수", description: "랭킹·카탈로그 수치 오류, 잘못 연결된 작품 정보" },
  { value: "question", label: "기타 질문", description: "그 밖의 모든 질문" },
] as const;

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]["value"];

export const INQUIRY_TITLE_MIN = 2;
export const INQUIRY_TITLE_MAX = 120;
export const INQUIRY_BODY_MIN = 10;
export const INQUIRY_BODY_MAX = 2000;

export interface InquiryInput {
  category: InquiryCategory;
  title: string;
  body: string;
  /** 답변 받을 연락처(이메일 등) — termsdesk 계약엔 없어 본문에 덧붙인다. */
  contact?: string;
  /** 허니팟 — 사람은 비워 두는 숨김 필드. 값이 있으면 봇으로 간주해 전송하지 않는다. */
  website?: string;
}

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return INQUIRY_CATEGORIES.some((category) => category.value === value);
}

export function validateInquiryInput(input: unknown): { value?: InquiryInput; error?: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const category = body.category;
  if (!isInquiryCategory(category)) return { error: "문의 유형을 선택해 주세요." };
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim();
  const contact = String(body.contact ?? "").trim().slice(0, 160);
  const website = typeof body.website === "string" ? body.website : "";
  if (title.length < INQUIRY_TITLE_MIN) return { error: `제목은 ${INQUIRY_TITLE_MIN}자 이상 입력해 주세요.` };
  if (title.length > INQUIRY_TITLE_MAX) return { error: `제목은 ${INQUIRY_TITLE_MAX}자 이하로 입력해 주세요.` };
  if (text.length < INQUIRY_BODY_MIN) return { error: `내용은 ${INQUIRY_BODY_MIN}자 이상 입력해 주세요.` };
  if (text.length > INQUIRY_BODY_MAX) return { error: `내용은 ${INQUIRY_BODY_MAX}자 이하로 입력해 주세요.` };
  return { value: { category, title, body: text, contact: contact || undefined, website } };
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// termsdesk로 보낼 최종 페이로드 — 이메일 연락처는 계약의 contactEmail 필드로,
// 그 외(전화번호 등)는 본문 푸터로 합친다.
export function buildInquiryPayload(input: InquiryInput): {
  category: InquiryCategory;
  title: string;
  body: string;
  contactEmail?: string;
  website: string;
} {
  const contact = (input.contact ?? "").trim();
  const isEmail = SIMPLE_EMAIL_RE.test(contact);
  const footer = contact && !isEmail ? `\n\n— 답변 받을 연락처: ${contact}` : "";
  return {
    category: input.category,
    title: input.title,
    body: `${input.body}${footer}`.slice(0, INQUIRY_BODY_MAX + 200),
    ...(isEmail ? { contactEmail: contact } : {}),
    website: input.website ?? "",
  };
}

// 허니팟이 채워졌으면 true — 호출자는 전송을 생략하고 성공처럼 응답한다(봇에게 신호를 주지 않음).
export function isHoneypotTripped(input: Pick<InquiryInput, "website">): boolean {
  return Boolean(input.website && input.website.trim().length > 0);
}
