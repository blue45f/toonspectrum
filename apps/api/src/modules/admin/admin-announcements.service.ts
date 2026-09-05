import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { dbClient } from "../../db";

import {
  ensureAdminSchema,
  logAuditAction,
  requireAdminUser,
} from "./admin-types";

const ANNOUNCEMENT_LEVELS = new Set(["info", "warning", "critical"]);
const ANNOUNCEMENT_PLACEMENTS = new Set([
  "top_banner",
  "popup_modal",
  "community_top",
]);
const ANNOUNCEMENT_TARGET_ROLES = new Set([
  "all",
  "user",
  "creator",
  "operator",
  "admin",
]);

function parseRequiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  const text = String(value ?? "").trim();
  if (!text) throw new BadRequestException(`${label}을(를) 입력해 주세요.`);
  if (text.length > maxLength) {
    throw new BadRequestException(`${label}은(는) ${maxLength}자 이하로 입력해 주세요.`);
  }
  return text;
}

function parseOptionalText(value: unknown, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) {
    throw new BadRequestException(`내용은 ${maxLength}자 이하로 입력해 주세요.`);
  }
  return text;
}

function parseEnum(
  value: unknown,
  fallback: string,
  allowed: ReadonlySet<string>,
  label: string,
): string {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (!allowed.has(normalized)) {
    throw new BadRequestException(`지원하지 않는 ${label} 값입니다.`);
  }
  return normalized;
}

function parseOptionalDate(value: unknown, label: string): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label}이(가) 올바른 날짜가 아닙니다.`);
  }
  return date;
}

@Injectable()
export class AdminAnnouncementsService {
  async getAnnouncements(userId: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();

    try {
      const result = await dbClient.execute(
        `SELECT id, title, content, level, placement, "targetRole", "isActive", "startsAt", "endsAt", "createdAt"
         FROM admin_announcements
         ORDER BY "createdAt" DESC`,
      );
      return {
        items: result.rows,
        meta: {
          total: result.rows.length,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch {
      return {
        items: [],
        meta: { total: 0, generatedAt: new Date().toISOString() },
      };
    }
  }

  async upsertAnnouncement(
    userId: string,
    payload: Record<string, unknown>,
  ) {
    const admin = await requireAdminUser(userId);
    await ensureAdminSchema();

    const title = parseRequiredText(payload.title, "공지사항 제목", 160);
    const content = parseOptionalText(payload.content, 5_000);
    const id = payload.id ? String(payload.id).trim() : randomUUID();
    if (!id) throw new BadRequestException("공지사항 ID가 올바르지 않습니다.");

    const level = parseEnum(
      payload.level,
      "info",
      ANNOUNCEMENT_LEVELS,
      "공지 수준",
    );
    const placement = parseEnum(
      payload.placement,
      "top_banner",
      ANNOUNCEMENT_PLACEMENTS,
      "노출 위치",
    );
    const targetRole = parseEnum(
      payload.targetRole,
      "all",
      ANNOUNCEMENT_TARGET_ROLES,
      "대상 역할",
    );
    const isActive = payload.isActive !== false;
    const startsAt = parseOptionalDate(payload.startsAt, "시작 일시");
    const endsAt = parseOptionalDate(payload.endsAt, "종료 일시");

    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        "종료 일시는 시작 일시보다 뒤여야 합니다.",
      );
    }

    await dbClient.execute({
      sql: `INSERT INTO admin_announcements (
              id, title, content, level, placement, "targetRole", "isActive",
              "startsAt", "endsAt", "createdBy", "createdAt"
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              content = EXCLUDED.content,
              level = EXCLUDED.level,
              placement = EXCLUDED.placement,
              "targetRole" = EXCLUDED."targetRole",
              "isActive" = EXCLUDED."isActive",
              "startsAt" = EXCLUDED."startsAt",
              "endsAt" = EXCLUDED."endsAt"`,
      args: [
        id,
        title,
        content,
        level,
        placement,
        targetRole,
        isActive,
        startsAt,
        endsAt,
        admin.id,
      ],
    });

    void logAuditAction(userId, "ANNOUNCEMENT_UPSERT", "announcement", id, {
      title,
      level,
      placement,
      targetRole,
      isActive,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
    });

    return {
      ok: true,
      id,
      title,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
    };
  }

  async toggleAnnouncement(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    if (!id) throw new BadRequestException("공지사항 ID가 필요합니다.");

    const result = await dbClient.execute({
      sql: `UPDATE admin_announcements
            SET "isActive" = NOT "isActive"
            WHERE id = ?
            RETURNING id, "isActive"`,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) throw new BadRequestException("공지사항을 찾을 수 없습니다.");

    void logAuditAction(
      userId,
      "ANNOUNCEMENT_TOGGLE",
      "announcement",
      id,
      { isActive: row.isActive },
    );
    return { ok: true, id, isActive: Boolean(row.isActive) };
  }

  async deleteAnnouncement(userId: string, id: string) {
    await requireAdminUser(userId);
    await ensureAdminSchema();
    if (!id) throw new BadRequestException("공지사항 ID가 필요합니다.");

    const result = await dbClient.execute({
      sql: `DELETE FROM admin_announcements WHERE id = ? RETURNING id`,
      args: [id],
    });
    if (!result.rows[0]) {
      throw new BadRequestException("공지사항을 찾을 수 없습니다.");
    }

    void logAuditAction(
      userId,
      "ANNOUNCEMENT_DELETE",
      "announcement",
      id,
      {},
    );
    return { ok: true, id };
  }
}
