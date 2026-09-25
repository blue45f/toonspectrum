/** Webtoon collaboration contracts. Shared by the browser and API; no paid services. */
export const COLLABORATION_TYPES = { team: "팀원 모집", commission: "작업 의뢰", available: "작업자 홍보" } as const;
export const COLLABORATION_ROLES = {
  story: "스토리·콘티", sketch: "러프·스케치", ink: "선화", flat: "밑색", color: "채색·명암",
  background: "배경", model3d: "3D 모델·소재", lettering: "식자·편집", animation: "모션·영상", other: "기타·복합 작업",
} as const;
export const COLLABORATION_PAY = { paid: "유료", negotiable: "금액 협의", revenue_share: "수익 배분", volunteer: "자율 무보수 협업" } as const;
export const COLLABORATION_MODES = { remote: "원격", onsite: "대면", hybrid: "혼합" } as const;
export const COLLABORATION_UNITS = { episode: "회차", cut: "컷", project: "프로젝트", hour: "시간", month: "월" } as const;
export const COLLABORATION_STATUS = { open: "모집 중", in_progress: "진행 중", closed: "마감" } as const;
export const APPLICATION_STATUS = { submitted: "지원 접수", shortlisted: "협의 중", selected: "합류 확정", declined: "미선정", withdrawn: "지원 철회" } as const;
export type CollaborationType = keyof typeof COLLABORATION_TYPES;
export type CollaborationRole = keyof typeof COLLABORATION_ROLES;
export type CollaborationPay = keyof typeof COLLABORATION_PAY;
export type CollaborationMode = keyof typeof COLLABORATION_MODES;
export type CollaborationStatus = keyof typeof COLLABORATION_STATUS;
export type ApplicationStatus = keyof typeof APPLICATION_STATUS;
export interface CollaborationDetails {
  description: string;
  deliverables: string;
  terms: string;
  compensation: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUnit: keyof typeof COLLABORATION_UNITS;
  deadline: string;
  location: string;
  genre: string;
  tools: string[];
  portfolioUrl: string;
}
export interface CollaborationInput {
  type: CollaborationType;
  role: CollaborationRole;
  title: string;
  payType: CollaborationPay;
  workMode: CollaborationMode;
  details: CollaborationDetails;
}
export interface CollaborationPost extends CollaborationInput {
  id: string;
  author: { id: string; name: string };
  status: CollaborationStatus;
  version: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  saved: boolean;
  expired: boolean;
}
export interface CollaborationApplicationInput { message: string; contact: string; portfolioUrl: string }
export interface CollaborationApplication extends CollaborationApplicationInput {
  id: string;
  postId: string;
  userId: string;
  applicantName: string;
  status: ApplicationStatus;
  createdAt: string;
}
export interface CollaborationList { items: CollaborationPost[]; nextCursor: string | null; hasMore: boolean; canModerate: boolean }
export interface CollaborationDetail {
  post: CollaborationPost;
  application: CollaborationApplication | null;
  canManage: boolean;
  canModerate: boolean;
}
export interface CollaborationReport { postId: string; title: string; hidden: boolean; reason: string; createdAt: string }
export type ValidationResult<T> = { value: T; error?: never } | { value?: never; error: string };
export function collaborationRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function collaborationText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
}
function hasCollaborationUrlControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}
export function isCollaborationKey<T extends object>(map: T, value: unknown): value is Extract<keyof T, string> {
  return typeof value === "string" && Object.hasOwn(map, value);
}
/** Never render user supplied javascript:, data:, credentials or malformed URLs as links. */
export function safeCollaborationUrl(value: unknown): string | null {
  const text = collaborationText(value);
  if (!text) return "";
  if (text.length > 500 || hasCollaborationUrlControlCharacter(text)) return null;
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
/** A date means the end of that calendar day in Korea, not midnight in the browser's zone. */
export function collaborationDeadline(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) return null;
  return Date.parse(`${date}T23:59:59.999+09:00`);
}
function amount(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000 ? value : undefined;
}
export function validateCollaborationInput(input: unknown, now = Date.now()): ValidationResult<CollaborationInput> {
  const body = collaborationRecord(input);
  const details = collaborationRecord(body.details);
  if (!isCollaborationKey(COLLABORATION_TYPES, body.type) || !isCollaborationKey(COLLABORATION_ROLES, body.role)
    || !isCollaborationKey(COLLABORATION_PAY, body.payType) || !isCollaborationKey(COLLABORATION_MODES, body.workMode)) {
    return { error: "모집 유형·작업 분야·보수·작업 방식을 확인해 주세요." };
  }
  if (body.type !== "team" && !["paid", "negotiable"].includes(body.payType)) {
    return { error: "작업 의뢰와 작업자 홍보는 유료 또는 금액 협의로 등록해 주세요. 무보수·수익 배분은 팀원 모집에서만 명시할 수 있어요." };
  }
  const title = collaborationText(body.title);
  const description = collaborationText(details.description);
  const deliverables = collaborationText(details.deliverables);
  const terms = collaborationText(details.terms);
  const compensation = collaborationText(details.compensation);
  if (title.length < 5 || title.length > 100) return { error: "제목을 5~100자로 입력해 주세요." };
  if (description.length < 30 || description.length > 6000) return { error: "작업 소개를 30~6000자로 입력해 주세요." };
  if (deliverables.length < 5 || deliverables.length > 1000) return { error: "작업 분량·납품물·일정을 5~1000자로 입력해 주세요." };
  if (terms.length < 5 || terms.length > 1000) return { error: "저작권·크레딧·수정 범위를 5~1000자로 입력해 주세요." };
  if (compensation.length < 5 || compensation.length > 1000) return { error: "보수·지급 조건을 5~1000자로 입력해 주세요." };
  const budgetMin = amount(details.budgetMin);
  const budgetMax = amount(details.budgetMax);
  if (budgetMin === undefined || budgetMax === undefined || (budgetMin !== null && budgetMax !== null && budgetMax < budgetMin)) {
    return { error: "금액은 1원~10억원 범위의 정수이며, 최대 금액은 최소 금액 이상이어야 해요." };
  }
  if (body.payType === "paid" && budgetMin === null) return { error: "유료 의뢰는 최소 보수를 명시해 주세요." };
  if (["volunteer", "revenue_share"].includes(body.payType) && (budgetMin !== null || budgetMax !== null)) {
    return { error: "무보수·수익 배분은 금액 대신 보수·지급 조건에 구체적으로 적어 주세요." };
  }
  if (!isCollaborationKey(COLLABORATION_UNITS, details.budgetUnit)) return { error: "보수 산정 단위를 선택해 주세요." };
  const deadline = collaborationText(details.deadline);
  const deadlineAt = deadline ? collaborationDeadline(deadline) : null;
  if (deadline && (deadlineAt === null || deadlineAt < now)) return { error: "모집 마감일은 오늘 이후의 올바른 날짜로 입력해 주세요." };
  const location = collaborationText(details.location);
  const genre = collaborationText(details.genre);
  if (location.length > 80 || genre.length > 80) return { error: "지역과 장르는 각각 80자 이내로 입력해 주세요." };
  if (body.workMode !== "remote" && location.length < 2) return { error: "대면·혼합 작업은 지역을 입력해 주세요. 상세 주소는 공개하지 마세요." };
  if (!Array.isArray(details.tools) || details.tools.length > 8 || details.tools.some((tool) => typeof tool !== "string" || !tool.trim() || tool.trim().length > 30)) {
    return { error: "사용 도구는 30자 이내 이름으로 최대 8개까지 입력해 주세요." };
  }
  const portfolioUrl = safeCollaborationUrl(details.portfolioUrl);
  if (portfolioUrl === null) return { error: "포트폴리오는 http 또는 https 주소로 입력해 주세요." };
  return { value: { type: body.type, role: body.role, title, payType: body.payType, workMode: body.workMode,
    details: { description, deliverables, terms, compensation, budgetMin, budgetMax, budgetUnit: details.budgetUnit,
      deadline, location, genre, tools: [...new Set(details.tools.map((tool: string) => tool.trim()))], portfolioUrl } } };
}
export function validateCollaborationApplication(input: unknown): ValidationResult<CollaborationApplicationInput> {
  const body = collaborationRecord(input);
  const message = collaborationText(body.message);
  const contact = collaborationText(body.contact);
  const portfolioUrl = safeCollaborationUrl(body.portfolioUrl);
  if (message.length < 20 || message.length > 2500) return { error: "지원·제안 내용을 20~2500자로 입력해 주세요." };
  if (contact.length > 250 || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact) && !safeCollaborationUrl(contact))) {
    return { error: "연락받을 이메일 또는 http/https 연락 링크를 입력해 주세요." };
  }
  if (portfolioUrl === null) return { error: "포트폴리오 주소를 확인해 주세요." };
  return { value: { message, contact, portfolioUrl } };
}
export function collaborationBudget(post: Pick<CollaborationInput, "payType" | "details">): string {
  const { budgetMin, budgetMax, budgetUnit } = post.details;
  if (post.payType === "volunteer" || post.payType === "revenue_share") return COLLABORATION_PAY[post.payType];
  if (!budgetMin && !budgetMax) return "금액 협의";
  const formatter = new Intl.NumberFormat("ko-KR");
  const range = budgetMin ? `${formatter.format(budgetMin)}원${budgetMax ? ` ~ ${formatter.format(budgetMax)}원` : "부터"}` : `${formatter.format(budgetMax ?? 0)}원 이하`;
  return `${range} / ${COLLABORATION_UNITS[budgetUnit]}`;
}

