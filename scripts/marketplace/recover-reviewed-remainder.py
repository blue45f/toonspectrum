#!/usr/bin/env python3
"""One-shot recovery of the reviewed, unlanded suffix of the marketplace wave."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "c69700728b7ed6f15bf73b06fbbdb5ef91ec66f7"
SCRIPT = "scripts/marketplace/apply-engagement-trust-upgrade.py"


def original(path: str) -> str:
    return subprocess.check_output(["git", "show", f"{SOURCE}:{path}"], cwd=ROOT, text=True)


source = original(SCRIPT)
helpers = source[:source.index("# Market navigation and route wiring.")]
remainder = source[source.index("# Creator management: replace synthetic score with package facts."):]
namespace = {"__file__": str(Path(__file__).resolve())}
# The old navigation/card rewrite is deliberately not executed: #741 already landed a newer one.
exec(compile(helpers + remainder, SCRIPT, "exec"), namespace)
replace_once = namespace["replace_once"]

for path in (
    "apps/api/src/db/migrations/0037_creator_marketplace_3d_asset_parity.sql",
    "apps/api/src/modules/creator-marketplace/creator-marketplace-3d-asset-parity.test.ts",
):
    target = ROOT / path
    if target.exists():
        raise RuntimeError(f"Refusing to overwrite existing recovery target: {path}")
    target.write_text(original(path), encoding="utf-8")

article = "src/domains/market/components/MarketResourceDetailArticle.tsx"
replace_once(article,
    '            format={record.kind.startsWith("3d") ? "glb" : "portable-json"}',
    '            format={record.entries.length > 0 && record.entries.every((entry) => entry.delivery.mode === "portable-json") ? "portable-json" : undefined}')
replace_once(article,
    '<p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">{license.summary}</p>',
    '<p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">사용 조건: {license.summary}</p>')
replace_once(article, '              순수 창작\n', '              AI 미포함으로 공개\n')
replace_once(article, '3D 인터랙티브 뷰어 (은선·셀셰이딩·조명)', '3D 렌더 모드 예시 보기')
replace_once(article, '전체 크기: {formatMarketByteSize(record.manifestByteSize)}', 'manifest 크기: {formatMarketByteSize(record.manifestByteSize)}')
replace_once(article,
    '        format="glb"\n        onImportToStudio={() => {\n          setViewer3dOpen(false);\n        }}',
    '        studioResourceId={record.id}')

viewer = "src/domains/market/components/MarketWebtoon3dViewerModal.tsx"
replace_once(viewer, 'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\nimport Link from "@/src/compat/router-link";')
replace_once(viewer, '  readonly onImportToStudio?: () => void;',
    '  readonly onImportToStudio?: () => void;\n  readonly studioResourceId?: string;')
replace_once(viewer, '  format = "glb",', '  format,')
replace_once(viewer, '  onImportToStudio,\n}:', '  onImportToStudio,\n  studioResourceId,\n}:')
replace_once(viewer, '  if (!open) return null;',
    '  const validTriangleCount = triangleCount !== undefined && Number.isSafeInteger(triangleCount) && triangleCount >= 0 ? triangleCount : undefined;\n'
    '  const validVertexCount = vertexCount !== undefined && Number.isSafeInteger(vertexCount) && vertexCount >= 0 ? vertexCount : undefined;\n\n'
    '  if (!open) return null;')
replace_once(viewer, '{assetTitle} · 3D 웹툰 인터랙티브 뷰어', '{assetTitle} · 3D 렌더 모드 예시')
replace_once(viewer,
    '뷰어 렌더 모드로 형태와 조명 조건을 비교하세요. 에셋 지원 여부는 게시 manifest를 기준으로 확인합니다',
    '아래 도형은 렌더 모드를 설명하는 예시이며 이 에셋의 실제 메시가 아닙니다. 실제 모델과 지원 기능은 Studio에서 확인하세요.')
replace_once(viewer, '{/* Viewport Simulation Area */}', '{/* Illustrative controls, explicitly not an asset renderer. */}')
replace_once(viewer, '{/* Virtual 3D Turntable Graphic */}', '{/* Render-mode illustration; never presented as the publisher mesh. */}')
replace_once(viewer, '{triangleCount !== undefined ? (', '{validTriangleCount !== undefined ? (')
replace_once(viewer, '{triangleCount.toLocaleString()}', '{validTriangleCount.toLocaleString()}')
replace_once(viewer, '{vertexCount !== undefined ? (', '{validVertexCount !== undefined ? (')
replace_once(viewer, '{vertexCount.toLocaleString()}', '{validVertexCount.toLocaleString()}')
replace_once(viewer, '{triangleCount === undefined && vertexCount === undefined ? (', '{validTriangleCount === undefined && validVertexCount === undefined ? (')
replace_once(viewer, '                  onClick={() => setRenderMode(mode.id)}',
    '                  aria-pressed={renderMode === mode.id}\n                  onClick={() => setRenderMode(mode.id)}')
for mode in ('day', 'sunset', 'night'):
    replace_once(viewer, f'                onClick={{() => setLighting("{mode}")}}',
        f'                aria-pressed={{lighting === "{mode}"}}\n                onClick={{() => setLighting("{mode}")}}')
replace_once(viewer, '                type="range"\n', '                type="range"\n                aria-label="렌더 모드 예시 회전각"\n')
replace_once(viewer, '            {onImportToStudio && (',
    '            {studioResourceId ? (\n'
    '              <Link\n'
    '                href={`/studio?installMarketResource=${encodeURIComponent(studioResourceId)}&assetMarket=community`}\n'
    '                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 font-bold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"\n'
    '              >\n'
    '                Studio에서 실제 에셋 확인\n'
    '              </Link>\n'
    '            ) : null}\n'
    '            {!studioResourceId && onImportToStudio && (')
replace_once(viewer, '<span>스튜디오에 배치하기</span>', '<span>Studio에서 확인하기</span>')

viewer_test = "src/domains/market/components/MarketWebtoon3dViewerModal.test.tsx"
replace_once(viewer_test, '황실 대연회장 3D · 3D 웹툰 인터랙티브 뷰어', '황실 대연회장 3D · 3D 렌더 모드 예시')
replace_once(viewer_test, '스튜디오에 배치하기', 'Studio에서 확인하기')

# No unrelated source or checked-in test evidence can be modified by this recovery.
allowed = {
    article, viewer, viewer_test,
    "src/domains/market/pages/MarketManagePage.tsx",
    "src/domains/market/components/MarketWebtoonSpecBadge.tsx",
    "src/domains/market/components/MarketWebtoonSpecBadge.test.tsx",
    "src/domains/market/components/MarketResourceCard.test.tsx",
    "apps/api/src/db/creator-marketplace-library.schema.ts",
    "apps/api/src/db/creator-marketplace-report.schema.ts",
    "scripts/production-database-migrations.manifest",
    "scripts/run-production-database-migrations.test.mjs",
    "scripts/bootstrap-empty-production-database.mjs",
    "scripts/bootstrap-empty-production-database.test.mjs",
    "scripts/verify-creator-marketplace-db.mts",
}
changed = set(subprocess.check_output(["git", "diff", "--name-only"], cwd=ROOT, text=True).splitlines())
if changed - allowed:
    raise RuntimeError(f"Out-of-scope changes: {sorted(changed - allowed)}")
print("Recovered reviewed remainder without reverting already integrated social/comparison work.")
