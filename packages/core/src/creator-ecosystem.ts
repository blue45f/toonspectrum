export const COLLABORATION_TYPES = [
  "goods",
  "video",
  "brand",
  "advertising",
  "publishing",
  "animation",
  "game",
  "popup_event",
  "overseas_license",
  "adaptation",
  "other",
] as const;
export type CollaborationType = (typeof COLLABORATION_TYPES)[number];

export const COLLABORATION_TYPE_LABELS: Record<CollaborationType, string> = {
  goods: "굿즈 · 상품화",
  video: "영상 · 숏폼 제작",
  brand: "브랜드 콜라보",
  advertising: "광고 · 브랜드 웹툰",
  publishing: "출판 · 단행본",
  animation: "애니메이션",
  game: "게임 · 인터랙티브",
  popup_event: "팝업 · 전시 · 행사",
  overseas_license: "해외 라이선스",
  adaptation: "영화 · 드라마 · 영상화",
  other: "기타 IP 협업",
};

export const BUSINESS_VERIFICATION_STATUSES = [
  "draft",
  "pending",
  "verified",
  "rejected",
] as const;
export type BusinessVerificationStatus =
  (typeof BUSINESS_VERIFICATION_STATUSES)[number];

export const COLLABORATION_PROPOSAL_STATUSES = [
  "new",
  "reviewing",
  "accepted",
  "declined",
  "withdrawn",
] as const;
export type CollaborationProposalStatus =
  (typeof COLLABORATION_PROPOSAL_STATUSES)[number];

export const COLLECTION_OWNERSHIP_STATUSES = [
  "owned",
  "wanted",
  "borrowed",
  "lent",
  "sold",
  "lost",
] as const;
export type CollectionOwnershipStatus =
  (typeof COLLECTION_OWNERSHIP_STATUSES)[number];

export const COLLECTION_READ_STATUSES = [
  "unread",
  "reading",
  "read",
] as const;
export type CollectionReadStatus =
  (typeof COLLECTION_READ_STATUSES)[number];

export const COLLECTION_EDITION_TYPES = [
  "standard",
  "limited",
  "first",
  "signed",
  "digital",
] as const;
export type CollectionEditionType =
  (typeof COLLECTION_EDITION_TYPES)[number];

export interface CollaborationPreferenceInput {
  discoverable: boolean;
  acceptedTypes: CollaborationType[];
  acceptUnverified: boolean;
  note: string;
}

export interface CollaborationCreatorDirectoryEntry {
  userId: string;
  name: string;
  avatar: string | null;
  acceptedTypes: CollaborationType[];
  acceptUnverified: boolean;
  note: string;
}

export interface CreatorBusinessProfileInput {
  organization: string;
  website: string;
  contactEmail: string;
  evidenceNote: string;
  consentAccepted: boolean;
}

export interface CollaborationProposalInput {
  targetCreatorId: string;
  type: CollaborationType;
  title: string;
  summary: string;
  budgetMinWon: number;
  budgetMaxWon: number;
  currency: "KRW" | "USD" | "JPY" | "EUR";
  territories: string[];
  exclusive: boolean;
  durationMonths: number;
  projectUrl: string;
  rightsRequested: string[];
  consentAccepted: boolean;
}

export interface ComicCollectionItemInput {
  isbn13: string;
  title: string;
  creator: string;
  publisher: string;
  volumeLabel: string;
  coverUrl: string;
  ownershipStatus: CollectionOwnershipStatus;
  readStatus: CollectionReadStatus;
  editionType: CollectionEditionType;
  lentTo: string;
  notes: string;
  sourceProvider: string;
  sourceUrl: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanLine(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maximum)
    : "";
}

function cleanMultiline(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/gu, "\n")
        .replace(/[^\S\n]+/gu, " ")
        .trim()
        .replace(/\n{3,}/gu, "\n\n")
        .slice(0, maximum)
    : "";
}

function safeHttpsUrl(value: unknown): string {
  const raw = cleanLine(value, 600);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function inList<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function cleanStringList(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanLine(item, maximumLength))
    .filter(Boolean))]
    .slice(0, maximumItems);
}

export function normalizeIsbn13(value: unknown): string {
  const digits = cleanLine(value, 30).replace(/[^0-9X]/giu, "");
  return /^\d{13}$/u.test(digits) ? digits : "";
}

export function validateCollaborationPreference(input: unknown):
  | { ok: true; value: CollaborationPreferenceInput }
  | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "제안 수신 설정을 확인해 주세요." };
  const acceptedTypes = Array.isArray(body.acceptedTypes)
    ? [...new Set(body.acceptedTypes.filter((item): item is CollaborationType =>
        inList(COLLABORATION_TYPES, item)))]
    : [];
  return {
    ok: true,
    value: {
      discoverable: body.discoverable === true,
      acceptedTypes,
      acceptUnverified: body.acceptUnverified === true,
      note: cleanMultiline(body.note, 500),
    },
  };
}

export function validateCreatorBusinessProfile(input: unknown):
  | { ok: true; value: CreatorBusinessProfileInput }
  | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "기업 정보를 확인해 주세요." };
  const organization = cleanLine(body.organization, 120);
  const websiteRaw = cleanLine(body.website, 600);
  const website = safeHttpsUrl(websiteRaw);
  const contactEmail = cleanLine(body.contactEmail, 254).toLowerCase();
  const evidenceNote = cleanMultiline(body.evidenceNote, 1200);
  if (organization.length < 2) return { ok: false, error: "기업·단체명을 2자 이상 입력해 주세요." };
  if (!website || website !== safeHttpsUrl(websiteRaw)) {
    return { ok: false, error: "기업 웹사이트는 안전한 HTTPS 주소를 입력해 주세요." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail)) {
    return { ok: false, error: "업무용 연락 이메일을 확인해 주세요." };
  }
  if (evidenceNote.length < 5) {
    return { ok: false, error: "기업 확인에 참고할 설명을 5자 이상 입력해 주세요." };
  }
  if (body.consentAccepted !== true) {
    return { ok: false, error: "기업 확인 및 제안 전달을 위한 정보 처리에 동의해 주세요." };
  }
  return {
    ok: true,
    value: { organization, website, contactEmail, evidenceNote, consentAccepted: true },
  };
}