const COLLAB_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function collaborationCursor(value: unknown): { createdAt: string; id: string } | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 90) {
    throw new Error("잘못된 페이지 주소예요.");
  }
  const [stamp, id, extra] = value.split("|");
  const date = new Date(stamp);
  if (
    extra !== undefined
    || !id
    || !COLLAB_UUID.test(id)
    || !Number.isFinite(date.getTime())
    || date.toISOString() !== stamp
  ) {
    throw new Error("잘못된 페이지 주소예요.");
  }
  return { createdAt: stamp, id };
}

export function isCollaborationPost(value: unknown): value is CollaborationPost {
  const post = collaborationRecord(value);
  const author = collaborationRecord(post.author);
  return typeof post.id === "string"
    && COLLAB_UUID.test(post.id)
    && typeof post.version === "number"
    && Number.isSafeInteger(post.version)
    && post.version > 0
    && typeof author.id === "string"
    && Boolean(author.id)
    && typeof author.name === "string"
    && isCollaborationKey(COLLABORATION_STATUS, post.status)
    && typeof post.createdAt === "string"
    && Number.isFinite(Date.parse(post.createdAt))
    && typeof post.updatedAt === "string"
    && Number.isFinite(Date.parse(post.updatedAt))
    && typeof post.saved === "boolean"
    && typeof post.hidden === "boolean"
    && typeof post.expired === "boolean"
    // Existing expired posts remain readable; deadline validation applies only to writes.
    && Boolean(validateCollaborationInput(post, Number.NEGATIVE_INFINITY).value);
}

export function assertCollaborationList(value: unknown): asserts value is CollaborationList {
  const page = collaborationRecord(value);
  if (
    !Array.isArray(page.items)
    || page.items.some((post) => !isCollaborationPost(post))
    || typeof page.canModerate !== "boolean"
    || typeof page.hasMore !== "boolean"
    || (page.nextCursor !== null && typeof page.nextCursor !== "string")
    || (page.hasMore && !page.nextCursor)
  ) {
    throw new Error("공고 목록 응답을 확인하지 못했어요. 다시 불러와 주세요.");
  }
  if (page.nextCursor !== null) collaborationCursor(page.nextCursor);
}
