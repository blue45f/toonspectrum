BEGIN;
-- Preserve v1 data while allowing the canonical v2 writer. Do not rewrite applied 0053.
ALTER TABLE production_project DROP CONSTRAINT IF EXISTS production_project_model_version_check;
ALTER TABLE production_project ADD CONSTRAINT production_project_model_version_check
  CHECK ("modelVersion" IN (1, 2));

COMMIT;
