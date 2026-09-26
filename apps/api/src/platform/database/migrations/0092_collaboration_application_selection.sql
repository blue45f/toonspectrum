-- Add a terminal selected state so accepted applicants can move into team onboarding.
ALTER TABLE "creator_collab_application"
  DROP CONSTRAINT IF EXISTS "creator_collab_application_status_check";

ALTER TABLE "creator_collab_application"
  ADD CONSTRAINT "creator_collab_application_status_check"
  CHECK ("status" IN ('submitted','shortlisted','selected','declined','withdrawn')) NOT VALID;

ALTER TABLE "creator_collab_application"
  VALIDATE CONSTRAINT "creator_collab_application_status_check";
