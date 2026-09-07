from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}")
    target.write_text(text.replace(old, new), encoding="utf-8")


workspace = "apps/web/src/domains/creator/StudioUnifiedAssetWorkspace.tsx"
replace_once(
    workspace,
    "  readonly legacyContent: ReactNode;\n  readonly onUseItem:",
    "  readonly legacyContent: ReactNode;\n  readonly initialView?: WorkspaceView;\n  readonly onUseItem:",
)
replace_once(
    workspace,
    'type WorkspaceView = "discover" | "library";',
    'export type WorkspaceView = "discover" | "library";',
)
replace_once(
    workspace,
    "  legacyContent,\n  onUseItem,",
    '  legacyContent,\n  initialView = "discover",\n  onUseItem,',
)
replace_once(
    workspace,
    'const [view, setView] = useState<WorkspaceView>("discover");',
    "const [view, setView] = useState<WorkspaceView>(initialView);",
)
replace_once(
    workspace,
    "  async function useItem(item: StudioUnifiedAssetItem): Promise<void> {",
    "  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {",
)
replace_once(
    workspace,
    "onClick={() => void useItem(item)}",
    "onClick={() => void handleUseItem(item)}",
)

workspace_test = "apps/web/src/domains/creator/StudioUnifiedAssetWorkspace.test.tsx"
replace_once(
    workspace_test,
    '''    fireEvent.click(screen.getByRole("button", { name: "3D 0" }));
    expect(screen.getByText("조건에 맞는 에셋이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조건 넓히기" }));
    expect(screen.getByText("교실 의자")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("비 오는 밤 학교")).toBeTruthy();
''',
    '''    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("비 오는 밤 학교")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "내 에셋" }));
    fireEvent.click(screen.getByRole("button", { name: "3D 0" }));
    expect(screen.getByText("조건에 맞는 에셋이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조건 넓히기" }));
    expect(screen.getByText("교실 의자")).toBeTruthy();
''',
)

sonar_properties = Path("sonar-project.properties")
sonar_text = sonar_properties.read_text(encoding="utf-8")
if "sonar.javascript.lcov.reportPaths=" not in sonar_text:
    marker = "sonar.qualitygate.wait=true\n"
    if marker not in sonar_text:
        raise SystemExit("Sonar quality gate marker not found")
    sonar_properties.write_text(
        sonar_text.replace(
            marker,
            marker + "sonar.javascript.lcov.reportPaths=coverage/sonar/lcov.info\n",
            1,
        ),
        encoding="utf-8",
    )

sonar_workflow = Path(".github/workflows/sonarqube.yml")
sonar_text = sonar_workflow.read_text(encoding="utf-8")
if "Generate changed Studio coverage" not in sonar_text:
    install = """      - name: Install dependencies
        if: steps.secrets.outputs.configured == 'true'
        run: pnpm install --frozen-lockfile

"""
    coverage = """      - name: Generate changed Studio coverage
        if: steps.secrets.outputs.configured == 'true'
        run: |
          pnpm exec vitest run \\
            apps/web/src/domains/creator/StudioAssetLegacyPanel.test.tsx \\
            apps/web/src/domains/creator/StudioAssetToolPopoverWorkspace.test.tsx \\
            apps/web/src/domains/creator/StudioUnifiedAssetWorkspace.test.tsx \\
            apps/web/src/domains/creator/studio-unified-asset-catalog.test.ts \\
            apps/web/src/domains/creator/studio-tool-belt-lazy-ui-boundary.test.ts \\
            --config vitest.sonar.config.ts

"""
    if sonar_text.count(install) != 1:
        raise SystemExit("Sonar install step marker mismatch")
    sonar_workflow.write_text(
        sonar_text.replace(install, install + coverage, 1),
        encoding="utf-8",
    )
