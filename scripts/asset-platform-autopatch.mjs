import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`expected patch source not found in ${path}: ${before.slice(0, 80)}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`patch source is not unique in ${path}: ${before.slice(0, 80)}`);
  }
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const migrationTest = "scripts/run-production-database-migrations.test.mjs";
replaceOnce(
  migrationTest,
  "expect(manifest).toHaveLength(38);",
  "expect(manifest).toHaveLength(39);",
);
replaceOnce(
  migrationTest,
  '    "0038_feedback_community",\n  );\n  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(38);',
  '    "0039_creator_asset_platform_foundation",\n  );\n  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(39);',
);

const publishPage = "apps/web/src/domains/market/pages/MarketPublishPage.tsx";
replaceOnce(
  publishPage,
  "  const [publishedRecord, setPublishedRecord] =\n    useState<CreatorMarketplaceResourceRecord | null>(null);",
  "  const [publishedRecord, setPublishedRecord] =\n    useState<CreatorMarketplaceResourceRecord | null>(null);\n  const [publishError, setPublishError] = useState<string | null>(null);",
);

replaceOnce(
  publishPage,
  `    setSubmitting(true);
    const newId = \`pub-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;
    const finalRecord: CreatorMarketplaceResourceRecord = {
      ...livePreviewRecord,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // 1. Try backend publish API
      await publishCreatorMarketplaceResource({
        schemaVersion: 1,
        packageId: finalRecord.packageId,
        name: finalRecord.name,
        description: finalRecord.description,
        releaseNotes,
        kind: finalRecord.kind,
        resourceVersion: finalRecord.resourceVersion,
        minimumStudioVersion: finalRecord.minimumStudioVersion,
        tags: finalRecord.tags,
        license: finalRecord.license,
        attributionText: finalRecord.attributionText,
        containsAi: finalRecord.containsAi,
        rightsConfirmed: true,
        provenance: finalRecord.provenance,
        compatibility: finalRecord.compatibility,
        entries: finalRecord.entries,
      });
    } catch {
      // safe fallback to client registry
    }

    // 2. Always persist into local custom registry for instant visibility
    saveCustomPublishedResource(finalRecord);
    setSubmitting(false);
    setPublishedRecord(finalRecord);`,
  `    setSubmitting(true);
    setPublishError(null);
    try {
      const published = await publishCreatorMarketplaceResource({
        schemaVersion: 1,
        packageId: livePreviewRecord.packageId,
        name: livePreviewRecord.name,
        description: livePreviewRecord.description,
        releaseNotes,
        kind: livePreviewRecord.kind,
        resourceVersion: livePreviewRecord.resourceVersion,
        minimumStudioVersion: livePreviewRecord.minimumStudioVersion,
        tags: livePreviewRecord.tags,
        license: livePreviewRecord.license,
        attributionText: livePreviewRecord.attributionText,
        containsAi: livePreviewRecord.containsAi,
        rightsConfirmed: true,
        provenance: livePreviewRecord.provenance,
        compatibility: livePreviewRecord.compatibility,
        entries: livePreviewRecord.entries,
      });
      saveCustomPublishedResource(published);
      setPublishedRecord(published);
    } catch {
      setPublishError(
        "서버 게시가 완료되지 않았습니다. 입력 내용은 유지되며, 연결 상태를 확인한 뒤 다시 시도할 수 있습니다.",
      );
    } finally {
      setSubmitting(false);
    }`,
);

replaceOnce(
  publishPage,
  `                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                    <button`,
  `                  {publishError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs leading-relaxed text-danger"
                    >
                      {publishError}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                    <button`,
);

const drizzleSchema = "apps/api/src/db/creator-asset-platform.schema.ts";
replaceOnce(
  drizzleSchema,
  `    check(
      "creator_asset_upload_session_verified_check",
      sql\`\${table.state} not in ('verified', 'promoted') or (
        \${table.verifiedDigest} is not null
        and \${table.actualByteLength} is not null
        and \${table.detectedContentType} is not null
        and \${table.finalizedAt} is not null
      )\`,
    ),`,
  `    check(
      "creator_asset_upload_session_verified_check",
      sql\`\${table.state} not in ('verified', 'promoted') or (
        \${table.verifiedDigest} is not null
        and \${table.actualByteLength} is not null
        and \${table.detectedContentType} is not null
        and \${table.finalizedAt} is not null
      )\`,
    ),
    check(
      "creator_asset_upload_session_timestamp_check",
      sql\`\${table.updatedAt} >= \${table.createdAt}
        and \${table.expiresAt} > \${table.createdAt}\`,
    ),`,
);
replaceOnce(
  drizzleSchema,
  `    check(
      "creator_asset_artifact_metrics_check",
      sql\`\${table.metrics} is null or jsonb_typeof(\${table.metrics}) = 'object'\`,
    ),`,
  `    check(
      "creator_asset_artifact_metrics_check",
      sql\`\${table.metrics} is null or jsonb_typeof(\${table.metrics}) = 'object'\`,
    ),
    check(
      "creator_asset_artifact_source_role_check",
      sql\`\${table.role} <> 'source-original' or \${table.purpose} = 'source'\`,
    ),`,
);
replaceOnce(
  drizzleSchema,
  `    check(
      "creator_marketplace_release_availability_revision_check",
      sql\`\${table.revision} between 1 and 2147483647\`,
    ),`,
  `    check(
      "creator_marketplace_release_availability_revision_check",
      sql\`\${table.revision} between 1 and 2147483647\`,
    ),
    check(
      "creator_marketplace_release_availability_reason_check",
      sql\`(\${table.state} = 'active' and \${table.reasonCode} is null)
        or (\${table.state} <> 'active' and length(\${table.reasonCode}) between 1 and 120)\`,
    ),`,
);

