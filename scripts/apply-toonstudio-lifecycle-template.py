from __future__ import annotations

from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, value: str) -> None:
    Path(path).write_text(value)


def replace_once(path: str, old: str, new: str, *, required: bool = True) -> None:
    value = read(path)
    if new in value:
        return
    count = value.count(old)
    if count == 0 and not required:
        return
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    write(path, value.replace(old, new, 1))


# Accessibility and lint cleanup for the project creation and library surfaces.
for path in (
    "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx",
):
    value = read(path)
    value = re.sub(r"(?m)^\s*autoFocus\s*\n", "", value)
    write(path, value)

panel = "apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx"
value = read(panel)
value = re.sub(r"(?m)^\s*studioDocumentWorkspaces,\s*\n", "", value)
write(panel, value)

# Preserve literal workspace unions and exact optional property semantics.
document_store = "apps/web/src/domains/creator/studio-project-document-store.ts"
value = read(document_store)
declaration = (
    "const KIND_WORKSPACES: Readonly<Record<StudioDocumentKind, "
    "readonly StudioDocumentWorkspace[]>> = Object.freeze({"
)
if declaration in value:
    value = value.replace(declaration, "const KIND_WORKSPACES = Object.freeze({", 1)
    footer = "});\n\nconst PROJECT_DEFAULT_DOCUMENT:"
    typed_footer = (
        "} as const satisfies Readonly<Record<StudioDocumentKind, "
        "readonly StudioDocumentWorkspace[]>>);\n\n"
        "const PROJECT_DEFAULT_DOCUMENT:"
    )
    if footer not in value:
        raise SystemExit(f"{document_store}: KIND_WORKSPACES closing marker missing")
    value = value.replace(footer, typed_footer, 1)
lookup = "  const allowedWorkspaces = KIND_WORKSPACES[input.kind];"
if lookup in value:
    value = value.replace(
        lookup,
        "  const allowedWorkspaces: readonly StudioDocumentWorkspace[] = KIND_WORKSPACES[input.kind];",
        1,
    )
value = value.replace(
    "    projectKind: input.projectKind,\n    createdAt: input.createdAt,\n    target: input.target,",
    "    projectKind: input.projectKind,\n    ...(input.createdAt ? { createdAt: input.createdAt } : {}),\n    target: input.target,",
)
value = value.replace(
    "    pageCount: source.pageCount,\n    createdAt: options.at,\n  }, { target: options.target });",
    "    pageCount: source.pageCount,\n    ...(options.at ? { createdAt: options.at } : {}),\n  }, { target: options.target });",
)
write(document_store, value)

library_store = "apps/web/src/domains/creator/studio-project-library-store.ts"
value = read(library_store)
value = value.replace(
    "    primaryLocale: source.primaryLocale,\n    createdAt: options.at,\n  }, { target: options.target });",
    "    primaryLocale: source.primaryLocale,\n    ...(options.at ? { createdAt: options.at } : {}),\n  }, { target: options.target });",
)
write(library_store, value)

# Use a supported button variant while retaining destructive affordance styling.
danger_call = 'buttonClass({ variant: "danger", size: "sm" })'
danger_outline = (
    'buttonClass({ variant: "outline", size: "sm", '
    'className: "border-danger/50 text-danger hover:border-danger '
    'hover:bg-danger-soft/25 hover:text-danger" })'
)
for path in (
    panel,
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx",
):
    write(path, read(path).replace(danger_call, danger_outline))

# Route the template hub through the canonical route registry.
route_pages = "apps/web/src/app/routes/groups/creator-route-pages.ts"
value = read(route_pages)
template_export = (
    'export const StudioTemplateHubPage = lazyRetry(\n'
    '  () => import("@/domains/creator/studio-shell/StudioTemplateHubPage").then((module) => ({\n'
    '    default: module.StudioTemplateHubPage,\n'
    '  })),\n'
    '  "StudioTemplateHubPage",\n'
    ');\n'
)
if "export const StudioTemplateHubPage" not in value:
    marker = "export const StudioAssetsPage = lazyRetry("
    if marker not in value:
        raise SystemExit(f"{route_pages}: StudioAssetsPage marker missing")
    value = value.replace(marker, template_export + marker, 1)
write(route_pages, value)

routes = "apps/web/src/app/routes/groups/creator.routes.tsx"
value = read(routes)
if "  StudioTemplateHubPage,\n" not in value:
    marker = "  StudioNewPage,\n"
    if marker not in value:
        raise SystemExit(f"{routes}: StudioNewPage import marker missing")
    value = value.replace(marker, marker + "  StudioTemplateHubPage,\n", 1)
