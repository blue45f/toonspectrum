import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";

import {
  db,
  studioVirtualSpaceBookings,
  studioVirtualSpaceGalleryLikes,
  studioVirtualSpaceWaitlistEntries,
  users,
} from "../../platform/database";

/** 예약 한 건의 영속 형태. 시각은 클라이언트 순수 함수와 같은 epoch ms다. */
export interface StudioVirtualSpaceBookingRow {
  readonly id: string;
  readonly scopeKey: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly status: "confirmed" | "cancelled";
  readonly createdByUserId: string;
}

export interface StudioVirtualSpaceWaitlistRow {
  readonly id: string;
  readonly scopeKey: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly requestedAt: number;
  readonly createdByUserId: string;
}

export interface StudioVirtualSpaceGalleryLikeRow {
  readonly scopeKey: string;
  readonly frameId: string;
  readonly userId: string;
}

export interface StudioVirtualSpaceBookingRepository {
  findUserStatus(userId: string): Promise<string | null>;
  listBookings(scopeKey: string): Promise<readonly StudioVirtualSpaceBookingRow[]>;
  findBookingById(id: string): Promise<StudioVirtualSpaceBookingRow | null>;
  insertBooking(row: StudioVirtualSpaceBookingRow): Promise<void>;
  updateBookingStatus(id: string, status: "confirmed" | "cancelled"): Promise<void>;
  listWaitlist(scopeKey: string): Promise<readonly StudioVirtualSpaceWaitlistRow[]>;
  findWaitlistById(id: string): Promise<StudioVirtualSpaceWaitlistRow | null>;
  insertWaitlistEntry(row: StudioVirtualSpaceWaitlistRow): Promise<void>;
  deleteWaitlistEntry(id: string): Promise<void>;
  listGalleryLikes(scopeKey: string): Promise<readonly StudioVirtualSpaceGalleryLikeRow[]>;
  insertGalleryLike(row: StudioVirtualSpaceGalleryLikeRow): Promise<void>;
  deleteGalleryLike(scopeKey: string, frameId: string, userId: string): Promise<void>;
}

export const STUDIO_VIRTUAL_SPACE_BOOKING_REPOSITORY = Symbol(
  "STUDIO_VIRTUAL_SPACE_BOOKING_REPOSITORY",
);

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type BookingRecord = typeof studioVirtualSpaceBookings.$inferSelect;
type WaitlistRecord = typeof studioVirtualSpaceWaitlistEntries.$inferSelect;

function toBookingRow(record: BookingRecord): StudioVirtualSpaceBookingRow {
  return {
    id: record.id,
    scopeKey: record.scopeKey,
    spaceId: record.spaceId,
    spaceName: record.spaceName,
    capacity: record.capacity,
    equipmentTags: readStringArray(record.equipmentTags),
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    bookerNames: readStringArray(record.bookerNames),
    note: record.note,
    status: record.status === "cancelled" ? "cancelled" : "confirmed",
    createdByUserId: record.createdByUserId,
  };
}

function toWaitlistRow(record: WaitlistRecord): StudioVirtualSpaceWaitlistRow {
  return {
    id: record.id,
    scopeKey: record.scopeKey,
    spaceId: record.spaceId,
    spaceName: record.spaceName,
    capacity: record.capacity,
    equipmentTags: readStringArray(record.equipmentTags),
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    bookerNames: readStringArray(record.bookerNames),
    note: record.note,
    requestedAt: record.requestedAt,
    createdByUserId: record.createdByUserId,
  };
}

