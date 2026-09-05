import json, pathlib
root=pathlib.Path('.').resolve()
changed=[]
def edit(name, fn):
    p=root/name; original=p.read_text(); text=fn(original)
    assert text!=original, f'no change: {name}'
    p.write_text(text); changed.append(name)
def once(text, old, new):
    assert text.count(old)==1, f'expected one patch match: {old[:90]!r}, got {text.count(old)}'
    return text.replace(old,new,1)
def new(name, content):
    p=root/name; assert not p.exists(), name; p.write_text(content); changed.append(name)
base='src/domains/creator/'
def browser(text):
    for key,label in [('genre','장르'),('quality','소재 구분'),('orientation','원본 비율'),('sort','정렬')]:
        old=f'<label className="flex min-w-0 flex-col gap-1 text-[0.66rem] text-fg-3" htmlFor={{`${{id}}-{key}`}}>{label}'
        new=f'<div className="flex min-w-0 flex-col gap-1 text-[0.66rem] text-fg-3"><label htmlFor={{`${{id}}-{key}`}}>{label}</label>'
        text=once(text,old,new)
        start=text.index(new); end=text.index('</label>',start+len(new)); text=text[:end]+'</div>'+text[end+8:]
    return text
edit(base+'Studio2dSceneBrowser.tsx',browser)
def preview(text):
    text=once(text,'  const dialogRef = useRef<HTMLElement>(null);','  const dialogRef = useRef<HTMLElement>(null);\n  const viewportRef = useRef<HTMLDivElement>(null);')
    text=once(text,'onClick={() => setPixelView((value) => !value)}','onClick={() => { setPixelView((value) => !value); if (!pixelView) viewportRef.current?.focus(); }}')
    return once(text,'<div className="max-h-[55dvh] overflow-auto rounded-lg bg-neutral-950" tabIndex={pixelView ? 0 : undefined}', '<div ref={viewportRef} role="region" className="max-h-[55dvh] overflow-auto rounded-lg bg-neutral-950" tabIndex={-1}')
edit(base+'Studio2dScenePreview.tsx',preview)
assets=json.loads((root/base/'studio-2d-asset-manifest.json').read_text())['assets']
def catalog(text):
    text=once(text,'  imgSrc?: string;\n}', '  imgSrc?: string;\n  width?: number;\n  height?: number;\n}')
    for asset in assets:
        old=f'imgSrc: "{asset["src"]}"'
        text=once(text,old,old+f', width: {asset["width"]}, height: {asset["height"]}')
    return text
edit(base+'studio-bg-scenes.ts',catalog)
def contract(text):
    old='export type StudioBgScene = {\n  id: string;\n  label: string;\n  genre: string;\n  svg?: string;\n  imgSrc?: string;\n};'
    return once(text,old,old.replace('  imgSrc?: string;','  imgSrc?: string;\n  width?: number;\n  height?: number;'))
edit(base+'StudioToolBeltContent.tsx',contract)
edit(base+'studio-2d-asset-quality.ts',lambda t:once(t,'  readonly svg?: string;','  readonly svg?: string;\n  readonly width?: number;\n  readonly height?: number;'))
new(base+'studio-2d-source-size.ts','''/** Lightweight placement contract: no image/catalog import in the editor shell. */
export function studio2dSourceSize(source: { readonly width?: number; readonly height?: number }): { width: number; height: number } {
  const { width, height } = source;
  if (typeof width === "number" && typeof height === "number"
    && Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0 && width <= 8192 && height <= 8192
    && width * height <= 36_000_000) return { width, height };
  // Existing vectors and third-party legacy scene packs retain their 720x1080 contract.
  return { width: 720, height: 1080 };
}
''')
def host(text):
    assert 'import { studio2dSourceSize }' not in text
    text='import { studio2dSourceSize } from "./studio-2d-source-size";\n'+text
    start=text.index('  function addBgScene(bg: StudioBgScene) {')
    end=text.index('\n  // AI로 생성된 배경',start)
    part=text[start:end]
    part=once(part,'    const el = createCanvasImageElement({','    const sourceSize = studio2dSourceSize(bg);\n    const el = createCanvasImageElement({')
    part=once(part,'      sourceWidth: 720,\n      sourceHeight: 1080,','      sourceWidth: sourceSize.width,\n      sourceHeight: sourceSize.height,')
    return text[:start]+part+text[end:]
