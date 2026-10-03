-- F-4: 가상 스튜디오 스페이스 예약·대기열·갤러리 좋아요 서버 정본화.
-- 지금까지 예약과 좋아요는 StudioVirtualSpacePage의 useState에만 있어 새로고침하면
-- 사라졌고 같은 월드의 다른 사용자와 공유되지 않았다. scopeKey는 (projectId,
-- worldScope)로 만든 불투명 범위 키이며 장식 배치의 개인 scopeKey와 달리
-- authoringMode를 포함하지 않는다 — 같은 월드의 예약은 모드와 무관하게 하나다.
-- 시각은 클라이언트 순수 함수와 같은 epoch ms로 저장하고 KST 표기는 클라이언트
-- 책임으로 둔다. 재실행 안전(IF NOT EXISTS)하게 작성한다.

BEGIN;

CREATE TABLE IF NOT EXISTS "studio_virtual_space_booking" (
  "id" text NOT NULL,
  "scopeKey" text NOT NULL,
  "spaceId" text NOT NULL,
  "spaceName" text NOT NULL,
  "capacity" integer NOT NULL,
  "equipmentTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "startsAt" bigint NOT NULL,
  "endsAt" bigint NOT NULL,
  "bookerNames" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'confirmed',
  "createdByUserId" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_virtual_space_booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_virtual_space_booking_user_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_virtual_space_booking_status_check"
    CHECK ("status" IN ('confirmed', 'cancelled')),
  CONSTRAINT "studio_virtual_space_booking_range_check"
    CHECK ("endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS "studio_virtual_space_booking_scope_space_start_idx"
  ON "studio_virtual_space_booking" ("scopeKey", "spaceId", "startsAt");

CREATE TABLE IF NOT EXISTS "studio_virtual_space_waitlist_entry" (
  "id" text NOT NULL,
  "scopeKey" text NOT NULL,
  "spaceId" text NOT NULL,
  "spaceName" text NOT NULL,
  "capacity" integer NOT NULL,
  "equipmentTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "startsAt" bigint NOT NULL,
  "endsAt" bigint NOT NULL,
  "bookerNames" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "note" text NOT NULL DEFAULT '',
  "requestedAt" bigint NOT NULL,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_virtual_space_waitlist_entry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_virtual_space_waitlist_entry_user_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_virtual_space_waitlist_range_check"
    CHECK ("endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS "studio_virtual_space_waitlist_scope_space_requested_idx"
  ON "studio_virtual_space_waitlist_entry" ("scopeKey", "spaceId", "requestedAt");

CREATE TABLE IF NOT EXISTS "studio_virtual_space_gallery_like" (
  "scopeKey" text NOT NULL,
  "frameId" text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_virtual_space_gallery_like_pkey"
    PRIMARY KEY ("scopeKey", "frameId", "userId"),
  CONSTRAINT "studio_virtual_space_gallery_like_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

COMMIT;