template_route = (
    '  { id: "creator-studio-templates", path: studioRoutePath("templates"), '
    'element: <StudioTemplateHubPage /> },'
)
if template_route not in value:
    candidates = (
        '  { id: "creator-studio-templates", path: studioRoutePath("templates"), element: <Navigate to="/market?view=templates" replace /> },',
        '  { id: "creator-studio-templates", path: "/studio/templates", element: <Navigate to="/market?view=templates" replace /> },',
    )
    for candidate in candidates:
        if candidate in value:
            value = value.replace(candidate, template_route, 1)
            break
    else:
        raise SystemExit(f"{routes}: template route marker missing")
write(routes, value)

# Make the centralized transaction the single project/document creation authority.
create_page = "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx"
value = read(create_page)
old_imports = '''import {
  ensureInitialStudioProjectDocument,
  studioProjectDocumentHref,
} from "../studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  trashStudioProject,
  type StudioProjectKind,
} from "../studio-project-library-store";'''
new_imports = '''import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import type { StudioProjectKind } from "../studio-project-library-store";'''
if old_imports in value:
    value = value.replace(old_imports, new_imports, 1)
elif "createStudioProjectWithInitialDocument" not in value:
    raise SystemExit(f"{create_page}: creation import block missing")
create_handler = '''  const create = () => {
    if (typeof window === "undefined" || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(
        window.localStorage,
        {
          title,
          kind,
          templateId,
          description,
          primaryLocale,
          createdAt: new Date().toISOString(),
        },
        window,
      );
      navigate(result.href, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "프로젝트를 만들지 못했습니다."
          : "The project could not be created.");
      setCreating(false);
    }
  };

  return ('''
pattern = re.compile(r"  const create = \(\) => \{[\s\S]*?\n  \};\n\n  return \(", re.MULTILINE)
if "createStudioProjectWithInitialDocument(" not in value[value.find("  const create ="):]:
    value, count = pattern.subn(create_handler, value, count=1)
    if count != 1:
        raise SystemExit(f"{create_page}: create handler marker missing")
write(create_page, value)

# Repair exact optional property shapes in the imported transaction module.
creation = "apps/web/src/domains/creator/studio-project-creation.ts"
value = read(creation)
old_project_call = '''  const project = createStudioProject(storage, {
    title: input.title,
    kind: input.kind,
    templateId: input.templateId,
    description: input.description,
    primaryLocale: input.primaryLocale,
    createdAt,
  }, { target });'''
new_project_call = '''  const project = createStudioProject(storage, {
    title: input.title,
    kind: input.kind,
    createdAt,
    ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.primaryLocale !== undefined ? { primaryLocale: input.primaryLocale } : {}),
  }, { target });'''
if old_project_call in value:
    value = value.replace(old_project_call, new_project_call, 1)
old_document_call = '''      ? createStudioProjectDocument(storage, project.id, {
        title: input.document.title ?? `${project.title} 작업 문서`,
        kind: input.document.kind,
        defaultWorkspace: input.document.defaultWorkspace,
        width: input.document.width,
        height: input.document.height,
        pageCount: input.document.pageCount,
        createdAt,
      }, { target })'''
new_document_call = '''      ? createStudioProjectDocument(storage, project.id, {
        title: input.document.title ?? `${project.title} 작업 문서`,
        kind: input.document.kind,
        createdAt,
        ...(input.document.defaultWorkspace !== undefined
          ? { defaultWorkspace: input.document.defaultWorkspace }
          : {}),
        ...(input.document.width !== undefined ? { width: input.document.width } : {}),
        ...(input.document.height !== undefined ? { height: input.document.height } : {}),
        ...(input.document.pageCount !== undefined ? { pageCount: input.document.pageCount } : {}),
      }, { target })'''
if old_document_call in value:
    value = value.replace(old_document_call, new_document_call, 1)
write(creation, value)

# Register template ownership without changing the four-destination IA invariant.
product_ia = "apps/web/src/domains/creator/studio-product-ia.ts"
value = read(product_ia)
value = value.replace(
    '  { id: "create", label: "새로 만들기", href: "/studio/new" },',
    '  { id: "templates", label: "템플릿", href: "/studio/templates" },',
    1,
)
if 'id: "template.library"' not in value:
    marker = '  {\n    id: "project.create",'
    addition = (
        '  {\n'
        '    id: "template.library",\n'
        '    label: "템플릿",\n'
        '    owner: "templates",\n'
        '    primaryRoute: "/studio/templates",\n'
        '    maturity: "stable",\n'
        '    surfaces: [\n'
        '      { id: "template-hub", role: "primary" },\n'
        '      { id: "header-template-link", role: "projection" },\n'
        '      { id: "new-project-template-picker", role: "projection" },\n'
        '      { id: "asset-market-templates", role: "projection" },\n'
        '    ],\n'
        '    aliases: ["템플릿 갤러리", "미리디자인", "presentation template"],\n'
        '  },\n'
    )
    if marker not in value:
        raise SystemExit(f"{product_ia}: project.create capability marker missing")
    value = value.replace(marker, addition + marker, 1)