edit(base+'StudioCuttoonEditorHost.tsx',host)
new(base+'studio-2d-source-size.test.ts','''import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_2D_ASSET_METADATA } from "./studio-2d-asset-quality";
import { studio2dSourceSize } from "./studio-2d-source-size";
import { BG_SCENES } from "./studio-bg-scenes";
import { createCanvasImageElement } from "./studio-image-placement";

describe("2D original aspect ratio through canvas placement", () => {
  it("carries all 29 original dimensions through the real catalog", () => {
    for (const asset of STUDIO_2D_ASSET_METADATA) {
      const scene = BG_SCENES.find((entry) => entry.id === asset.id)!;
      expect(studio2dSourceSize(scene)).toEqual({ width: asset.width, height: asset.height });
      const image = createCanvasImageElement({ id: scene.id, src: scene.imgSrc!, canvasWidth: 720,
        canvasHeight: 1080, sourceWidth: scene.width!, sourceHeight: scene.height!, horizontalInset: 0, minY: 0 });
      expect(Math.abs(image.height - image.width * asset.height / asset.width)).toBeLessThanOrEqual(1);
    }
  });
  it("places a landscape original as a landscape image, not a stretched portrait", () => {
    const scene = BG_SCENES.find((entry) => entry.id === "webtoon-rooftop-sunset")!;
    const size = studio2dSourceSize(scene);
    const image = createCanvasImageElement({ id: scene.id, src: scene.imgSrc!, canvasWidth: 720,
      canvasHeight: 1080, sourceWidth: size.width, sourceHeight: size.height, horizontalInset: 0, minY: 0 });
    expect(image.width).toBe(720); expect(image.height).toBe(405);
  });
  it("retains the legacy vector placement contract", () => {
    for (const scene of BG_SCENES.filter((entry) => !entry.imgSrc)) {
      expect(studio2dSourceSize(scene)).toEqual({ width: 720, height: 1080 });
    }
  });
  it.each([{ width: NaN, height: 1000 }, { width: Infinity, height: 1000 }, { width: 1000 },
    { width: 0, height: 1000 }, { width: -5, height: 1000 }, { width: 1000.5, height: 1000 },
    { width: 8193, height: 1 }, { width: 8192, height: 8192 }])("rejects unsafe or partial dimensions: %j", (source) => {
    expect(studio2dSourceSize(source)).toEqual({ width: 720, height: 1080 });
  });
  it("connects source dimensions to the production addBgScene path without eager catalog imports", () => {
    const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const insertion = host.slice(host.indexOf("function addBgScene(bg:"), host.indexOf("function insertAiBackgroundImage("));
    expect(insertion).toContain("studio2dSourceSize(bg)");
    expect(insertion).toContain("sourceWidth: sourceSize.width");
    expect(insertion).toContain("sourceHeight: sourceSize.height");
    expect(host).not.toMatch(/import[^;]*from ["']\\.\\/studio-2d-asset-(?:quality|manifest)/u);
  });
});
''')
def smoke(text):
    text=once(text,"import '../src/styles/globals.css';", "import {studio2dSourceSize} from '../src/domains/creator/studio-2d-source-size';\nimport {createCanvasImageElement} from '../src/domains/creator/studio-image-placement';\nimport '../src/styles/globals.css';")
    text=once(text,"const[picks,setPicks]=useState<string[]>([]);", "const[picks,setPicks]=useState<string[]>([]);const[placed,setPlaced]=useState('');")
    text=once(text,"<output data-testid=\"picked\">{picks.join(',')}</output>","<output data-testid=\"picked\">{picks.join(',')}</output><output data-testid=\"placed\" hidden>{placed}</output>")
    text=once(text,"onPick={s=>setPicks(p=>[...p,s.id])}","onPick={s=>{setPicks(p=>[...p,s.id]);const size=studio2dSourceSize(s);setPlaced(JSON.stringify(createCanvasImageElement({id:s.id,src:s.imgSrc??'',canvasWidth:720,canvasHeight:1080,sourceWidth:size.width,sourceHeight:size.height,horizontalInset:0,minY:0})));}}")
    text=once(text,'    await page.getByLabel("장르", { exact: true }).selectOption("로맨스");','    await page.screenshot({ path: path.join(evidence, `${viewport.name}-recommended.png`), fullPage: true });\n    await page.getByLabel("장르", { exact: true }).selectOption("로맨스");')
    text=once(text,'    for (let index = 0; index < 8; index += 1) {','    await expect(dialog.getByRole("region", { name: "배경 원본 이미지 영역" })).toBeFocused();\n    await page.keyboard.press("ArrowRight");\n    await expect.poll(() => dialog.getByRole("region", { name: "배경 원본 이미지 영역" }).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);\n    for (let index = 0; index < 8; index += 1) {')
    text=once(text,'    await expect(page.getByTestId("picked")).toHaveText(rooftop.id);','    await expect(page.getByTestId("picked")).toHaveText(rooftop.id);\n    const placed = JSON.parse(await page.getByTestId("placed").textContent());\n    assert.deepEqual([placed.width, placed.height], [720, 405], "canvas aspect ratio");')
    return text
edit('scripts/studio-2d-browser-smoke.mjs',smoke)
def doc(text):
    text=once(text,'https://www.acon3d.com/en/eula','https://www.acon3d.com/policy/eula')
    text=once(text,'https://assets.clip-studio.com/en-us/information/terms','https://assets.clip-studio.com/en-us/information/terms/detail')
    text=once(text,'나머지는 연락판 수준 검수','나머지는 전체 목록 미리보기 수준 검수')
    return once(text,'배경 채우기·톤·3D 편집 및 기존 프로젝트 저장 형식은 변경하지 않았다.', '프레임이 없는 캔버스에 삽입할 때도 카탈로그의 실제 원본 크기를 전달한다. 가로 원본까지 720×1080으로 계산하던 문제를 수정했으며, 기존 벡터·크기 정보가 없는 구형 소재는 이전 크기 규칙을 유지한다.\n\n배경 채우기·톤·3D 편집 및 기존 프로젝트 저장 형식은 변경하지 않았다.')
edit('docs/studio-2d-asset-quality-2026-09-06.md',doc)
(root/'artifacts/studio-2d').mkdir(parents=True,exist_ok=True)
(root/'artifacts/studio-2d/finalized-paths.json').write_text(json.dumps(changed))
print(json.dumps(changed,indent=2))
