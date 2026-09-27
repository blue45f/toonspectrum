-- Migration 0037: finish 3D asset parity across marketplace ownership and trust relations.
--
-- Migration 0035 admitted `3d-asset` releases into the public catalog, but the account library and
-- immutable report-evidence constraints still accepted only the original six kinds. That split
-- allowed a 3D asset detail page to exist while acquisition and reporting failed at PostgreSQL.
-- These replacements only relax kind membership; all existing identity, version, license and
-- evidence invariants remain byte-for-byte equivalent.

ALTER TABLE public."creator_marketplace_library_item"
  ADD CONSTRAINT "creator_marketplace_library_kind_check_v2"
  CHECK ("kind" IN (
    'asset',
    'brush',
    'filter',
    'palette',
    'template',
    '3d-preset',
    '3d-asset'
  )) NOT VALID;

ALTER TABLE public."creator_marketplace_library_item"
  VALIDATE CONSTRAINT "creator_marketplace_library_kind_check_v2";

ALTER TABLE public."creator_marketplace_library_item"
  DROP CONSTRAINT "creator_marketplace_library_kind_check";

ALTER TABLE public."creator_marketplace_library_item"
  RENAME CONSTRAINT "creator_marketplace_library_kind_check_v2"
  TO "creator_marketplace_library_kind_check";

ALTER TABLE public."creator_marketplace_resource_report"
  ADD CONSTRAINT "creator_marketplace_resource_report_evidence_check_v2"
  CHECK ((
    jsonb_typeof("evidence") = 'object'
    AND "evidence"->>'resourceId' = "resourceSnapshotId"
    AND ("resourceId" IS NULL OR "evidence"->>'resourceId' = "resourceId")
    AND "evidence"->>'manifestHash' ~ '^[0-9a-f]{64}$'
    AND ("evidence"->>'manifestByteSize')::integer BETWEEN 1 AND 65536
    AND "evidence"->>'kind' IN (
      'asset',
      'brush',
      'filter',
      'palette',
      'template',
      '3d-preset',
      '3d-asset'
    )
    AND "evidence"->>'license' IN (
      'toonspectrum-standard',
      'cc0-1.0',
      'cc-by-4.0',
      'cc-by-nc-4.0'
    )
    AND (
      (
        "evidence"->>'schemaVersion' = '1'
        AND "packageReportEpoch" IS NULL
      )
      OR (
        "evidence"->>'schemaVersion' = '2'
        AND "packagePublisherIdSnapshot" IS NOT NULL
        AND "packageIdSnapshot" IS NOT NULL
        AND "packageModerationRevision" IS NOT NULL
        AND "packageReportEpoch" IS NULL
        AND "evidence"->>'publisherId' = "packagePublisherIdSnapshot"
        AND "evidence"->>'packageId' = "packageIdSnapshot"
        AND ("evidence"->>'packageModerationRevision')::integer = "packageModerationRevision"
      )
      OR (
        "evidence"->>'schemaVersion' = '3'
        AND "packagePublisherIdSnapshot" IS NOT NULL
        AND "packageIdSnapshot" IS NOT NULL
        AND "packageModerationRevision" IS NOT NULL
        AND "packageReportEpoch" IS NOT NULL
        AND "evidence"->>'publisherId' = "packagePublisherIdSnapshot"
        AND "evidence"->>'packageId' = "packageIdSnapshot"
        AND ("evidence"->>'packageModerationRevision')::integer = "packageModerationRevision"
        AND ("evidence"->>'packageReportEpoch')::integer = "packageReportEpoch"
      )
    )
  ) IS TRUE) NOT VALID;

ALTER TABLE public."creator_marketplace_resource_report"
  VALIDATE CONSTRAINT "creator_marketplace_resource_report_evidence_check_v2";

ALTER TABLE public."creator_marketplace_resource_report"
  DROP CONSTRAINT "creator_marketplace_resource_report_evidence_check";

ALTER TABLE public."creator_marketplace_resource_report"
  RENAME CONSTRAINT "creator_marketplace_resource_report_evidence_check_v2"
  TO "creator_marketplace_resource_report_evidence_check";
