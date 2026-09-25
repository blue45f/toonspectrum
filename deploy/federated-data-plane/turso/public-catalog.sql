PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS public_catalog_document (
  shard_key TEXT NOT NULL,
  document_key TEXT NOT NULL,
  document_type TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version >= 0),
  slug TEXT,
  title TEXT NOT NULL,
  search_text TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_updated_at TEXT NOT NULL,
  projected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shard_key, document_key)
) WITHOUT ROWID;

CREATE UNIQUE INDEX IF NOT EXISTS public_catalog_slug_uq
  ON public_catalog_document (document_type, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS public_catalog_type_update_idx
  ON public_catalog_document (document_type, source_updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS public_catalog_fts USING fts5(
  document_key UNINDEXED,
  title,
  search_text,
  tokenize = 'unicode61 remove_diacritics 2'
);
