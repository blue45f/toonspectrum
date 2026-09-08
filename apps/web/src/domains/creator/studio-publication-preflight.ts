import {
  normalizeCreatorPublicationDirective,
  normalizeCreatorPublicationSlug,
  validateCreatorPublicationDirective,
  type CreatorPublicationDirective,
  type CreatorPublicationValidationSeverity,
} from "@/shared/lib/creator-publication-contract";

import { resolveStudioReleaseUtc } from "./studio-release-schedule";

export const STUDIO_PUBLICATION_MAX_PAGES = 40;

export const STUDIO_PUBLICATION_PREFLIGHT_CODES = [
  "TITLE_REQUIRED",
  "PAGES_REQUIRED",
  "TOO_MANY_PAGES",
  "PAGE_ID_DUPLICATE",
  "PAGE_DIMENSIONS_INVALID",
  "DESCRIPTION_MISSING",
  "TAGS_MISSING",
  "TAG_DUPLICATE",
  "VERTICAL_LANDSCAPE_PAGE",
  "VERTICAL_WIDTHS_INCONSISTENT",
  "PAGED_EXTREME_ASPECT_RATIO",
  "SERIES_METADATA_RECOMMENDED",
] as const;

export type StudioPublicationPreflightCode =
  | (typeof STUDIO_PUBLICATION_PREFLIGHT_CODES)[number]
  | string;

export interface StudioPublicationPageCandidate {
  id: string;
  name?: string;
  width: number;
  height: number;
}

export interface StudioPublicationPreflightInput {
  title: string;
  description: string;
  tags: readonly string[];
  pages: readonly StudioPublicationPageCandidate[];
  directive: CreatorPublicationDirective;
  challengeLinked?: boolean;
  seriesLinked?: boolean;
  now?: Date;
}

export interface StudioPublicationPreflightIssue {
  code: StudioPublicationPreflightCode;
  severity: CreatorPublicationValidationSeverity;
  message: string;
  path: string;
}

export interface StudioPublicationPreflightResult {
  canPublish: boolean;
  issues: StudioPublicationPreflightIssue[];
  errors: StudioPublicationPreflightIssue[];
  warnings: StudioPublicationPreflightIssue[];
  directive: CreatorPublicationDirective;
}

export interface StudioPublicationScheduleResolution {
  ok: boolean;
  iso: string | null;
  message: string | null;
}

function normalizedTag(value: string): string {
  return value.trim().replace(/^#+/u, "").slice(0, 24);
}

export function parseStudioPublicationTags(value: string | readonly string[]): string[] {
  const source = Array.isArray(value) ? value : value.split(/[,\s]+/u);
  return source.map(normalizedTag).filter(Boolean).slice(0, 8);
}

export function suggestStudioPublicationSocialMetadata(
  title: string,
  description: string,
): Pick<CreatorPublicationDirective, "socialTitle" | "socialDescription" | "canonicalSlug"> {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim().replace(/\s+/gu, " ");
  return {
    socialTitle: cleanTitle.slice(0, 70),
    socialDescription: cleanDescription.slice(0, 160),
    canonicalSlug: normalizeCreatorPublicationSlug(cleanTitle),
  };
}

export function resolveStudioPublicationSchedule(
  localDateTime: string,
  timeZone: string,
): StudioPublicationScheduleResolution {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/u.exec(localDateTime.trim());
  if (!match) {
    return { ok: false, iso: null, message: "예약 날짜와 시간을 모두 입력해 주세요." };
  }
  const resolution = resolveStudioReleaseUtc(
    { localDate: match[1], localTime: match[2], timeZone },
    { disambiguation: "reject" },
  );
  if (resolution.ok) return { ok: true, iso: resolution.utcIso, message: null };
  const messageByReason: Record<typeof resolution.reason, string> = {
    "invalid-local-date": "올바른 예약 날짜를 입력해 주세요.",
    "invalid-local-time": "올바른 예약 시간을 입력해 주세요.",
    "invalid-time-zone": "올바른 시간대를 선택해 주세요.",
    "nonexistent-local-time": "일광절약시간 전환으로 존재하지 않는 시각입니다. 다른 시간을 선택해 주세요.",
    "ambiguous-local-time": "일광절약시간 전환으로 두 번 존재하는 시각입니다. 다른 시간을 선택해 주세요.",
  };
  return { ok: false, iso: null, message: messageByReason[resolution.reason] };
}

export function formatStudioPublicationLocalDateTime(
  iso: string | null,
  timeZone: string,
): string {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    const time = `${value("hour")}:${value("minute")}`;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(`${date}T${time}`)
      ? `${date}T${time}`
      : "";
  } catch {
    return "";
  }
}