const migration = "apps/api/src/db/migrations/0039_creator_asset_platform_foundation.sql";
replaceOnce(
  migration,
  '  "quarantinePath" text NOT NULL UNIQUE,',
  '  "quarantinePath" text NOT NULL,',
);
replaceOnce(
  migration,
  '  CONSTRAINT "creator_asset_upload_session_protocol_check"',
  '  CONSTRAINT "creator_asset_upload_session_path_unique" UNIQUE ("quarantinePath"),\n  CONSTRAINT "creator_asset_upload_session_protocol_check"',
);
replaceOnce(
  migration,
  '  "idempotencyKey" text NOT NULL UNIQUE,',
  '  "idempotencyKey" text NOT NULL,',
);
replaceOnce(
  migration,
  '  CONSTRAINT "creator_asset_processing_run_digest_check"',
  '  CONSTRAINT "creator_asset_processing_run_idempotency_unique" UNIQUE ("idempotencyKey"),\n  CONSTRAINT "creator_asset_processing_run_digest_check"',
);
replaceOnce(
  migration,
  '  "processingRunId" text NOT NULL UNIQUE\n    REFERENCES',
  '  "processingRunId" text NOT NULL\n    REFERENCES',
);
replaceOnce(
  migration,
  '  "descriptorHash" text NOT NULL UNIQUE,',
  '  "descriptorHash" text NOT NULL,',
);
replaceOnce(
  migration,
  '  CONSTRAINT "creator_asset_artifact_set_kind_check"',
  '  CONSTRAINT "creator_asset_artifact_set_run_unique" UNIQUE ("processingRunId"),\n  CONSTRAINT "creator_asset_artifact_set_kind_check"',
);
replaceOnce(
  migration,
  'CREATE INDEX "idx_creator_asset_artifact_set_source"',
  'CREATE UNIQUE INDEX "creator_asset_artifact_set_descriptor_hash_unique"\n  ON public."creator_asset_artifact_set" ("descriptorHash");\nCREATE INDEX "idx_creator_asset_artifact_set_source"',
);
replaceOnce(
  migration,
  '  "bindingHash" text NOT NULL UNIQUE,',
  '  "bindingHash" text NOT NULL,',
);
replaceOnce(
  migration,
  'CREATE TABLE public."creator_marketplace_release_availability"',
  'CREATE UNIQUE INDEX "creator_marketplace_release_artifact_binding_hash_unique"\n  ON public."creator_marketplace_release_artifact_binding" ("bindingHash");\n\nCREATE TABLE public."creator_marketplace_release_availability"',
);
replaceOnce(
  migration,
  '  "sourceEventId" text NOT NULL UNIQUE,',
  '  "sourceEventId" text NOT NULL,',
);
replaceOnce(
  migration,
  '  CONSTRAINT "creator_marketplace_entitlement_subject_check"',
  '  CONSTRAINT "creator_marketplace_entitlement_source_event_unique" UNIQUE ("sourceEventId"),\n  CONSTRAINT "creator_marketplace_entitlement_subject_check"',
);
replaceOnce(
  migration,
  '  "useReceiptId" text NOT NULL UNIQUE,',
  '  "useReceiptId" text NOT NULL,',
);
replaceOnce(
  migration,
  '  CONSTRAINT "creator_work_catalog_asset_binding_pkey" PRIMARY KEY ("workId", "attachmentId"),',
  '  CONSTRAINT "creator_work_catalog_asset_binding_pkey" PRIMARY KEY ("workId", "attachmentId"),\n  CONSTRAINT "creator_work_catalog_asset_binding_receipt_unique" UNIQUE ("useReceiptId"),',
);

console.log("asset platform integration patch applied");
