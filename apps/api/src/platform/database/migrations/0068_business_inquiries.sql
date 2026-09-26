-- Private business, IR and sponsorship inquiry intake.
-- Stores only reply/contact fields submitted by the sender; no IP or browser fingerprint is persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_inquiry (
  id text PRIMARY KEY,
  type text NOT NULL,
  organization text NOT NULL DEFAULT '',
  "contactName" text NOT NULL,
  email text NOT NULL,
  website text NOT NULL DEFAULT '',
  message text NOT NULL,
  "sourcePath" text NOT NULL DEFAULT '',
  "consentVersion" text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_inquiry_type_check CHECK (
    type IN ('investment', 'partnership', 'content_ip', 'sponsorship', 'ir_material', 'meeting')
  ),
  CONSTRAINT business_inquiry_status_check CHECK (
    status IN ('new', 'reviewing', 'meeting_scheduled', 'negotiating', 'completed', 'on_hold')
  ),
  CONSTRAINT business_inquiry_contact_name_length CHECK (
    char_length("contactName") BETWEEN 2 AND 80
  ),
  CONSTRAINT business_inquiry_email_length CHECK (
    char_length(email) BETWEEN 3 AND 254
  ),
  CONSTRAINT business_inquiry_organization_length CHECK (
    char_length(organization) <= 120
  ),
  CONSTRAINT business_inquiry_website_length CHECK (
    char_length(website) <= 300
  ),
  CONSTRAINT business_inquiry_message_length CHECK (
    char_length(message) BETWEEN 10 AND 5000
  ),
  CONSTRAINT business_inquiry_source_path_length CHECK (
    char_length("sourcePath") <= 500
  ),
  CONSTRAINT business_inquiry_fingerprint_length CHECK (
    char_length(fingerprint) = 64
  )
);

CREATE INDEX IF NOT EXISTS idx_business_inquiry_status_created
  ON public.business_inquiry (status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_business_inquiry_fingerprint_created
  ON public.business_inquiry (fingerprint, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_business_inquiry_email_created
  ON public.business_inquiry (email, "createdAt" DESC);

REVOKE ALL ON TABLE public.business_inquiry FROM PUBLIC;

COMMENT ON TABLE public.business_inquiry IS
  'Private business/IR/sponsorship inquiries. fingerprint is a one-way duplicate-detection hash, not a browser or device fingerprint.';

COMMIT;