export function validateCollaborationProposal(input: unknown):
  | { ok: true; value: CollaborationProposalInput }
  | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "협업 제안 내용을 확인해 주세요." };
  const targetCreatorId = cleanLine(body.targetCreatorId, 200);
  if (!targetCreatorId) return { ok: false, error: "제안을 받을 작가를 선택해 주세요." };
  if (!inList(COLLABORATION_TYPES, body.type)) {
    return { ok: false, error: "협업 제안 유형을 확인해 주세요." };
  }
  const title = cleanLine(body.title, 120);
  const summary = cleanMultiline(body.summary, 4000);
  if (title.length < 3 || summary.length < 20) {
    return { ok: false, error: "제목과 제안 내용을 충분히 입력해 주세요." };
  }
  const budgetMinWon = Number(body.budgetMinWon ?? 0);
  const budgetMaxWon = Number(body.budgetMaxWon ?? 0);
  if (!Number.isInteger(budgetMinWon) || !Number.isInteger(budgetMaxWon)
      || budgetMinWon < 0 || budgetMaxWon < budgetMinWon || budgetMaxWon > 10_000_000_000) {
    return { ok: false, error: "예산 범위를 확인해 주세요." };
  }
  const currency = ["KRW", "USD", "JPY", "EUR"].includes(String(body.currency))
    ? body.currency as CollaborationProposalInput["currency"]
    : "KRW";
  const durationMonths = Number(body.durationMonths ?? 0);
  if (!Number.isInteger(durationMonths) || durationMonths < 0 || durationMonths > 120) {
    return { ok: false, error: "계약 기간은 0~120개월 범위로 입력해 주세요." };
  }
  const rawProjectUrl = cleanLine(body.projectUrl, 600);
  const projectUrl = rawProjectUrl ? safeHttpsUrl(rawProjectUrl) : "";
  if (rawProjectUrl && !projectUrl) {
    return { ok: false, error: "프로젝트 주소는 HTTPS 주소를 사용해 주세요." };
  }
  if (body.consentAccepted !== true) {
    return { ok: false, error: "제안 전달 및 연락 정보 공유에 동의해 주세요." };
  }
  return {
    ok: true,
    value: {
      targetCreatorId,
      type: body.type,
      title,
      summary,
      budgetMinWon,
      budgetMaxWon,
      currency,
      territories: cleanStringList(body.territories, 12, 50),
      exclusive: body.exclusive === true,
      durationMonths,
      projectUrl,
      rightsRequested: cleanStringList(body.rightsRequested, 12, 80),
      consentAccepted: true,
    },
  };
}

export function validateComicCollectionItem(input: unknown):
  | { ok: true; value: ComicCollectionItemInput }
  | { ok: false; error: string } {
  const body = record(input);
  if (!body) return { ok: false, error: "소장 도서 정보를 확인해 주세요." };
  const title = cleanLine(body.title, 300);
  if (title.length < 1) return { ok: false, error: "도서 제목을 입력해 주세요." };
  const isbnRaw = cleanLine(body.isbn13, 30);
  const isbn13 = isbnRaw ? normalizeIsbn13(isbnRaw) : "";
  if (isbnRaw && !isbn13) return { ok: false, error: "ISBN-13 형식을 확인해 주세요." };
  const coverRaw = cleanLine(body.coverUrl, 600);
  const coverUrl = coverRaw ? safeHttpsUrl(coverRaw) : "";
  const sourceRaw = cleanLine(body.sourceUrl, 600);
  const sourceUrl = sourceRaw ? safeHttpsUrl(sourceRaw) : "";
  if (coverRaw && !coverUrl) return { ok: false, error: "표지 주소는 HTTPS 주소만 사용할 수 있어요." };
  if (sourceRaw && !sourceUrl) return { ok: false, error: "출처 주소는 HTTPS 주소만 사용할 수 있어요." };
  return {
    ok: true,
    value: {
      isbn13,
      title,
      creator: cleanLine(body.creator, 300),
      publisher: cleanLine(body.publisher, 200),
      volumeLabel: cleanLine(body.volumeLabel, 80),
      coverUrl,
      ownershipStatus: inList(COLLECTION_OWNERSHIP_STATUSES, body.ownershipStatus)
        ? body.ownershipStatus : "owned",
      readStatus: inList(COLLECTION_READ_STATUSES, body.readStatus)
        ? body.readStatus : "unread",
      editionType: inList(COLLECTION_EDITION_TYPES, body.editionType)
        ? body.editionType : "standard",
      lentTo: cleanLine(body.lentTo, 100),
      notes: cleanMultiline(body.notes, 1200),
      sourceProvider: cleanLine(body.sourceProvider, 80),
      sourceUrl,
    },
  };
}

export function isBusinessVerificationStatus(value: unknown): value is BusinessVerificationStatus {
  return inList(BUSINESS_VERIFICATION_STATUSES, value);
}

export function isCollaborationProposalStatus(value: unknown): value is CollaborationProposalStatus {
  return inList(COLLABORATION_PROPOSAL_STATUSES, value);
}
