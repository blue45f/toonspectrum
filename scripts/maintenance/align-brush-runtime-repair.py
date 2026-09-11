from __future__ import annotations

from pathlib import Path

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

# A placeholder image has not been rights-cleared yet. The template contract represents that state
# as a review warning rather than the removed legacy `unknown` value.
catalog_path = Path("apps/web/src/domains/creator/studio-template-catalog.ts")
catalog = catalog_path.read_text(encoding="utf-8")
legacy_rights = 'rightsStatus: "unknown",'
review_rights = 'rightsStatus: "warning",'
legacy_count = catalog.count(legacy_rights)
if legacy_count == 1:
    catalog_path.write_text(
        catalog.replace(legacy_rights, review_rights, 1),
        encoding="utf-8",
    )
elif legacy_count != 0 or review_rights not in catalog:
    raise RuntimeError(
        "studio-template-catalog.ts: expected one legacy or normalized image rights status"
    )
