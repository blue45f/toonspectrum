from __future__ import annotations

from pathlib import Path


def replace_normalized(
    path: Path,
    legacy: str,
    normalized: str,
    label: str,
) -> None:
    source = path.read_text(encoding="utf-8")
    legacy_count = source.count(legacy)
    if legacy_count == 1:
        path.write_text(source.replace(legacy, normalized, 1), encoding="utf-8")
        return
    if legacy_count != 0 or normalized not in source:
        raise RuntimeError(f"{path}: expected one legacy or normalized {label}")


path = Path("scripts/maintenance/apply-brush-runtime-production.py")
source = path.read_text(encoding="utf-8")

simple_replacements = (
    (
        'route_anchor = "\\nexport function auditStudioRouteRegistry(): StudioRouteRegistryAudit {"',
        'route_anchor = "\\nexport function auditStudioRouteRegistry(): readonly string[] {"',
    ),
    (
        'replace_once("apps/web/src/domains/creator/studio-shell/StudioExternalEntryRoutes.tsx", \'<Container size="narrow">\', \'<Container size="prose">\')',
        'replace_once("apps/web/src/domains/creator/studio-shell/StudioExternalEntryRoutes.tsx", \'<Container size="narrow"\', \'<Container size="prose"\')',
    ),
)
for old, new in simple_replacements:
    if old in source:
        source = source.replace(old, new, 1)
    elif new not in source:
        raise RuntimeError(f"repair guard missing: {old[:100]}")

start_marker = '''replace_once(
    project_delivery,
    "onChange={(event) => setConnectorId(event.target.value)}",'''
end_marker = '''
replace_once(
    "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx",'''
corrected_marker = '''setConnectorId(connector.id);
                    setExternalWriteConfirmed(false);'''
start = source.find(start_marker)
end = source.find(end_marker, start)
if start >= 0 and end >= 0:
    delivery_replacement = '''replace_once(
    project_delivery,
    """onChange={(event) => {
                  setConnectorId(event.target.value);
                  setExternalWriteConfirmed(false);
                }}""",
    """onChange={(event) => {
                  const connector = CONNECTORS.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (connector) {
                    setConnectorId(connector.id);
                    setExternalWriteConfirmed(false);
                  }
                }}""",
)
'''
    source = source[:start] + delivery_replacement + source[end:]
elif corrected_marker not in source:
    raise RuntimeError(
        f"delivery replacement boundaries missing: start={start} end={end}"
    )

path.write_text(source, encoding="utf-8")

catalog_path = Path("apps/web/src/domains/creator/studio-template-catalog.ts")
replace_normalized(
    catalog_path,
    'rightsStatus: "unknown",',
    'rightsStatus: "warning",',
    "image rights status",
)

governance_path = Path(
    "apps/web/src/domains/creator/studio-asset-governance.ts"
)
replace_normalized(
    governance_path,
    '''  const provider = evaluateStudioAssetProviderRequest(input.provider, {
    action: "download",
    authenticated: preferences.providerAccountConnected,
    userInitiated: true,
    sourceUrl: input.passport.source.sourceUrl ?? null,
    bypassesAccessControl: false,
  });''',
    '''  const provider = evaluateStudioAssetProviderRequest(input.provider, {
    action: "sync-entitlements",
    authenticated: preferences.providerAccountConnected,
    userInitiated: false,
    sourceUrl: input.passport.source.sourceUrl ?? null,
    bypassesAccessControl: false,
  });''',
    "provider entitlement audit request",
)
replace_normalized(
    governance_path,
    '        checksum: CHECKSUM.replace(/a/gu, "b"),',
    '        checksum: `sha256:${"b".repeat(64)}`,',
    "preview checksum",
)

governance_test_path = Path(
    "apps/web/src/domains/creator/studio-asset-governance.test.ts"
)
replace_normalized(
    governance_test_path,
    '    expect(usageCodes).toContain("ai-training-prohibited");',
    '    expect(usageCodes).toContain("ai-training");',
    "AI training reason assertion",
)
replace_normalized(
    governance_test_path,
    '    expect(report.plugin.status).toBe("allowed");',
    '    expect(report.plugin.status).toBe("ready");',
    "plugin readiness status assertion",
)