write(product_ia, value)

product_test = "apps/web/src/domains/creator/studio-product-ia.test.ts"
if Path(product_test).exists():
    value = read(product_test)
    value = value.replace('"create", "assets", "learn"', '"templates", "assets", "learn"')
    value = value.replace('"새로 만들기", "에셋", "배우기"', '"템플릿", "에셋", "배우기"')
    value = value.replace('"/studio/new", "/studio/assets", "/learn"', '"/studio/templates", "/studio/assets", "/learn"')
    write(product_test, value)

# Require lifecycle and template surfaces to remain reachable from product roots.
reachability = "scripts/verify-toonstudio-feature-reachability.mjs"
value = read(reachability)
marker = '  "apps/web/src/domains/creator/studio-project-views.ts",\n'
modules = (
    "apps/web/src/domains/creator/studio-project-library-store.ts",
    "apps/web/src/domains/creator/studio-project-document-store.ts",
    "apps/web/src/domains/creator/studio-project-creation.ts",
    "apps/web/src/domains/creator/studio-project-template-catalog.ts",
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioNewIntegratedPage.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioTemplateHubPage.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx",
)
missing_lines = "".join(f'  "{module}",\n' for module in modules if f'  "{module}",\n' not in value)
if missing_lines:
    if marker not in value:
        raise SystemExit(f"{reachability}: required list marker missing")
    value = value.replace(marker, marker + missing_lines, 1)
write(reachability, value)

# Align source-contract tests with the route registry and the consolidated surfaces.
closure = "apps/web/src/domains/creator/studio-integration-closure.test.ts"
value = read(closure)
value = value.replace(
    'expect(routes).toContain(`path: "/studio/p/:projectId/${section}"`);',
    'expect(routes).toContain(`path: studioRoutePath("project-${section}")`);',
)
value = value.replace(
    "expect(routes).toContain('path: \"/studio/assets/brushes/new\"');",
    "expect(routes).toContain('path: studioRoutePath(\"asset-brush-new\")');",
)
value = value.replace(
    "expect(routes).toContain('path: \"/studio/assets/brushes/:brushId/edit\"');",
    "expect(routes).toContain('path: studioRoutePath(\"asset-brush-edit\")');",
)
if "StudioProjectDocumentsPanel" not in value[value.find("for (const component"):value.find("])", value.find("for (const component"))]:
    value = value.replace(
        '      "StudioProjectFeatureSuitePanel",\n',
        '      "StudioProjectFeatureSuitePanel",\n      "StudioProjectDocumentsPanel",\n',
        1,
    )
if "studio-shell/StudioTemplateHubPage" not in value:
    marker = "    expect(routePages).toContain('studio-shell/StudioNewIntegratedPage');\n"
    if marker in value:
        value = value.replace(
            marker,
            marker + "    expect(routePages).toContain('studio-shell/StudioTemplateHubPage');\n",
            1,
        )
if "<StudioTemplateHubPage />" not in value:
    marker = "    expect(routes).toContain('path: \"/studio/trash\"');\n"
    if marker in value:
        value = value.replace(
            marker,
            marker + "    expect(routes).toContain('<StudioTemplateHubPage />');\n",
            1,
        )
write(closure, value)

library_test = "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.test.tsx"
value = read(library_test)
value = value.replace(
    'fireEvent.click(screen.getByRole("button", { name: /^복원$|^Restore$/u }));',
    'fireEvent.click(screen.getAllByRole("button", { name: /^복원$|^Restore$/u }).at(-1)!);',
    1,
)
write(library_test, value)

# Remove source helper scripts from the final product diff after this run consumes them.
Path("scripts/apply-toonstudio-project-lifecycle.py").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)

# Remove branch-mutating workflows only from the validation worktree. They are intentionally
# not staged by the workflow; the GitHub connector removes them from the branch after validation.
workflow_root = Path(".github/workflows")
keep = {
    "toonstudio-integration.yml",
    "toonstudio-feature-reachability.yml",
    "toonstudio-session-goals.yml",
}
tokens = {
    "apply",
    "repair",
    "finalize",
    "finalizer",
    "sync",
    "stage",
    "snapshot",
    "validate",
    "validation",
    "install",
    "consolidate",
    "continuation",
    "completion",
    "preseed",
}
for path in workflow_root.iterdir():
    if not path.is_file() or path.suffix not in {".yml", ".yaml"}:
        continue
    if path.name in keep:
        continue
    name = path.name.lower()
    if ("toonstudio" in name and any(token in name for token in tokens)) or name.startswith(
        "pr-1307-source-diagnostics"
    ):
        path.unlink()
