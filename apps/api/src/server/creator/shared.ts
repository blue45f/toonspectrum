// creator 서버 모듈 공통 내부 헬퍼 — 텍스트/태그/페이지 정규화, QA 계정 격리, DB 유틸.
import { sql } from "drizzle-orm";

import { db } from "../../db";

import type { CreatorAuthor } from "./works-contract";
import type { SQL, SQLWrapper } from "drizzle-orm";

export type CreatorCommunityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_COMMENT = 1000;
export const MAX_TAGS = 8;
export const MAX_TAG_LEN = 24;
export const MAX_PAGES = 200;
// 브라우저/DB 통합 QA가 예약해서 쓰는 계정 접두사. 로컬 데모 시드(`seed-*`)는 의도적으로
// 포함하지 않는다. db:seed가 원격 Neon 실행을 거부하므로 시드 데이터는 로컬 기능 시연에
// 남아 있어야 하며, QA 임시 계정만 공개 창작 피드에서 격리한다.
export const QA_USER_ID_PREFIX = "test-user-" as const;

export function postgresErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null || visited.has(current)) return undefined;
    visited.add(current);
    const candidate = current as { cause?: unknown; code?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

export function safeDate(value: Date | number | string | null | undefined): string {
  return new Date(value ?? Date.now()).toISOString();
}

export function authorOf(row: { userId?: string | null; author?: string | null; avatar?: string | null }): CreatorAuthor {
  return { id: row.userId ?? undefined, name: row.author ?? "익명", avatar: row.avatar ?? "#7c5cfc" };
}

export function clampText(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function normalizeMultiline(value: unknown, max: number): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().replace(/\n{3,}/g, "\n\n").slice(0, max);
}

export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const tag = clampText(raw, MAX_TAG_LEN).replace(/^#/, "");
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function parseTagValue(value: unknown): string[] {
  if (Array.isArray(value)) return cleanTags(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return cleanTags(parsed);
    } catch {
      return cleanTags(value.split(/[,\n]/));
    }
  }
  return [];
}

export function cleanPages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((p) => String(p ?? "")).filter((p) => p.length > 0).slice(0, MAX_PAGES);
}

export function parsePages(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((p) => String(p ?? ""));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((p) => String(p ?? ""));
    } catch {
      return [];
    }
  }
  return [];
}

export function isTestUserId(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(QA_USER_ID_PREFIX));
}

export function excludeTestUserId(column: SQLWrapper): SQL {
  return sql`coalesce(${column}, '') NOT LIKE ${`${QA_USER_ID_PREFIX}%`}`;
}

// seriesId/challengeId 같은 참조 id 정규화 — 빈 문자열은 null.
export function parseRefId(value: unknown): string | null {
  const id = clampText(value, 160);
  return id.length > 0 ? id : null;
}