@Injectable()
export class DrizzleStudioVirtualSpaceBookingRepository
  implements StudioVirtualSpaceBookingRepository
{
  async findUserStatus(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.status ?? null;
  }

  async listBookings(scopeKey: string): Promise<readonly StudioVirtualSpaceBookingRow[]> {
    const rows = await db
      .select()
      .from(studioVirtualSpaceBookings)
      .where(eq(studioVirtualSpaceBookings.scopeKey, scopeKey))
      .orderBy(asc(studioVirtualSpaceBookings.startsAt));
    return rows.map(toBookingRow);
  }

  async findBookingById(id: string): Promise<StudioVirtualSpaceBookingRow | null> {
    const [row] = await db
      .select()
      .from(studioVirtualSpaceBookings)
      .where(eq(studioVirtualSpaceBookings.id, id))
      .limit(1);
    return row ? toBookingRow(row) : null;
  }

  async insertBooking(row: StudioVirtualSpaceBookingRow): Promise<void> {
    await db.insert(studioVirtualSpaceBookings).values({
      id: row.id,
      scopeKey: row.scopeKey,
      spaceId: row.spaceId,
      spaceName: row.spaceName,
      capacity: row.capacity,
      equipmentTags: [...row.equipmentTags],
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      bookerNames: [...row.bookerNames],
      note: row.note,
      status: row.status,
      createdByUserId: row.createdByUserId,
    });
  }

  async updateBookingStatus(id: string, status: "confirmed" | "cancelled"): Promise<void> {
    await db
      .update(studioVirtualSpaceBookings)
      .set({ status, updatedAt: new Date() })
      .where(eq(studioVirtualSpaceBookings.id, id));
  }

  async listWaitlist(scopeKey: string): Promise<readonly StudioVirtualSpaceWaitlistRow[]> {
    const rows = await db
      .select()
      .from(studioVirtualSpaceWaitlistEntries)
      .where(eq(studioVirtualSpaceWaitlistEntries.scopeKey, scopeKey))
      .orderBy(
        asc(studioVirtualSpaceWaitlistEntries.requestedAt),
        asc(studioVirtualSpaceWaitlistEntries.id),
      );
    return rows.map(toWaitlistRow);
  }

  async findWaitlistById(id: string): Promise<StudioVirtualSpaceWaitlistRow | null> {
    const [row] = await db
      .select()
      .from(studioVirtualSpaceWaitlistEntries)
      .where(eq(studioVirtualSpaceWaitlistEntries.id, id))
      .limit(1);
    return row ? toWaitlistRow(row) : null;
  }

  async insertWaitlistEntry(row: StudioVirtualSpaceWaitlistRow): Promise<void> {
    await db.insert(studioVirtualSpaceWaitlistEntries).values({
      id: row.id,
      scopeKey: row.scopeKey,
      spaceId: row.spaceId,
      spaceName: row.spaceName,
      capacity: row.capacity,
      equipmentTags: [...row.equipmentTags],
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      bookerNames: [...row.bookerNames],
      note: row.note,
      requestedAt: row.requestedAt,
      createdByUserId: row.createdByUserId,
    });
  }

  async deleteWaitlistEntry(id: string): Promise<void> {
    await db
      .delete(studioVirtualSpaceWaitlistEntries)
      .where(eq(studioVirtualSpaceWaitlistEntries.id, id));
  }

  async listGalleryLikes(
    scopeKey: string,
  ): Promise<readonly StudioVirtualSpaceGalleryLikeRow[]> {
    const rows = await db
      .select()
      .from(studioVirtualSpaceGalleryLikes)
      .where(eq(studioVirtualSpaceGalleryLikes.scopeKey, scopeKey));
    return rows.map((row) => ({
      scopeKey: row.scopeKey,
      frameId: row.frameId,
      userId: row.userId,
    }));
  }

  async insertGalleryLike(row: StudioVirtualSpaceGalleryLikeRow): Promise<void> {
    await db
      .insert(studioVirtualSpaceGalleryLikes)
      .values({ scopeKey: row.scopeKey, frameId: row.frameId, userId: row.userId })
      .onConflictDoNothing();
  }

  async deleteGalleryLike(scopeKey: string, frameId: string, userId: string): Promise<void> {
    await db
      .delete(studioVirtualSpaceGalleryLikes)
      .where(
        and(
          eq(studioVirtualSpaceGalleryLikes.scopeKey, scopeKey),
          eq(studioVirtualSpaceGalleryLikes.frameId, frameId),
          eq(studioVirtualSpaceGalleryLikes.userId, userId),
        ),
      );
  }
}

export function provideStudioVirtualSpaceBookingRepository() {
  return {
    provide: STUDIO_VIRTUAL_SPACE_BOOKING_REPOSITORY,
    useClass: DrizzleStudioVirtualSpaceBookingRepository,
  };
}
