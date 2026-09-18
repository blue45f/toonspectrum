-- Creator support program applications and non-monetary support offers.
-- Monetary creator payouts remain fail-closed until a separately contracted payout/KYC flow is ready.

BEGIN;

CREATE TABLE IF NOT EXISTS public.creator_support_application (
  id text PRIMARY KEY,
  "creatorId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  category text NOT NULL,
  "ageBand" text NOT NULL,
  "applicantRole" text NOT NULL,
  title text NOT NULL,
  story text NOT NULL,
  "intendedUse" text NOT NULL,
  "supportNeeds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "portfolioUrl" text NOT NULL DEFAULT '',
  "estimatedBudgetWon" integer NOT NULL DEFAULT 0,
  "guardianConfirmed" boolean NOT NULL DEFAULT false,
  "consentVersion" text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  "reviewNote" text NOT NULL DEFAULT '',
  "reviewedBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "monetarySupportEnabled" boolean NOT NULL DEFAULT false,
  "payoutStatus" text NOT NULL DEFAULT 'not_ready',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_support_category_check CHECK (
    category IN ('student', 'amateur', 'emerging')
  ),
  CONSTRAINT creator_support_age_band_check CHECK (
    "ageBand" IN ('adult', 'youth_14_18', 'under14_guardian')
  ),
  CONSTRAINT creator_support_applicant_role_check CHECK (
    "applicantRole" IN ('self', 'guardian')
  ),
  CONSTRAINT creator_support_status_check CHECK (
    status IN ('submitted', 'reviewing', 'approved', 'rejected', 'on_hold')
  ),
  CONSTRAINT creator_support_payout_status_check CHECK (
    "payoutStatus" IN ('not_ready', 'contract_required', 'kyc_required', 'ready', 'blocked')
  ),
  CONSTRAINT creator_support_title_length CHECK (char_length(title) BETWEEN 3 AND 120),
  CONSTRAINT creator_support_story_length CHECK (char_length(story) BETWEEN 20 AND 3000),
  CONSTRAINT creator_support_use_length CHECK (char_length("intendedUse") BETWEEN 10 AND 2000),
  CONSTRAINT creator_support_portfolio_length CHECK (char_length("portfolioUrl") <= 500),
  CONSTRAINT creator_support_budget_check CHECK ("estimatedBudgetWon" BETWEEN 0 AND 100000000),
  CONSTRAINT creator_support_guardian_check CHECK (
    ("ageBand" = 'adult')
    OR ("guardianConfirmed" = true)
  ),
  CONSTRAINT creator_support_under14_guardian_check CHECK (
    ("ageBand" <> 'under14_guardian')
    OR ("applicantRole" = 'guardian' AND "guardianConfirmed" = true)
  )
);
CREATE INDEX IF NOT EXISTS idx_creator_support_creator_created
  ON public.creator_support_application ("creatorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_creator_support_status_created
  ON public.creator_support_application (status, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.creator_support_offer (
  id text PRIMARY KEY,
  "applicationId" text NOT NULL REFERENCES public.creator_support_application(id) ON DELETE CASCADE,
  "supporterId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  "contactEmail" text NOT NULL,
  "consentVersion" text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_support_offer_type_check CHECK (
    type IN (
      'mentorship', 'equipment', 'software_license', 'portfolio_feedback',
      'collaboration', 'opportunity', 'sponsorship'
    )
  ),
  CONSTRAINT creator_support_offer_status_check CHECK (
    status IN ('new', 'shared', 'closed')
  ),
  CONSTRAINT creator_support_offer_message_length CHECK (char_length(message) BETWEEN 10 AND 2000),
  CONSTRAINT creator_support_offer_email_length CHECK (char_length("contactEmail") BETWEEN 3 AND 254)
);
CREATE INDEX IF NOT EXISTS idx_creator_support_offer_application_created
  ON public.creator_support_offer ("applicationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_creator_support_offer_supporter_created
  ON public.creator_support_offer ("supporterId", "createdAt" DESC);

REVOKE ALL ON TABLE public.creator_support_application FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_support_offer FROM PUBLIC;

COMMENT ON TABLE public.creator_support_application IS
  'Reviewed creator support-program applications. Under-14 applicants must be guardian-managed; monetary support stays disabled unless payout/KYC readiness is explicitly verified.';
COMMENT ON TABLE public.creator_support_offer IS
  'Private non-monetary support offers routed to reviewed creator support projects.';

COMMIT;
