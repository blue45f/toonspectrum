-- CT-1: 제작 허브 원고 버전 스냅샷과 버전 공유 링크를 서버 정본으로 올린다.
-- 스냅샷은 revision 참조(내용 복사본 아님)이며, 공유 링크의 원문 토큰은 저장하지 않고
-- sha256 해시와 표시용 접미사만 보관한다(creator 리뷰 링크·pinned share와 같은 규약).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.studio_manuscript_snapshot (
  id text PRIMARY KEY,
  "artifactId" text NOT NULL REFERENCES public.studio_artifact(id) ON DELETE CASCADE,
  name text NOT NULL,
  memo text NOT NULL DEFAULT '',
  "revisionId" text NOT NULL REFERENCES public.studio_revision(id) ON DELETE CASCADE,
  "rootGraphHash" text NOT NULL,
  "revisionKind" text NOT NULL,
  "revisionMessage" text,
  "createdBy" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL,
  CONSTRAINT studio_manuscript_snapshot_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT studio_manuscript_snapshot_memo_check CHECK (length(memo) <= 500),
  CONSTRAINT studio_manuscript_snapshot_hash_check CHECK ("rootGraphHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_studio_manuscript_snapshot_artifact
  ON public.studio_manuscript_snapshot ("artifactId", "createdAt", id);
CREATE TABLE IF NOT EXISTS public.studio_manuscript_version_share (
  id text PRIMARY KEY,
  "snapshotId" text NOT NULL REFERENCES public.studio_manuscript_snapshot(id) ON DELETE CASCADE,
  "artifactId" text NOT NULL REFERENCES public.studio_artifact(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  "tokenSuffix" text NOT NULL,
  permission text NOT NULL,
  watermark boolean NOT NULL DEFAULT false,
  "passwordHash" text,
  "createdBy" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  CONSTRAINT studio_manuscript_version_share_token_hash_check CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT studio_manuscript_version_share_suffix_check CHECK (length("tokenSuffix") BETWEEN 1 AND 8),
  CONSTRAINT studio_manuscript_version_share_permission_check CHECK (permission IN ('view', 'comment', 'edit')),
  CONSTRAINT studio_manuscript_version_share_time_check CHECK (
    ("expiresAt" IS NULL OR "expiresAt" > "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  )
);
CREATE INDEX IF NOT EXISTS idx_studio_manuscript_version_share_artifact
  ON public.studio_manuscript_version_share ("artifactId", "createdAt" DESC, id);
CREATE INDEX IF NOT EXISTS idx_studio_manuscript_version_share_snapshot
  ON public.studio_manuscript_version_share ("snapshotId", "createdAt" DESC, id);
COMMIT;
