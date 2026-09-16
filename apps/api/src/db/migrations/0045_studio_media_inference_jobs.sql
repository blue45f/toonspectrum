-- Apply once with the normal database migration runner before enabling STUDIO_COMFYUI_URL.
-- No existing artist documents, billing rows or provider configuration are changed.
CREATE TABLE IF NOT EXISTS studio_media_inference_jobs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image-to-video', 'image-to-3d', 'render-to-2d')),
  state text NOT NULL DEFAULT 'submitting',
  provider_id text,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS studio_media_inference_owner_recent
  ON studio_media_inference_jobs(owner_id, created_at DESC);
