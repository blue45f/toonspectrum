import json
from pathlib import Path
root=Path.cwd()
changed=[]
def edit(name,fn):
    p=root/name; old=p.read_text(); new=fn(old)
    assert old!=new,name
    p.write_text(new);changed.append(name)
def once(s,a,b):
    assert s.count(a)==1,(a[:80],s.count(a))
    return s.replace(a,b,1)
def browser(s):
    s=once(s,'useMemo, useState','useMemo, useRef, useState')
    s=once(s,'  const id = useId();','  const id = useId();\n  const gridRef = useRef<HTMLDivElement>(null);')
    s=once(s,'  useEffect(() => { setVisibleCount(48); }, [query, activeGenre, quality, orientation, sort, emptySceneOnly]);','  useEffect(() => {\n    setVisibleCount(48);\n    if (gridRef.current) gridRef.current.scrollTop = 0;\n  }, [query, activeGenre, quality, orientation, sort, emptySceneOnly]);')
    s=once(s,'overflow-hidden bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent dark:bg-neutral-900','overflow-hidden bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent')
    return once(s,'    <div className={cn("grid max-h-', '    <div ref={gridRef} data-studio-2d-grid="true" className={cn("grid max-h-')
edit('src/domains/creator/Studio2dSceneBrowser.tsx',browser)
def tests(s):
    s=once(s,'import { BG_SCENES, groupBgScenes } from "./studio-bg-scenes";','import { BG_SCENES, groupBgScenes } from "./studio-bg-scenes";\nimport { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra";')
    s=once(s,'const groups = groupBgScenes(BG_SCENES);','const groups = groupBgScenes([...BG_SCENES, ...BG_SCENES_EXTRA]);')
    return once(s,'describe("2D scene browser", () => {','''describe("2D scene browser", () => {
  it("pages the complete production catalog without counting any scene twice", () => {
    render(<Harness />);
    expect(screen.getByRole("status").textContent).toBe("64개 장면");
    expect(document.querySelectorAll("[data-studio-2d-asset]")).toHaveLength(48);
    fireEvent.click(screen.getByRole("button", { name: "장면 더 보기 (16개 남음)" }));
    const ids = [...document.querySelectorAll("[data-studio-2d-asset]")].map((node) => node.getAttribute("data-studio-2d-asset"));
    expect(ids).toHaveLength(64);
    expect(new Set(ids).size).toBe(64);
    expect(screen.queryByRole("button", { name: /장면 더 보기/u })).toBeNull();
  });
  it("returns to the first results when filters or search change after scrolling", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "장면 더 보기 (16개 남음)" }));
    const grid = document.querySelector<HTMLElement>("[data-studio-2d-grid]")!;
    grid.scrollTop = 800;
    fireEvent.change(screen.getByLabelText("소재 구분"), { target: { value: "recommended" } });
    expect(grid.scrollTop).toBe(0);
    expect(document.querySelectorAll("[data-studio-2d-asset]")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(document.querySelectorAll("[data-studio-2d-asset]")).toHaveLength(48);
    expect(screen.getByRole("button", { name: "장면 더 보기 (16개 남음)" })).toBeTruthy();
  });''')
edit('src/domains/creator/Studio2dSceneBrowser.test.tsx',tests)
def smoke(s):
    s=once(s,"import {BG_SCENES,groupBgScenes} from '../src/domains/creator/studio-bg-scenes';", "import {BG_SCENES,groupBgScenes} from '../src/domains/creator/studio-bg-scenes';\nimport {BG_SCENES_EXTRA} from '../src/domains/creator/studio-bg-scenes-extra';")
    s=once(s,'const groups=groupBgScenes(BG_SCENES);','const groups=groupBgScenes([...BG_SCENES,...BG_SCENES_EXTRA]);')
    s=once(s,'    await expect(page.locator("[data-studio-2d-asset]")).toHaveCount(46);','''    await expect(page.locator("[data-studio-2d-asset]")).toHaveCount(48);
    await expect(page.getByRole("status")).toHaveText("64개 장면");
    await page.getByRole("button", { name: "장면 더 보기 (16개 남음)", exact: true }).click();
    await expect(page.locator("[data-studio-2d-asset]")).toHaveCount(64);''')
    s=once(s,'    await expect(page.locator("[data-studio-2d-asset]")).toHaveCount(5);','''    await expect(page.locator("[data-studio-2d-asset]")).toHaveCount(5);
    await expect.poll(() => page.locator("[data-studio-2d-grid]").evaluate((element) => element.scrollTop)).toBe(0);''')
    return once(s,'assertions: "filters, native decode','assertions: "complete 64-scene catalog, pagination, filter scroll reset, filters, native decode')
edit('scripts/studio-2d-browser-smoke.mjs',smoke)
def doc(s):
    s=once(s,'다섯 추천 장면(창작자 방, 달빛 숲길, 네온 골목, 왕실, 노을 옥상)은 전체 이미지를 확대하여 확인했다. 나머지는 전체 목록 미리보기 수준 검수이며 작은 원본을 고해상도 추천으로 올리지 않는다.', '다섯 추천 장면(창작자 방, 달빛 숲길, 네온 골목, 왕실, 노을 옥상)은 전체 이미지를 확대하여 확인했다. 큰 원본 9개 모두 전체 이미지를 추가 확인했지만, 교실·카페·거리의 문자·인물·상표 등 주의사항이 있어 추천 수를 늘리지 않았다. 나머지 소형 원본은 전체 목록 미리보기 수준 검수이며 작은 원본을 고해상도 추천으로 올리지 않는다. 매니페스트의 검수 방식 기록은 최초 검수 기준이므로 후속 추가 검수 범위를 부풀리지 않는다.')
    return once(s,'섬네일은 원본 비율을 보존한다.', '기존 래스터 29개와 벡터 35개를 합한 실제 64개 장면 카탈로그를 사용한다. 한 번에 48개를 표시하며 더 보기를 눌러 나머지 장면을 탐색한다. 필터 변경 시 목록 스크롤과 표시 수를 초기화한다.\n\n섬네일은 원본 비율을 보존한다.')
edit('docs/studio-2d-asset-quality-2026-09-06.md',doc)
p=root/'artifacts/studio-2d/finalized-paths.json'
paths=json.loads(p.read_text())
p.write_text(json.dumps(list(dict.fromkeys([*paths,*changed]))))
print('Complete production catalog and filter-scroll regression coverage added.')
