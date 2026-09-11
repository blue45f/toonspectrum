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
    if old not in source:
        raise RuntimeError(f"repair guard missing: {old[:100]}")
    source = source.replace(old, new, 1)

start_marker = '''replace_once(
    project_delivery,
    "onChange={(event) => setConnectorId(event.target.value)}",'''
end_marker = '''
replace_once(
    "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx",'''
start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError(
        f"delivery replacement boundaries missing: start={start} end={end}"
    )

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
path.write_text(source, encoding="utf-8")
