import hashlib
import lzma
from pathlib import Path
import subprocess
import tempfile

root = Path('.')
transport = root / '.github/storyworld-transport-20260905'
patch = lzma.decompress(b''.join((transport / f'part-{i:03d}').read_bytes() for i in range(6)), memlimit=256 * 1024 * 1024)
assert len(patch) == 215215
assert hashlib.sha256(patch).hexdigest() == '863bc8cfe7c50d94eef43fc5d13e42c6ef096b7e77f958e9ba912644d03527dd'
router_dir = root / 'src/domains/creator/studio-router'
for filename, expected in {
    'StudioRouter.tsx': 'cb5748925e3f3fd28eed86cb1789e1d9df6f3846',
    'studio-route-manifest.ts': 'fffb31704ecd03dbf7c257e14e42558b922fc989',
    'studio-route-manifest.test.ts': 'eaf3a0f9116b82d5a288dfd54b495ee6784f7ef1',
}.items():
    content = (router_dir / filename).read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
    assert actual == expected, f'{filename}: source moved, refusing a blind replacement'
with tempfile.NamedTemporaryFile(suffix='.patch') as f:
    f.write(patch)
    f.flush()
    common = ['git', 'apply', '--whitespace=error', '--exclude=src/domains/creator/studio-router/*']
    subprocess.run([*common, '--check', f.name], check=True)
    subprocess.run([*common, f.name], check=True)

def replace_once(text, old, new):
    assert text.count(old) == 1, f'Expected unique integration seam: {old[:120]}'
    return text.replace(old, new, 1)

manifest_path = router_dir / 'studio-route-manifest.ts'
manifest = manifest_path.read_text()
manifest = replace_once(manifest, '  | "placeholder"\n  | "publish";', '  | "placeholder"\n  | "storyworld"\n  | "publish";')
manifest = replace_once(manifest, '    id: "studio-companion",', '    id: "studio-storyworld",\n    kind: "storyworld",\n    ownsDocumentTitle: true,\n    pattern: "/studio/(work/:workId|remix/:sourceWorkId)?/storyworld",\n  },\n  {\n    id: "studio-companion",')
manifest = replace_once(manifest, 'export type StudioPlaceholderRouteId =', '''export interface StudioStoryworldRouteResolution extends StudioResolvedRouteBase {
  readonly kind: "storyworld";
  readonly remixSourceWorkId: string | null;
  readonly workId: string | null;
}

export type StudioPlaceholderRouteId =''')
manifest = replace_once(manifest, '  | StudioPlaceholderRouteResolution\n  | StudioPublishRouteResolution;', '  | StudioPlaceholderRouteResolution\n  | StudioStoryworldRouteResolution\n  | StudioPublishRouteResolution;')
resolver = '''function storyworldPathname(workId: string | null, remixSourceWorkId: string | null): string {
  if (workId !== null) return `/studio/work/${encodeURIComponent(workId)}/storyworld`;
  if (remixSourceWorkId !== null) return `/studio/remix/${encodeURIComponent(remixSourceWorkId)}/storyworld`;
  return "/studio/storyworld";
}

function resolveStoryworld(
  pathname: string,
  search: string | URLSearchParams | undefined,
): StudioStoryworldRouteResolution | StudioInvalidRouteResolution | null {
  const segments = normalizedSegments(pathname);
  if (segments === null) return invalidResolution(pathname, search, "invalid-path");
  let probePathname: string;
  if (segments.length === 2 && segments[1] === "storyworld") {
    probePathname = "/studio";
  } else if (
    segments.length === 4
    && (segments[1] === "work" || segments[1] === "remix")
    && segments[3] === "storyworld"
  ) {
    probePathname = `/studio/${segments[1]}/${segments[2]}/canvas`;
  } else {
    return null;
  }
  const workspace = parseStudioWorkspaceRoute({ pathname: probePathname, search });
  if (!workspace.valid) return invalidResolution(pathname, search, workspace);
  if (workspace.presentation !== "editor") return invalidResolution(pathname, search, "invalid-mode");
  const canonicalPathname = storyworldPathname(workspace.workId, workspace.remixSourceWorkId);
  return Object.freeze({
    canonicalHref: href(canonicalPathname, cleanIdentityQuery(search)),
    canonicalPathname,
    kind: "storyworld",
    lifecycleKey: `/studio/${studioWorkspaceDocumentIdentity(workspace)}/storyworld`,
    ownsDocumentTitle: true,
    remixSourceWorkId: workspace.remixSourceWorkId,
    workId: workspace.workId,
  });
}

'''
manifest = replace_once(manifest, 'function resolvePlaceholder(', resolver + 'function resolvePlaceholder(')
manifest = replace_once(manifest, '  if (lift3d !== null) return lift3d;', '  if (lift3d !== null) return lift3d;\n  const storyworld = resolveStoryworld(pathname, search);\n  if (storyworld !== null) return storyworld;')
manifest_path.write_text(manifest)
router_path = router_dir / 'StudioRouter.tsx'
router = router_path.read_text()
router = replace_once(router, 'export function StudioRouter() {', '''const StudioStoryworldLabPage = lazyRetry(
  () => import("../storyworld/StudioStoryworldLabPage").then((module) => ({
    default: module.StudioStoryworldLabPage,
  })),
  "StudioStoryworldLabPage",
);

export function StudioRouter() {''')
router = replace_once(router, '    case "companion":', '''    case "storyworld":
      return (
        <Suspense fallback={<StudioRouteLoading label="스토리월드 인과관계 랩을 여는 중..." />}>
          <StudioStoryworldLabPage
            key={resolution.lifecycleKey}
            remixSourceWorkId={resolution.remixSourceWorkId}
            workId={resolution.workId}
          />
        </Suspense>
      );
    case "companion":''')
