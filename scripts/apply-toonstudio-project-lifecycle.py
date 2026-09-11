from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected exactly one match, found {count}: {old[:100]!r}"
        )
    file.write_text(text.replace(old, new, 1))


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

routes = "apps/web/src/app/routes/groups/creator.routes.tsx"
replace_once(
    routes,
    '''  { id: "creator-studio-import", path: studioRoutePath("import"), element: <StudioImportPage /> },
  { id: "creator-studio-assets", path: studioRoutePath("assets"), element: <StudioAssetHubPage /> },''',
    '''  { id: "creator-studio-import", path: studioRoutePath("import"), element: <StudioImportPage /> },
  { id: "creator-studio-recovery", path: "/studio/recovery", element: <Navigate to="/studio?view=archived" replace /> },
  { id: "creator-studio-trash", path: "/studio/trash", element: <Navigate to="/studio?view=trash" replace /> },
  { id: "creator-studio-assets", path: studioRoutePath("assets"), element: <StudioAssetHubPage /> },''',
)

integrated = "apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx"
replace_once(
    integrated,
    'import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";',
    '''import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";
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

reachability = "scripts/verify-toonstudio-feature-reachability.mjs"
replace_once(
    reachability,
    '''  "apps/web/src/domains/creator/studio-project-workspace-store.ts",
  "apps/web/src/domains/creator/studio-project-diagnostics.ts",''',
    '''  "apps/web/src/domains/creator/studio-project-workspace-store.ts",
  "apps/web/src/domains/creator/studio-project-library-store.ts",
  "apps/web/src/domains/creator/studio-project-document-store.ts",
  "apps/web/src/domains/creator/studio-project-diagnostics.ts",''',
)
replace_once(
    reachability,
    '''  "apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx",''',
    '''  "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioNewIntegratedPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx",''',
)

closure = Path("apps/web/src/domains/creator/studio-integration-closure.test.ts")
if closure.exists():
    replace_once(
        str(closure),
        '''      "StudioProjectFeatureSuitePanel",
      "StudioLocalizationPanel",''',
        '''      "StudioProjectFeatureSuitePanel",
      "StudioProjectDocumentsPanel",
      "StudioLocalizationPanel",''',
    )
    text = closure.read_text()
    marker = '''  it("mounts recovered import and AI handoffs in the real canvas host", () => {'''
    addition = '''  it("owns project and document lifecycle from the canonical front door", () => {
    const routePages = source("apps/web/src/app/routes/groups/creator-route-pages.ts");
    const routes = source("apps/web/src/app/routes/groups/creator.routes.tsx");
    const integrated = source("apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx");

    expect(routePages).toContain('studio-shell/StudioProjectLibraryPage');
    expect(routePages).toContain('studio-shell/StudioNewIntegratedPage');
    expect(routes).toContain('path: "/studio/recovery"');
    expect(routes).toContain('path: "/studio/trash"');
    expect(integrated).toContain("<StudioProjectDocumentsPanel");
  });

'''
    if addition not in text:
        if marker not in text:
            raise SystemExit(f"{closure}: insertion marker not found")
        closure.write_text(text.replace(marker, addition + marker, 1))
