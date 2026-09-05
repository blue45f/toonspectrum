#!/usr/bin/env python3
"""Apply reviewed, anchored source changes; never touches user data or saved files."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / 'src/domains/creator'


def replace(path: Path, before: str, after: str) -> None:
    text = path.read_text()
    if after in text: return
    if text.count(before) != 1:
        raise ValueError('Reviewed source anchor moved: ' + path.name + ': ' + before[:100])
    path.write_text(text.replace(before, after, 1))


def prepare() -> None:
    originals = DOMAIN / 'studio-original-free-asset-packs.ts'
    replace(originals, 'import type { StudioAsset } from "./studio-asset-library";',
        'import { createStarterDotPositions, removeTrustedStarterBackdrop } from "./studio-asset-visual-curation";\n\n'
        'import type { StudioAsset } from "./studio-asset-library";')
    replace(originals, 'contentFingerprint: `original-svg:v1:${id}`,',
        'contentFingerprint: `original-svg:${category === "modern-background" ? "v1" : "v2"}:${id}`,')
    replace(originals, 'svg: wrapSvg(width, height, body),',
        'svg: wrapSvg(width, height, category === "daily-prop" || category === "genre-prop"\n'
        '      ? removeTrustedStarterBackdrop(body, width, height) : body),')
    replace(originals,
        '  return Array.from({ length: count }, (_, index) => {\n'
        '    const x = 12 + ((index * 67) % Math.max(12, width - 24));\n'
        '    const y = 12 + ((index * 43) % Math.max(12, height - 24));',
        '  return createStarterDotPositions(count, width, height, color).map(([x, y], index) => {')
    text = originals.read_text()
    for name in ['DAILY_PROP_ASSETS', 'ATMOSPHERE_ASSETS', 'GENRE_ASSETS']:
        old = f'includedItems: {name},\n      version: "1.0.0",'
        new = f'includedItems: {name},\n      version: "1.1.0",'
        if old in text: text = text.replace(old, new, 1)
        elif new not in text: raise ValueError('Package anchor moved:' + name)
    text = text.replace('releasedAt: "2026-07-26",', 'releasedAt: input.version === "1.0.0" ? "2026-07-26" : "2026-09-06",')
    text = text.replace('updatedAt: "2026-07-26T00:00:00.000Z",', 'updatedAt: input.version === "1.0.0" ? "2026-07-26T00:00:00.000Z" : "2026-09-06T00:00:00.000Z",')
    text = text.replace('changes: ["8개 생활 소품 원본 추가", "드래그 포인터 배치 지원"],', 'changes: ["소품 8종의 불투명 바탕 제거", "기존 에셋 ID·저장 작품 호환 유지"],')
    text = text.replace('changes: ["8개 투명 분위기 효과 추가", "배경 덮기 권장 프리셋 표기"],', 'changes: ["눈·보케·먼지의 대각선 반복 분포 개선", "결정적 분포로 다시 열어도 같은 모양 유지"],')
    text = text.replace('changes: ["8개 장르 소품 원본 추가", "CC0 라이선스 명세 포함"],', 'changes: ["장르 소품 8종의 불투명 바탕 제거", "기존 ID·CC0 라이선스 유지"],')
    originals.write_text(text)
    # Existing assertions specifically describe the selectable package version.
    test = DOMAIN / 'StudioOriginalAssetMarketplacePanel.test.tsx'
    test.write_text(test.read_text().replace('toContain("v1.0.0")', 'toContain("v1.1.0")'))

    catalog = DOMAIN / 'studio-cc0-asset-delivery.ts'
    replace(catalog, 'import type { StudioAsset } from "./studio-asset-library";',
        'import { selectStudioCuratedAssets } from "./studio-asset-visual-curation";\n\n'
        'import type { StudioAsset } from "./studio-asset-library";')
    replace(catalog, 'export interface StudioCc0Asset {',
        'export type StudioCc0AssetStyle = "detailed-pbr" | "stylized-low-poly" | "utility";\n'
        'export const STUDIO_CC0_STYLE_LABELS: Readonly<Record<StudioCc0AssetStyle, string>> = Object.freeze({\n'
        '  "detailed-pbr": "정밀 PBR", "stylized-low-poly": "로우폴리", utility: "효과·재질",\n});\n\n'
        'export interface StudioCc0Asset {')
    replace(catalog, '  readonly category: string;\n', '  readonly category: string;\n  readonly style: StudioCc0AssetStyle;\n  readonly sourceCategory: string;\n')
    replace(catalog, '    ids.add(asset.id);',
        '    const style = asset.style ?? (kind === "model" ? "stylized-low-poly" : "utility");\n'
        '    if (!["detailed-pbr", "stylized-low-poly", "utility"].includes(String(style))) throw new TypeError("알 수 없는 에셋 스타일입니다.");\n'
        '    if (asset.previewPath !== undefined) {\n'
        '      if (typeof asset.previewPath !== "string" || !/\\.(png|jpg|webp)$/u.test(asset.previewPath)) throw new TypeError("잘못된 미리보기 형식입니다.");\n'
        '      studioCc0AssetUrl(asset.previewPath);\n'
        '    }\n'
        '    const sourceCategory = typeof asset.sourceCategory === "string" ? asset.sourceCategory.slice(0, 100) : "";\n'
        '    ids.add(asset.id);')
    replace(catalog, 'return Object.freeze({id: asset.id, name: asset.name, kind, category: asset.category,',
        'return Object.freeze({id: asset.id, name: asset.name, kind, category: asset.category,\n'
        '      style: style as StudioCc0AssetStyle, sourceCategory,')
    replace(catalog, 'query: string, kind?: StudioCc0AssetKind): readonly StudioCc0Asset[]',
        'query: string, kind?: StudioCc0AssetKind, style?: StudioCc0AssetStyle): readonly StudioCc0Asset[]')
    replace(catalog, 'return assets.filter(asset => (!kind || asset.kind === kind) && terms.every(term =>',
        'return selectStudioCuratedAssets(assets).filter(asset => (!kind || asset.kind === kind) && (!style || asset.style === style) && terms.every(term =>')
    replace(catalog, '[asset.name, asset.category, STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? "", asset.provider]',
        '[asset.name, asset.category, asset.sourceCategory, STUDIO_CC0_STYLE_LABELS[asset.style], STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? "", asset.provider]')
    replace(catalog, 'return parseStudioCc0Catalog(JSON.parse(new TextDecoder().decode(bytes)) as unknown);',
        'return selectStudioCuratedAssets(parseStudioCc0Catalog(JSON.parse(new TextDecoder().decode(bytes)) as unknown))\n'
        '    .toSorted((a, b) => Number(b.style === "detailed-pbr") - Number(a.style === "detailed-pbr"));')

    panel = DOMAIN / 'StudioCc0AssetLibraryPanel.tsx'
    replace(panel, '  STUDIO_CC0_CATEGORY_LABELS,', '  STUDIO_CC0_CATEGORY_LABELS,\n  STUDIO_CC0_STYLE_LABELS,\n  type StudioCc0AssetStyle,')
    replace(panel, '  const [page, setPage] = useState(0);',
        '  const [style, setStyle] = useState<"all" | StudioCc0AssetStyle>("all");\n  const [page, setPage] = useState(0);')
    replace(panel, 'kind === "all" ? undefined : kind), [catalog, query, kind]',
        'kind === "all" ? undefined : kind, style === "all" ? undefined : style), [catalog, query, kind, style]')
    replace(panel, '        {loadError ? <div role="alert"',
        '        <label className="block text-xs text-fg-2">스타일\n'
        '          <select value={style} className={`${CONTROL} mt-1 w-full`} onChange={event => {setStyle(event.target.value as "all" | StudioCc0AssetStyle); setPage(0);}}>\n'
        '            <option value="all">모든 스타일</option>\n'
        '            {Object.entries(STUDIO_CC0_STYLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}\n'
        '          </select>\n        </label>\n'
        '        {loadError ? <div role="alert"')
    replace(panel, '3D는 로우폴리 스타일이며, GLB 파일을 받은 뒤',
        '정밀 PBR과 로우폴리를 구분해 선택합니다. GLB 파일을 받은 뒤')
    replace(panel, 'className="aspect-square w-full rounded-md bg-card object-contain"',
        'className="aspect-square w-full rounded-md object-contain" style={{backgroundColor: "#a8adb5", backgroundImage: "conic-gradient(#c8ccd2 25%, transparent 0 50%, #c8ccd2 0 75%, transparent 0)", backgroundSize: "24px 24px"}}')
    replace(panel, '{asset.provider} · CC0{asset.width && asset.height',
        '{STUDIO_CC0_STYLE_LABELS[asset.style]} · {(asset.bytes / 1048576).toFixed(1)} MB<br />{asset.provider} · CC0{asset.width && asset.height')
    replace(panel, '<p className="text-[0.65rem] leading-relaxed text-fg-3">출처와 라이선스, 파일 해시를 함께 보관합니다.',
        '<p className="text-[0.65rem] leading-relaxed text-fg-3">정적 미리보기 검수로 확인된 결함 1종과 회전 파생본 16종은 새 선택에서 제외했습니다. 원본 URL과 저장 작품 참조는 유지합니다. 출처와 라이선스, 파일 해시를 함께 보관합니다.')
    print('Applied selection-only quarantine, style discovery, transparent props and uncorrelated scatter.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    prepare()