export function validateStudioPublicationPreflight(
  input: StudioPublicationPreflightInput,
): StudioPublicationPreflightResult {
  const directive = normalizeCreatorPublicationDirective(input.directive);
  const issues: StudioPublicationPreflightIssue[] = [];
  const add = (
    code: StudioPublicationPreflightCode,
    severity: CreatorPublicationValidationSeverity,
    message: string,
    path: string,
  ) => issues.push({ code, severity, message, path });

  if (!input.title.trim()) {
    add("TITLE_REQUIRED", "error", "작품 제목을 입력해 주세요.", "title");
  }
  if (input.pages.length === 0) {
    add("PAGES_REQUIRED", "error", "이미지를 1장 이상 추가해 주세요.", "pages");
  }
  if (input.pages.length > STUDIO_PUBLICATION_MAX_PAGES) {
    add(
      "TOO_MANY_PAGES",
      "error",
      `한 작품에는 이미지를 최대 ${STUDIO_PUBLICATION_MAX_PAGES}장까지 게시할 수 있습니다.`,
      "pages",
    );
  }

  const pageIds = new Set<string>();
  const widths: number[] = [];
  let landscapePages = 0;
  let extremePagedPages = 0;
  input.pages.forEach((page, index) => {
    if (pageIds.has(page.id)) {
      add(
        "PAGE_ID_DUPLICATE",
        "error",
        `${index + 1}번째 이미지의 내부 식별자가 중복됐습니다. 다시 추가해 주세요.`,
        `pages[${index}].id`,
      );
    }
    pageIds.add(page.id);
    if (
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width < 1 ||
      page.height < 1
    ) {
      add(
        "PAGE_DIMENSIONS_INVALID",
        "error",
        `${index + 1}번째 이미지의 크기 정보를 확인하지 못했습니다.`,
        `pages[${index}]`,
      );
      return;
    }
    widths.push(page.width);
    if (page.width > page.height) landscapePages += 1;
    if (page.height / page.width > 4) extremePagedPages += 1;
  });

  const tags = input.tags.map(normalizedTag).filter(Boolean);
  if (!input.description.trim()) {
    add(
      "DESCRIPTION_MISSING",
      "warning",
      "작품 소개가 비어 있습니다. 독자가 작품을 고르기 어렵습니다.",
      "description",
    );
  }
  if (tags.length === 0) {
    add("TAGS_MISSING", "warning", "검색과 추천에 사용할 태그가 없습니다.", "tags");
  }
  const seenTags = new Set<string>();
  tags.forEach((tag, index) => {
    const key = tag.toLocaleLowerCase("ko-KR");
    if (seenTags.has(key)) {
      add(
        "TAG_DUPLICATE",
        "warning",
        `중복 태그 “${tag}”를 정리해 주세요.`,
        `tags[${index}]`,
      );
    }
    seenTags.add(key);
  });

  if (directive.readingMode === "vertical" && landscapePages > 0) {
    add(
      "VERTICAL_LANDSCAPE_PAGE",
      "warning",
      `세로 스크롤 작품에 가로 이미지가 ${landscapePages}장 있습니다. 모바일 가독성을 미리 확인하세요.`,
      "pages",
    );
  }
  if (directive.readingMode === "vertical" && widths.length > 1) {
    const minimum = Math.min(...widths);
    const maximum = Math.max(...widths);
    if (maximum > 0 && maximum - minimum > maximum * 0.15) {
      add(
        "VERTICAL_WIDTHS_INCONSISTENT",
        "warning",
        "페이지 폭 차이가 15%를 넘습니다. 세로 리더에서 확대·축소가 눈에 띌 수 있습니다.",
        "pages",
      );
    }
  }
  if (directive.readingMode === "paged" && extremePagedPages > 0) {
    add(
      "PAGED_EXTREME_ASPECT_RATIO",
      "warning",
      `페이지 넘김 모드에 매우 긴 이미지가 ${extremePagedPages}장 있습니다. 세로 스크롤 모드를 검토하세요.`,
      "pages",
    );
  }
  if (input.seriesLinked && !input.description.trim()) {
    add(
      "SERIES_METADATA_RECOMMENDED",
      "warning",
      "연재 회차에는 이번 화의 핵심 내용을 설명에 적는 것을 권장합니다.",
      "description",
    );
  }

  const policy = validateCreatorPublicationDirective(directive, {
    now: input.now,
    challengeLinked: input.challengeLinked,
  });
  for (const issue of policy.issues) {
    add(issue.code, issue.severity, issue.message, issue.path);
  }

  const deduplicated = issues.filter(
    (issue, index, all) =>
      all.findIndex(
        (candidate) => candidate.code === issue.code && candidate.path === issue.path,
      ) === index,
  );
  const errors = deduplicated.filter((issue) => issue.severity === "error");
  const warnings = deduplicated.filter((issue) => issue.severity === "warning");
  return {
    canPublish: errors.length === 0,
    issues: deduplicated,
    errors,
    warnings,
    directive,
  };
}