router_path.write_text(router)
test_path = router_dir / 'studio-route-manifest.test.ts'
test = replace_once(test_path.read_text(), 'new Set(STUDIO_ROUTE_MANIFEST.map((route) => route.kind)).size).toBe(5)', 'new Set(STUDIO_ROUTE_MANIFEST.map((route) => route.kind)).size).toBe(6)')
test_path.write_text(test)
(router_dir / 'studio-storyworld-route.test.ts').write_text('''import { describe, expect, it } from "vitest";

import { resolveStudioRoute, studioRouteOwnsDocumentTitle } from "./studio-route-manifest";

describe("Storyworld route integration", () => {
  it.each([
    ["/studio/storyworld", "", "/studio/storyworld", "/studio/draft/storyworld", null, null],
    ["/studio/storyworld/", "", "/studio/storyworld", "/studio/draft/storyworld", null, null],
    ["/studio/storyworld", "?id=work-1&room=team-a", "/studio/work/work-1/storyworld?room=team-a", "/studio/work:work-1/storyworld", "work-1", null],
    ["/studio/work/work-1/storyworld", "", "/studio/work/work-1/storyworld", "/studio/work:work-1/storyworld", "work-1", null],
    ["/studio/remix/source-1/storyworld", "?room=team-a", "/studio/remix/source-1/storyworld?room=team-a", "/studio/remix:source-1/storyworld", null, "source-1"],
    ["/studio/storyworld", "?remix=source-1", "/studio/remix/source-1/storyworld", "/studio/remix:source-1/storyworld", null, "source-1"],
  ] as const)("canonicalizes %s%s without borrowing another document", (pathname, search, canonicalHref, lifecycleKey, workId, remixSourceWorkId) => {
    expect(resolveStudioRoute({ pathname, search })).toMatchObject({ kind: "storyworld", canonicalHref, lifecycleKey, workId, remixSourceWorkId });
  });

  it.each([
    ["/studio/storyworld", "?mode=upload"],
    ["/studio/storyworld", "?id=work-1&remix=source-1"],
    ["/studio/work/work-1/storyworld", "?id=work-2"],
    ["/studio/remix/source-1/storyworld", "?remix=source-2"],
    ["/studio/work/%2F/storyworld", ""],
    ["/studio/storyworld/extra", ""],
  ] as const)("rejects conflicting or invalid Storyworld routes %s%s", (pathname, search) => {
    expect(resolveStudioRoute({ pathname, search }).kind).toBe("invalid");
  });

  it("owns its title and has distinct document lifetimes", () => {
    expect(studioRouteOwnsDocumentTitle({ pathname: "/studio/storyworld" })).toBe(true);
    const first = resolveStudioRoute({ pathname: "/studio/work/first/storyworld" });
    const second = resolveStudioRoute({ pathname: "/studio/work/second/storyworld" });
    expect(first.lifecycleKey).not.toBe(second.lifecycleKey);
  });
});
''')
page_path = root / 'src/domains/creator/storyworld/StudioStoryworldLabPage.tsx'
page = page_path.read_text()
page = replace_once(page, 'to={backHref}', 'href={backHref}')
page = replace_once(page, '<input accept="application/json,.json"', '<input aria-label="스토리월드 JSON 가져오기" accept="application/json,.json"')
page = replace_once(page, '  adapter: "기존 기능 연계",', '  adapter: "연계 설계",')
page = replace_once(page, 'function parseStoryworldProject(text: string): StoryworldProject {', '''function parseStoryworldProject(text: string): StoryworldProject {
  if (text.length > 1_000_000) throw new Error("스토리월드 JSON은 1MB 이하여야 합니다.");''')
page = replace_once(page, '  value.characters.forEach((item, index) =>', '''  if (value.characters.length > 64 || value.facts.length > 512 || value.scenes.length > 256) {
    throw new Error("로컬 분석 한도는 인물 64명, 사실 512개, 장면 256개입니다.");
  }
  value.characters.forEach((item, index) =>''')
page = replace_once(page, '      const next = parseStoryworldProject(await file.text());', '''      if (file.size > 1_000_000) throw new Error("스토리월드 JSON은 1MB 이하여야 합니다.");
      const next = parseStoryworldProject(await file.text());''')
page = replace_once(page, '<small>{project.scenes.length}개 장면', '<small>{project.id === STORYWORLD_DEMO_PROJECT.id ? "예시 데이터 · " : "로컬 실험 · "}{project.scenes.length}개 장면')
page = replace_once(page, '<span className="storyworld-eyebrow">{documentScope}</span>', '<span className="storyworld-eyebrow">{documentScope} · 캔버스 원고와 자동 연결되지 않은 로컬 실험</span>')
page_path.write_text(page)
print('Reviewed source applied; full live router and all existing route tests preserved.')
