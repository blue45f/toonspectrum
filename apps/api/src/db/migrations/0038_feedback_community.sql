-- Additive feedback community migration. Only the managed migration role runs this file.
-- Keep historical post IDs, answers and authors; an answer is not a completed improvement.
SELECT pg_advisory_xact_lock(82361742);
CREATE TABLE IF NOT EXISTS public.feedback_post (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'question', title text NOT NULL, text text NOT NULL,
  status text NOT NULL DEFAULT 'open', "answeredAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_post
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progress text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_feedback_post_progress_created
  ON public.feedback_post(progress, "createdAt", id);
CREATE INDEX IF NOT EXISTS idx_feedback_post_user_created
  ON public.feedback_post("userId", "createdAt", id);
CREATE TABLE IF NOT EXISTS public.feedback_reply (
  id text PRIMARY KEY,
  "postId" text NOT NULL REFERENCES public.feedback_post(id) ON DELETE CASCADE,
  "parentId" text,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  text text NOT NULL, "isOfficial" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_reply_post
  ON public.feedback_reply("postId", "createdAt");
CREATE TABLE IF NOT EXISTS public.feedback_vote (
  "postId" text NOT NULL REFERENCES public.feedback_post(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("postId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_feedback_vote_user ON public.feedback_vote("userId");
REVOKE ALL ON TABLE public.feedback_vote FROM PUBLIC;
