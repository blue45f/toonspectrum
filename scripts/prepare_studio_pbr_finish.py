#!/usr/bin/env python3
from pathlib import Path
from apply_studio_visual_curation import ROOT, replace_once, apply, record_visual_scope


def prepare_materials() -> None:
    p = ROOT / 'scripts/acquire_studio_pbr_assets.py'
    replace_once(p,
        "        return json.loads(self.read('https://api.polyhaven.com/files/'+identifier, 8*1024*1024))",
        "        files = json.loads(self.read('https://api.polyhaven.com/files/'+identifier, 8*1024*1024))\n"
        "        # Upstream uses Diffuse/Rough/Displacement alongside lower-case map keys.\n"
        "        normalized = {key.lower(): value for key, value in files.items()}\n"
        "        normalized['disp'] = normalized.get('disp', normalized.get('displacement', {}))\n"
        "        normalized['Diffuse'] = next((normalized[k] for k in ('diffuse','diff','albedo','color','col') if k in normalized), {})\n"
        "        return normalized")
    replace_once(p, 'def acquire(output: Path) -> None:',
        "def acquire(output: Path, kinds: tuple[str, ...] = ('models', 'textures')) -> None:")
    replace_once(p, "        for kind in ('models','textures'):", '        for kind in kinds:')
    replace_once(p, "parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()",
        "parser.add_argument('--output',type=Path,required=True);parser.add_argument('--kind',choices=['models','textures','all'],default='all');args=parser.parse_args()")
    replace_once(p, '    acquire(output)\n', "    acquire(output, ('models','textures') if args.kind=='all' else (args.kind,))\n")


def prepare_frontend() -> None:
    apply()
    creator = ROOT / 'src/domains/creator'
    tests = creator / 'studio-original-free-asset-packs.test.ts'
    replace_once(tests, 'expect(pkg.includedItems).toHaveLength(8);',
        'expect(pkg.includedItems).toHaveLength(pkg.id === "original-atmosphere-fx" ? 5 : 8);')
    replace_once(tests, '      categories: ["atmosphere-fx"],\n    })).toHaveLength(8);',
        '      categories: ["atmosphere-fx"],\n    })).toHaveLength(5);')
    tests = creator / 'StudioOriginalAssetMarketplacePanel.test.tsx'
    replace_once(tests, 'expect(html).toContain(\'data-studio-original-asset="original-night-bokeh"\');',
        'expect(html).not.toContain(\'data-studio-original-asset="original-night-bokeh"\');\n'
        '    expect(html).not.toContain(\'data-studio-original-asset="original-soft-snow-overlay"\');\n'
        '    expect(html).not.toContain(\'data-studio-original-asset="original-golden-dust"\');')

    p = creator / 'studio-cc0-asset-delivery.ts'
    replace_once(p, '  readonly sourceUrl: string;\n}',
        '  readonly sourceUrl: string;\n  readonly style: "pbr-detailed" | "stylized-low-poly" | "image";\n}')
    replace_once(p, '  furniture: "가구 · 실내 소품",',
        '  furniture: "가구 · 실내 소품",\n  lighting: "조명 · 가로등",\n  "daily-prop": "생활 · 문구 · 장식 소품",')
    replace_once(p, '      provider: license.provider, sourceUrl: license.sourceUrl});',
        '      provider: license.provider, sourceUrl: license.sourceUrl,\n'
        '      style: asset.style === "pbr-detailed" ? "pbr-detailed" : kind === "model" ? "stylized-low-poly" : "image"});')
    replace_once(p, '  return parseStudioCc0Catalog(JSON.parse(new TextDecoder().decode(bytes)) as unknown);',
        '  const parsed = parseStudioCc0Catalog(JSON.parse(new TextDecoder().decode(bytes)) as unknown);\n'
        '  return Object.freeze([...parsed].sort((a, b) => Number(b.style === "pbr-detailed") - Number(a.style === "pbr-detailed")));')
    replace_once(p, '    studioCc0AssetUrl(asset.path);\n    const kind',
        '    studioCc0AssetUrl(asset.path);\n'
        '    if (asset.previewPath !== undefined && (typeof asset.previewPath !== "string" || !/^previews\\/[a-zA-Z0-9_-]+\\.(?:png|jpg|webp)$/u.test(asset.previewPath))) {\n'
        '      throw new TypeError("미리보기는 검증된 내장 이미지 경로여야 합니다.");\n'
        '    }\n'
        '    const kind')
    p = creator / 'StudioCc0AssetLibraryPanel.tsx'
    replace_once(p, '  const [page, setPage] = useState(0);',
        '  const [page, setPage] = useState(0);\n  const [detailedOnly, setDetailedOnly] = useState(false);')
    replace_once(p,
        'filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind), [catalog, query, kind]',
        'filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind).filter(asset => !detailedOnly || asset.style === "pbr-detailed"), [catalog, query, kind, detailedOnly]')
    replace_once(p, '3D는 로우폴리 스타일이며, GLB 파일을 받은 뒤',
        'PBR 고정밀 소재와 로우폴리 소재를 구분해 제공합니다. 3D는 GLB 파일을 받은 뒤')
    replace_once(p, '        {loadError ? <div role="alert"',
        '        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg-2"><input type="checkbox" checked={detailedOnly} onChange={event => {setDetailedOnly(event.target.checked); setPage(0);}} />PBR 고정밀 소재만 보기</label>\n'
        '        {loadError ? <div role="alert"')
    replace_once(p, 'className="aspect-square w-full rounded-md bg-card object-contain"',
        'className="aspect-square w-full rounded-md bg-[#bfc5cf] object-contain"')
    replace_once(p, '{asset.provider} · CC0{asset.width',
        '{asset.provider} · CC0 · {asset.style === "pbr-detailed" ? "PBR 2K" : asset.kind === "model" ? "로우폴리" : "이미지"}{asset.width')
    record_visual_scope()
    print('Prepared source map normalization, detailed-first discovery, contrast and safe retirement.')


if __name__ == '__main__':
    prepare_materials()
    prepare_frontend()
