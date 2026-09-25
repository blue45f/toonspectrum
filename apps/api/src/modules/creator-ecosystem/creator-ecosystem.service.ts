import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import {
  isBusinessVerificationStatus,
  isCollaborationProposalStatus,
  normalizeIsbn13,
  validateCollaborationPreference,
  validateCollaborationProposal,
  validateComicCollectionItem,
  validateCreatorBusinessProfile,
} from "../../../../../packages/core/src/creator-ecosystem";
import {
  creatorBusinessProfiles,
  creatorCollaborationPreferences,
  creatorCollectionItems,
  creatorIpProposals,
  db,
  users,
} from "../../db";
import { isOfficialUser } from "../../server/feedback";

import {
  LIBRARY_HOLDINGS_XML_BYTE_LIMIT,
  parseLibraryHoldingsXml,
} from "./library-holdings-xml";

import type {
  BusinessVerificationStatus,
  CollaborationCreatorDirectoryEntry,
  CollaborationProposalStatus,
} from "../../../../../packages/core/src/creator-ecosystem";

const PROPOSAL_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PROPOSALS_PER_TARGET_PER_DAY = 5;
const DATA4LIBRARY_SOURCE = "https://www.data4library.kr/";

function safeString(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maximum)
    : "";
}

function publicProposal(row: typeof creatorIpProposals.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CreatorEcosystemService {
  async listCollaborationCreators(): Promise<{ items: CollaborationCreatorDirectoryEntry[] }> {
    const rows = await db
      .select({
        userId: creatorCollaborationPreferences.userId,
        name: users.name,
        avatar: users.avatar,
        acceptedTypes: creatorCollaborationPreferences.acceptedTypes,
        acceptUnverified: creatorCollaborationPreferences.acceptUnverified,
        note: creatorCollaborationPreferences.note,
      })
      .from(creatorCollaborationPreferences)
      .innerJoin(users, eq(users.id, creatorCollaborationPreferences.userId))
      .where(and(
        eq(creatorCollaborationPreferences.discoverable, true),
        eq(users.status, "active"),
      ))
      .orderBy(desc(creatorCollaborationPreferences.updatedAt))
      .limit(100);
    return {
      items: rows
        .filter((row) => row.acceptedTypes.length > 0)
        .map((row) => ({
          userId: row.userId,
          name: row.name?.trim() || "ToonSpectrum Creator",
          avatar: row.avatar,
          acceptedTypes: row.acceptedTypes,
          acceptUnverified: row.acceptUnverified,
          note: row.note,
        })),
    };
  }

  async getMyCollaborationPreference(userId: string) {
    const uid = await this.requireUser(userId);
    const [row] = await db
      .select()
      .from(creatorCollaborationPreferences)
      .where(eq(creatorCollaborationPreferences.userId, uid))
      .limit(1);
    return {
      item: row ?? {
        userId: uid,
        discoverable: false,
        acceptedTypes: [],
        acceptUnverified: false,
        note: "",
      },
    };
  }

  async saveMyCollaborationPreference(userId: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const validated = validateCollaborationPreference(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const now = new Date();
    const [row] = await db
      .insert(creatorCollaborationPreferences)
      .values({
        userId: uid,
        ...validated.value,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: creatorCollaborationPreferences.userId,
        set: { ...validated.value, updatedAt: now },
      })
      .returning();
    return { item: row };
  }

  async getMyBusinessProfile(userId: string) {
    const uid = await this.requireUser(userId);
    const [row] = await db
      .select()
      .from(creatorBusinessProfiles)
      .where(eq(creatorBusinessProfiles.userId, uid))
      .limit(1);
    return { item: row ?? null };
  }

  async saveMyBusinessProfile(userId: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const validated = validateCreatorBusinessProfile(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const [existing] = await db
      .select()
      .from(creatorBusinessProfiles)
      .where(eq(creatorBusinessProfiles.userId, uid))
      .limit(1);
    const unchanged = Boolean(
      existing
      && existing.organization === validated.value.organization
      && existing.website === validated.value.website
      && existing.contactEmail === validated.value.contactEmail
      && existing.evidenceNote === validated.value.evidenceNote,
    );
    const verificationStatus: BusinessVerificationStatus = unchanged && existing
      ? existing.verificationStatus
      : "draft";
    const now = new Date();
    const [row] = await db
      .insert(creatorBusinessProfiles)
      .values({
        userId: uid,
        organization: validated.value.organization,
        website: validated.value.website,
        contactEmail: validated.value.contactEmail,
        evidenceNote: validated.value.evidenceNote,
        verificationStatus,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: creatorBusinessProfiles.userId,
        set: {
          organization: validated.value.organization,
          website: validated.value.website,
          contactEmail: validated.value.contactEmail,
          evidenceNote: validated.value.evidenceNote,
          verificationStatus,
          reviewNote: unchanged && existing ? existing.reviewNote : "",
          reviewedBy: unchanged && existing ? existing.reviewedBy : null,
          reviewedAt: unchanged && existing ? existing.reviewedAt : null,
          updatedAt: now,
        },
      })
      .returning();
    return { item: row };
  }

  async submitBusinessVerification(userId: string) {
    const uid = await this.requireUser(userId);
    const [profile] = await db
      .select()
      .from(creatorBusinessProfiles)
      .where(eq(creatorBusinessProfiles.userId, uid))
      .limit(1);
    if (!profile) throw new BadRequestException("먼저 기업 정보를 저장해 주세요.");
    if (profile.verificationStatus === "verified" || profile.verificationStatus === "pending") {
      return { item: profile };
    }
    const [updated] = await db
      .update(creatorBusinessProfiles)
      .set({
        verificationStatus: "pending",
        reviewNote: "",
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(creatorBusinessProfiles.userId, uid))
      .returning();
    return { item: updated ?? profile };
  }

  async createProposal(userId: string, input: unknown) {
    const senderId = await this.requireUser(userId);
    const validated = validateCollaborationProposal(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const value = validated.value;
    if (senderId === value.targetCreatorId) {
      throw new BadRequestException("자신에게 협업 제안을 보낼 수 없어요.");
    }

    const [[target], [preference], [business]] = await Promise.all([
      db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, value.targetCreatorId), eq(users.status, "active"))).limit(1),
      db.select().from(creatorCollaborationPreferences)
        .where(eq(creatorCollaborationPreferences.userId, value.targetCreatorId)).limit(1),
      db.select().from(creatorBusinessProfiles)
        .where(eq(creatorBusinessProfiles.userId, senderId)).limit(1),
    ]);
    if (!target) throw new NotFoundException("제안을 받을 작가를 찾을 수 없어요.");
    if (!preference || !preference.acceptedTypes.includes(value.type)) {
      throw new BadRequestException("이 작가는 현재 해당 유형의 제안을 받고 있지 않아요.");
    }
    if (!business) {
      throw new BadRequestException("제안을 보내기 전에 기업·단체 정보를 등록해 주세요.");
    }
    if (business.verificationStatus !== "verified" && !preference.acceptUnverified) {
      throw new ForbiddenException("이 작가는 인증된 기업·단체의 제안만 받고 있어요.");
    }

    const cutoff = new Date(Date.now() - PROPOSAL_RATE_WINDOW_MS);
    const recent = await db
      .select({ id: creatorIpProposals.id })
      .from(creatorIpProposals)
      .where(and(
        eq(creatorIpProposals.senderId, senderId),
        eq(creatorIpProposals.targetCreatorId, value.targetCreatorId),
        gte(creatorIpProposals.createdAt, cutoff),
      ))
      .limit(MAX_PROPOSALS_PER_TARGET_PER_DAY);
    if (recent.length >= MAX_PROPOSALS_PER_TARGET_PER_DAY) {
      throw new HttpException(
        "같은 작가에게 보낼 수 있는 하루 제안 수를 초과했어요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [row] = await db
      .insert(creatorIpProposals)
      .values({
        senderId,
        targetCreatorId: value.targetCreatorId,
        type: value.type,
        organization: business.organization,
        contactEmail: business.contactEmail,
        senderVerificationStatus: business.verificationStatus,
        title: value.title,
        summary: value.summary,
        budgetMinWon: value.budgetMinWon,
        budgetMaxWon: value.budgetMaxWon,
        currency: value.currency,
        territories: value.territories,
        exclusive: value.exclusive,
        durationMonths: value.durationMonths,
        projectUrl: value.projectUrl,
        rightsRequested: value.rightsRequested,
        status: "new",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return { item: row ? publicProposal(row) : null };
  }

  async listMyProposalInbox(userId: string) {
    const uid = await this.requireUser(userId);
    const rows = await db
      .select()
      .from(creatorIpProposals)
      .where(eq(creatorIpProposals.targetCreatorId, uid))
      .orderBy(desc(creatorIpProposals.createdAt))
      .limit(200);
    const ids = [...new Set(rows.map((row) => row.senderId))];
    const people = ids.length
      ? await db.select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users).where(inArray(users.id, ids))
      : [];
    const names = new Map(people.map((person) => [person.id, person]));
    return {
      items: rows.map((row) => ({
        ...publicProposal(row),
        sender: names.get(row.senderId) ?? null,
      })),
    };
  }

  async listMySentProposals(userId: string) {
    const uid = await this.requireUser(userId);
    const rows = await db
      .select()
      .from(creatorIpProposals)
      .where(eq(creatorIpProposals.senderId, uid))
      .orderBy(desc(creatorIpProposals.createdAt))
      .limit(200);
    const ids = [...new Set(rows.map((row) => row.targetCreatorId))];
    const people = ids.length
      ? await db.select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users).where(inArray(users.id, ids))
      : [];
    const names = new Map(people.map((person) => [person.id, person]));
    return {
      items: rows.map((row) => ({
        ...publicProposal(row),
        targetCreator: names.get(row.targetCreatorId) ?? null,
      })),
    };
  }

  async updateProposalStatus(userId: string, proposalIdValue: string, statusValue: unknown) {
    const uid = await this.requireUser(userId);
    const id = safeString(proposalIdValue, 100);
    if (!isCollaborationProposalStatus(statusValue)) {
      throw new BadRequestException("제안 상태를 확인해 주세요.");
    }
    const [proposal] = await db
      .select()
      .from(creatorIpProposals)
      .where(eq(creatorIpProposals.id, id))
      .limit(1);
    if (!proposal) throw new NotFoundException("협업 제안을 찾을 수 없어요.");
    const status = statusValue as CollaborationProposalStatus;
    if (uid === proposal.senderId) {
      if (status !== "withdrawn" || !["new", "reviewing"].includes(proposal.status)) {
        throw new ForbiddenException("보낸 제안은 검토 중일 때만 철회할 수 있어요.");
      }
    } else if (uid === proposal.targetCreatorId) {
      if (!["reviewing", "accepted", "declined"].includes(status)
          || !["new", "reviewing"].includes(proposal.status)) {
        throw new ForbiddenException("현재 상태에서는 해당 변경을 할 수 없어요.");
      }
    } else {
      throw new ForbiddenException("이 제안을 변경할 권한이 없어요.");
    }
    const [updated] = await db
      .update(creatorIpProposals)
      .set({ status, updatedAt: new Date() })
      .where(eq(creatorIpProposals.id, id))
      .returning();
    return { item: updated ? publicProposal(updated) : null };
  }

  async listMyCollection(userId: string) {
    const uid = await this.requireUser(userId);
    const rows = await db
      .select()
      .from(creatorCollectionItems)
      .where(eq(creatorCollectionItems.userId, uid))
      .orderBy(desc(creatorCollectionItems.updatedAt))
      .limit(1000);
    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async addCollectionItem(userId: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const validated = validateComicCollectionItem(input);
    if (!validated.ok) throw new BadRequestException(validated.error);
    const value = validated.value;
    if (value.isbn13) {
      const duplicate = await db
        .select({ id: creatorCollectionItems.id })
        .from(creatorCollectionItems)
        .where(and(
          eq(creatorCollectionItems.userId, uid),
          eq(creatorCollectionItems.isbn13, value.isbn13),
          eq(creatorCollectionItems.volumeLabel, value.volumeLabel),
        ))
        .limit(1);
      if (duplicate[0]) throw new BadRequestException("이미 같은 ISBN·권차를 서재에 저장했어요.");
    }
    const [row] = await db
      .insert(creatorCollectionItems)
      .values({ userId: uid, ...value, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return { item: row ?? null };
  }

  async updateCollectionItem(userId: string, itemIdValue: string, input: unknown) {
    const uid = await this.requireUser(userId);
    const id = safeString(itemIdValue, 100);
    const [existing] = await db
      .select()
      .from(creatorCollectionItems)
      .where(and(
        eq(creatorCollectionItems.id, id),
        eq(creatorCollectionItems.userId, uid),
      ))
      .limit(1);
    if (!existing) throw new NotFoundException("서재 항목을 찾을 수 없어요.");
    const body = input && typeof input === "object"
      ? input as Record<string, unknown>
      : {};
    const validated = validateComicCollectionItem({ ...existing, ...body });
    if (!validated.ok) throw new BadRequestException(validated.error);
    const [updated] = await db
      .update(creatorCollectionItems)
      .set({ ...validated.value, updatedAt: new Date() })
      .where(eq(creatorCollectionItems.id, id))
      .returning();
    return { item: updated ?? existing };
  }

  async removeCollectionItem(userId: string, itemIdValue: string) {
    const uid = await this.requireUser(userId);
    const id = safeString(itemIdValue, 100);
    const removed = await db
      .delete(creatorCollectionItems)
      .where(and(
        eq(creatorCollectionItems.id, id),
        eq(creatorCollectionItems.userId, uid),
      ))
      .returning({ id: creatorCollectionItems.id });
    if (!removed[0]) throw new NotFoundException("서재 항목을 찾을 수 없어요.");
    return { deleted: true };
  }

  async getLibraryHoldings(isbnValue: unknown, regionValue: unknown) {
    const isbn = normalizeIsbn13(isbnValue);
    if (!isbn) throw new BadRequestException("ISBN-13을 확인해 주세요.");
    const region = safeString(regionValue, 12);
    if (region && !/^\d{2,12}$/u.test(region)) {
      throw new BadRequestException("도서관 지역 코드를 확인해 주세요.");
    }
    const authKey = process.env.DATA4LIBRARY_AUTH_KEY?.trim() ?? "";
    if (!authKey) {
      return {
        status: "not_configured",
        items: [],
        sourceUrl: DATA4LIBRARY_SOURCE,
        message: "도서관 정보나루 API 인증키가 없어 공식 사이트 연결만 제공합니다.",
      };
    }
    const url = new URL("https://data4library.kr/api/libSrchByBook");
    url.searchParams.set("authKey", authKey);
    url.searchParams.set("isbn", isbn);
    if (region) url.searchParams.set("region", region);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/xml,text/xml" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return {
        status: "unavailable",
        items: [],
        sourceUrl: DATA4LIBRARY_SOURCE,
        message: "도서관 정보나루에 연결하지 못했어요. 공식 사이트에서 확인해 주세요.",
      };
    }
    if (!response.ok) {
      return {
        status: "unavailable",
        items: [],
        sourceUrl: DATA4LIBRARY_SOURCE,
        message: "도서관 정보나루 응답을 확인하지 못했어요.",
      };
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength)
      && declaredLength > LIBRARY_HOLDINGS_XML_BYTE_LIMIT) {
      return {
        status: "unavailable",
        items: [],
        sourceUrl: DATA4LIBRARY_SOURCE,
        message: "도서관 정보나루 응답 크기가 허용 범위를 초과했습니다.",
      };
    }
    let items: ReturnType<typeof parseLibraryHoldingsXml>;
    try {
      items = parseLibraryHoldingsXml(await response.text());
    } catch {
      return {
        status: "unavailable",
        items: [],
        sourceUrl: DATA4LIBRARY_SOURCE,
        message: "도서관 정보나루 응답 형식을 확인하지 못했어요.",
      };
    }
    return {
      status: "ready",
      items,
      sourceUrl: DATA4LIBRARY_SOURCE,
      fetchedAt: new Date().toISOString(),
      message: "소장 정보는 제공기관 수집 시점 기준입니다. 실제 대출 가능 여부는 해당 도서관에서 확인해 주세요.",
    };
  }

  async listBusinessVerificationQueue(userId: string, statusValue: unknown) {
    await this.requireOperator(userId);
    const raw = safeString(statusValue, 20);
    if (raw && !isBusinessVerificationStatus(raw)) {
      throw new BadRequestException("기업 인증 상태를 확인해 주세요.");
    }
    const where = raw
      ? eq(creatorBusinessProfiles.verificationStatus, raw as BusinessVerificationStatus)
      : undefined;
    const rows = await db
      .select({
        profile: creatorBusinessProfiles,
        userName: users.name,
        userEmail: users.email,
      })
      .from(creatorBusinessProfiles)
      .innerJoin(users, eq(users.id, creatorBusinessProfiles.userId))
      .where(where)
      .orderBy(desc(creatorBusinessProfiles.updatedAt))
      .limit(300);
    return { items: rows };
  }

  async reviewBusinessVerification(
    userId: string,
    targetUserIdValue: string,
    input: unknown,
  ) {
    const operatorId = await this.requireOperator(userId);
    const targetUserId = safeString(targetUserIdValue, 200);
    const body = input && typeof input === "object"
      ? input as Record<string, unknown>
      : {};
    const status = body.status;
    if (status !== "verified" && status !== "rejected") {
      throw new BadRequestException("기업 인증 결과를 확인해 주세요.");
    }
    const [updated] = await db
      .update(creatorBusinessProfiles)
      .set({
        verificationStatus: status,
        reviewNote: safeString(body.reviewNote, 1000),
        reviewedBy: operatorId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorBusinessProfiles.userId, targetUserId))
      .returning();
    if (!updated) throw new NotFoundException("기업 프로필을 찾을 수 없어요.");
    return { item: updated };
  }

  private async requireUser(userId: string): Promise<string> {
    const uid = safeString(userId, 200);
    if (!uid) throw new ForbiddenException("로그인이 필요해요.");
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, uid), eq(users.status, "active")))
      .limit(1);
    if (!row) throw new ForbiddenException("유효한 로그인 세션이 필요해요.");
    return uid;
  }

  private async requireOperator(userId: string): Promise<string> {
    const uid = safeString(userId, 200);
    if (!uid || !(await isOfficialUser(uid))) {
      throw new ForbiddenException("운영자 권한이 필요해요.");
    }
    return uid;
  }
}
