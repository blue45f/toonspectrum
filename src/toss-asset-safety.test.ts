// 토스 WebView(교차 출처) 자산 경로 안전 계약 테스트.
//
// 배경: 토스 인앱은 웹 앱을 별도 오리진 WebView 로 띄우므로, root-relative(`/images/..`,
// `/icon-192.png` 등) 이미지·미디어 경로를 그대로 <img src> 나 CSS url() 에 넣으면 토스
// 오리진으로 해석돼 404 → 그림이 깨진다(2026-07 운세 아바타·타로·스플래시 로고 사고).
// 해법: 정적 자산 참조는 resolveAssetUrl()(src/catalog-static.ts) 을 거쳐야 한다
// (웹=no-op, 토스=배포 오리진으로 절대화).
//
// 이 테스트가 강제하는 범위(정적으로 확실히 잡히는 것): **리터럴** root-relative 참조
//  - JSX `<img src="/images/..">`  ·  인라인 CSS `url('/..')`(backgroundImage 등)
//  이 서브클래스가 2026-07 아이콘(/icon-192.png)·타로 카드 뒷면 사고의 형태였다.
//
// 이 테스트가 못 잡는 것(정적 한계, 별도 규율): **변수형** 참조
//  - `<img src={character.avatarUrl}>` 처럼 값이 백엔드 API 데이터(예: "/images/characters/ara.jpg")
//    에서 오는 경우. 합법적 절대 URL(API 커버)과 정적으로 구분 불가라 소비 <img> 에서
//    resolveAssetUrl 로 감싸는 규율(운세 아바타 수정 방식)로 지킨다. 새 <img src={데이터필드}>
//    를 추가할 땐 그 필드가 root-relative 를 담을 수 있는지 확인할 것.
//
// 예외: fetch 경로(installStaticCatalog 글로벌 fetch 패치가 /api·/data·/vrm 재작성)·라우터
// 링크(href/to)는 대상 아님 — 정규식이 <img src>·url() 리터럴만 노린다. 정당한 예외는 해당
// 라인에 `asset-safe` 주석을 달아 통과시킨다.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

// 스캔 대상 — 웹·토스가 공유하는 렌더 코드.
const SCAN_DIRS = ["src", "components"] as const;
// 스캔에서 제외 — 테스트·타입정의·자산해소 로직 자체·빌드산출물.
const SKIP_DIR = new Set(["node_modules", "dist", "__tests__", ".vite"]);
function skipFile(rel: string): boolean {
  return (
    rel.endsWith(".test.ts") ||
    rel.endsWith(".test.tsx") ||
    rel.endsWith(".d.ts") ||
    rel.endsWith("catalog-static.ts") // resolveAssetUrl 정의·fetch 패치 본체
  );
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      walk(full, acc);
    } else if ((entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) && !skipFile(relative(REPO_ROOT, full))) {
      acc.push(full);
    }
  }
  return acc;
}

// root-relative <img src>(문자열 리터럴) — 정당하면 asset-safe 주석으로 예외.
const IMG_SRC_LITERAL = /\bsrc=\{?["'`]\/[a-zA-Z]/;
// 인라인 style 의 CSS url('/..') — backgroundImage 등.
const CSS_URL_LITERAL = /url\(\s*["']?\/[a-zA-Z]/;

interface Violation {
  file: string;
  line: number;
  kind: string;
  text: string;
}

function scan(): Violation[] {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
  const out: Violation[] = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((raw, i) => {
      if (raw.includes("resolveAssetUrl") || raw.includes("asset-safe")) return;
      const trimmed = raw.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return; // 주석 라인
      if (IMG_SRC_LITERAL.test(raw)) out.push({ file: rel, line: i + 1, kind: "img src root-relative", text: trimmed.slice(0, 100) });
      else if (CSS_URL_LITERAL.test(raw)) out.push({ file: rel, line: i + 1, kind: "css url() root-relative", text: trimmed.slice(0, 100) });
    });
  }
  return out;
}

describe("토스 WebView 자산 경로 안전 계약", () => {
  it("root-relative <img src>·CSS url() 는 반드시 resolveAssetUrl 을 거친다", () => {
    const violations = scan();
    const report = violations.map((v) => `  ${v.file}:${v.line} [${v.kind}] ${v.text}`).join("\n");
    expect(
      violations,
      violations.length === 0
        ? ""
        : `토스 WebView 에서 깨질 root-relative 자산 참조가 있습니다. resolveAssetUrl() 로 감싸거나 정당하면 라인에 'asset-safe' 주석을 다세요:\n${report}`
    ).toHaveLength(0);
  });

  it("스캔이 실제로 파일을 순회한다(계약 자체가 무력화되지 않게)", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
    // 렌더 코드가 수백 개는 되므로 하한을 넉넉히 둔다 — 0/소수면 walk 가 깨진 것.
    expect(files.length).toBeGreaterThan(100);
  });
});
