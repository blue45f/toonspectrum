from __future__ import annotations

from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:100]!r}"
        )
    file.write_text(text.replace(old, new, 1))


def remove_once(path: str, pattern: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    next_text, count = re.subn(pattern, "", text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"{path}: expected one {label}, found {count}")
    file.write_text(next_text)


wrapper = "apps/web/src/domains/creator/studio-shell/StudioNewIntegratedPage.tsx"
replace_once(
    wrapper,
    'import { StudioNewPage } from "./StudioFrontDoorPages";',
    (
        'import { StudioNewIntegratedPage as StudioProjectCreatePage } '
        'from "./StudioProjectCreatePage";'
    ),
)
replace_once(wrapper, "<StudioNewPage />", "<StudioProjectCreatePage />")

create_test = Path(
    "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.test.tsx"
)
test_source = create_test.read_text()
test_source = test_source.replace(
    'import { StudioNewIntegratedPage } from "./StudioNewIntegratedPage";',
    (
        'import { StudioNewIntegratedPage as StudioProjectCreatePage } '
        'from "./StudioProjectCreatePage";'
    ),
)
test_source = test_source.replace(
    'describe("StudioNewIntegratedPage"',
    'describe("StudioProjectCreatePage"',
)
test_source = test_source.replace(
    "<StudioNewIntegratedPage />",
    "<StudioProjectCreatePage />",
)
create_test.write_text(test_source)

route_pages = "apps/web/src/app/routes/groups/creator-route-pages.ts"
replace_once(
    route_pages,
    '''export const StudioHomePage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioHomePage,
  })),
  "StudioHomePage",
);''',
    '''export const StudioHomePage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioProjectLibraryPage").then((module) => ({
    default: module.StudioProjectLibraryPage,
  })),
  "StudioProjectLibraryPage",
);''',
)
replace_once(
    route_pages,
    '''export const StudioNewPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioNewPage,
  })),
  "StudioNewPage",
);''',
    '''export const StudioNewPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioNewIntegratedPage").then((module) => ({
    default: module.StudioNewIntegratedPage,
  })),
  "StudioNewIntegratedPage",
);''',
)

template_page = '''export const StudioTemplatesPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioTemplatesPage").then((module) => ({
    default: module.StudioTemplatesPage,
  })),
  "StudioTemplatesPage",
);'''
route_page_file = Path(route_pages)
route_text = route_page_file.read_text()
if template_page not in route_text:
    marker = '''export const StudioNewPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioNewIntegratedPage").then((module) => ({
    default: module.StudioNewIntegratedPage,
  })),
  "StudioNewIntegratedPage",
);'''
    if marker not in route_text:
        raise SystemExit(f"{route_pages}: new-page insertion marker missing")
    route_page_file.write_text(route_text.replace(marker, marker + "\n\n" + template_page, 1))

routes = "apps/web/src/app/routes/groups/creator.routes.tsx"
replace_once(
    routes,
    '''  StudioProjectShellPage,
  StudioPromoPage,''',
    '''  StudioProjectShellPage,
  StudioPromoPage,
  StudioTemplatesPage,''',
)
replace_once(
    routes,
    '''  { id: "creator-studio-import", path: studioRoutePath("import"), element: <StudioImportPage /> },
  { id: "creator-studio-assets", path: studioRoutePath("assets"), element: <StudioAssetHubPage /> },''',
    '''  { id: "creator-studio-import", path: studioRoutePath("import"), element: <StudioImportPage /> },
  { id: "creator-studio-recovery", path: studioRoutePath("recovery"), element: <Navigate to="/studio?view=archived" replace /> },
  { id: "creator-studio-trash", path: studioRoutePath("trash"), element: <Navigate to="/studio?view=trash" replace /> },
  { id: "creator-studio-assets", path: studioRoutePath("assets"), element: <StudioAssetHubPage /> },''',
)
replace_once(
    routes,
    '''  { id: "creator-studio-templates", path: studioRoutePath("templates"), element: <Navigate to="/market?view=templates" replace /> },''',
    '''  { id: "creator-studio-templates", path: studioRoutePath("templates"), element: <StudioTemplatesPage /> },''',
)

registry = "apps/web/src/domains/creator/studio-route-registry.ts"
replace_once(
    registry,
    '''  "templates",
  "assets",''',
    '''  "templates",
  "assets",
  "recovery",
  "trash",''',
)
replace_once(
    registry,
    '''  route("assets", "/studio/assets", "asset", "none", "에셋", "Assets", ["/market/library"]),''',
    '''  route("assets", "/studio/assets", "asset", "none", "에셋", "Assets", ["/market/library"]),
  route("recovery", "/studio/recovery", "studio", "none", "복구", "Recovery"),
  route("trash", "/studio/trash", "studio", "none", "휴지통", "Trash"),''',
)

integrated = "apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx"
replace_once(
    integrated,
    'import { StudioProjectDeliveryPanel } from "./StudioProjectDeliveryPanel";',
    '''import { StudioProjectDeliveryPanel } from "./StudioProjectDeliveryPanel";
import { StudioProjectDocumentsPanel } from "./StudioProjectDocumentsPanel";''',
)
replace_once(
    integrated,
    '''      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
      />
      {section === "story" && view === "localization" ? (''',
    '''      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
      />
      {section === "production" && view === "documents" ? (
        <StudioProjectDocumentsPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "story" && view === "localization" ? (''',
)

remove_once(
    "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx",
    r"^\s*autoFocus\s*\n",
    "autoFocus prop",
)
remove_once(
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx",
    r"^\s*autoFocus\s*\n",
    "autoFocus prop",
)
remove_once(
    "apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx",
    r"^\s*studioDocumentWorkspaces,\s*\n",
    "unused studioDocumentWorkspaces import",
)

document_store = Path(
    "apps/web/src/domains/creator/studio-project-document-store.ts"
)
document_source = document_store.read_text()
declaration = (
    "const KIND_WORKSPACES: Readonly<Record<StudioDocumentKind, "
    "readonly StudioDocumentWorkspace[]>> = Object.freeze({"
)
if document_source.count(declaration) != 1:
    raise SystemExit(
        f"{document_store}: expected one KIND_WORKSPACES declaration"
    )
document_source = document_source.replace(
    declaration,
    "const KIND_WORKSPACES = Object.freeze({",
    1,
)
footer = "});\n\nconst PROJECT_DEFAULT_DOCUMENT:"
typed_footer = (
    "} as const satisfies Readonly<Record<StudioDocumentKind, "
    "readonly StudioDocumentWorkspace[]>>);\n\n"
    "const PROJECT_DEFAULT_DOCUMENT:"
)
if document_source.count(footer) != 1:
    raise SystemExit(
        f"{document_store}: expected one KIND_WORKSPACES closing marker"
    )
document_source = document_source.replace(footer, typed_footer, 1)
workspace_lookup = "  const allowedWorkspaces = KIND_WORKSPACES[input.kind];"
typed_workspace_lookup = (
    "  const allowedWorkspaces: readonly StudioDocumentWorkspace[] = "
    "KIND_WORKSPACES[input.kind];"
)
if document_source.count(workspace_lookup) != 1:
    raise SystemExit(
        f"{document_store}: expected one allowedWorkspaces lookup"
    )
document_store.write_text(
    document_source.replace(workspace_lookup, typed_workspace_lookup, 1)
)

danger_call = 'buttonClass({ variant: "danger", size: "sm" })'
danger_outline = (
    'buttonClass({ variant: "outline", size: "sm", '
    'className: "border-danger/50 text-danger hover:border-danger '
    'hover:bg-danger-soft/25 hover:text-danger" })'
)
danger_targets = {
    Path(
        "apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx"
    ): 2,
    Path(
        "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx"
    ): 1,
}
for file, expected in danger_targets.items():
    source = file.read_text()
    found = source.count(danger_call)
    if found != expected:
        raise SystemExit(
            f"{file}: expected {expected} danger button calls, found {found}"
        )
    file.write_text(source.replace(danger_call, danger_outline))
