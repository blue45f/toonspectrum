import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function replaceAllRequired(path, search, replacement, minimum = 1) {
  const source = read(path);
  const count = source.split(search).length - 1;
  if (count < minimum) {
    throw new Error(`${path}: expected at least ${minimum} occurrence(s) of ${JSON.stringify(search)}, found ${count}`);
  }
  write(path, source.split(search).join(replacement));
  return count;
}

function replaceAllOptional(path, search, replacement) {
  const source = read(path);
  if (!source.includes(search)) return 0;
  const count = source.split(search).length - 1;
  write(path, source.split(search).join(replacement));
  return count;
}

function replaceExactRequired(path, search, replacement) {
  const source = read(path);
  const first = source.indexOf(search);
  if (first < 0) {
    throw new Error(`${path}: exact replacement source not found`);
  }
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${path}: exact replacement source was not unique`);
  }
  write(path, source.slice(0, first) + replacement + source.slice(first + search.length));
}

function assertAbsent(path, search) {
  const source = read(path);
  if (source.includes(search)) {
    throw new Error(`${path}: obsolete marker remains: ${JSON.stringify(search)}`);
  }
}

function replaceLeadingDoc(path, nextDoc) {
  const source = read(path);
  if (!source.startsWith("/**\n")) throw new Error(`${path}: leading documentation block missing`);
  const end = source.indexOf("*/\n");
  if (end < 0) throw new Error(`${path}: leading documentation block is unterminated`);
  write(path, `${nextDoc.trimEnd()}\n${source.slice(end + 3)}`);
}

function moveToolBeltInsertBeforeReference() {
  const path = "src/domains/creator/StudioToolBeltCreateModeGroups.tsx";
  let source = read(path);
  const insertStart = '      {studioUiDensityAllows(uiDensityMode, "toolbar-insert") ? (';
  const utilityAnchor = "\n\n      <StudioToolBeltCreateModeUtilityButtons";
  const referenceAnchor = '      {studioUiDensityAllows(uiDensityMode, "toolbar-reference") ? (';
  const start = source.indexOf(insertStart);
  const end = source.indexOf(utilityAnchor, start);
  const reference = source.indexOf(referenceAnchor);
  if (start < 0 || end < 0 || reference < 0) {
    throw new Error(`${path}: could not locate insert/reference/utility blocks`);
  }
  if (start < reference) {
    throw new Error(`${path}: insert block already precedes reference; bootstrap should run once`);
  }
  const block = source.slice(start, end);
  source = source.slice(0, start) + source.slice(end);
  const nextReference = source.indexOf(referenceAnchor);
  source = source.slice(0, nextReference) + `${block}\n\n` + source.slice(nextReference);
  write(path, source);
}

// Remove the retired catch-all Tools title from the live caller rather than accepting dead labels.
replaceAllRequired(
  "src/domains/creator/StudioMenubarContent.tsx",
  'const compositeMenuLabel = (id: "insert" | "tools"): string | undefined => {',
  'const compositeMenuLabel = (id: "insert"): string | undefined => {',
);
replaceAllRequired(
  "src/domains/creator/StudioMenubarContent.tsx",
  'labels: { insert: compositeMenuLabel("insert"), tools: compositeMenuLabel("tools") },',
  'labels: { insert: compositeMenuLabel("insert") },',
);

replaceLeadingDoc(
  "src/domains/creator/StudioMainMenu.tsx",
  `/**
 * StudioMainMenu — ToonStudio's desktop application menubar.
 *
 * The workflow presentation supplies nine titles in one row:
 * 파일 · 편집 · 보기 · 삽입 · 레이어 · 그리기 · 만화 · 효과 · 도움말.
 * File, Edit, View, Insert, Comic and Effects are composite dropdowns whose source
 * catalogue groups remain visible as named role="group" sections. Rows keep a flat
 * menuitem order so arrow-key navigation crosses section boundaries naturally.
 *
 * Menus portal to document.body with fixed coordinates, switch on neighbouring-title
 * hover/click like a desktop editor, and implement a WAI-ARIA menubar with one roving
 * tab stop. Help remains last; unknown future catalogue groups are placed immediately
 * before it by the presentation layer instead of being dropped.
 */`,
);
replaceAllOptional(
  "src/domains/creator/studio-main-menu-model.ts",
  "Caption drawn above this row when a composite title (삽입·도구) presents rows",
  "Caption drawn above this row when a workflow composite presents rows",
);

// Browser verifier: pin the new nine-title contract while continuing to derive all rows.
replaceLeadingDoc(
  "scripts/verify-studio-menus.mts",
  `/**
 * scripts/verify-studio-menus.mts
 * Desktop headless check: Studio application menus + left rail + menu-driven popovers.
 *
 * Desktop IA (workflow optimization 2026-09-05):
 * - Catalogue: 17 specification groups + AI remains the complete command inventory.
 * - Presentation: nine workflow titles. Fifteen catalogue groups are owned by six
 *   composites: 파일←파일·협업, 편집←편집·선택·변형, 보기←보기·캔버스·창,
 *   삽입←텍스트·벡터·3D, 만화←만화·애니메이션, 효과←필터·AI.
 * - Every source group keeps its caption, command ids and row labels.
 * - Toolbelt is parked off-screen on lg+ but still mounts menu-driven popovers.
 *
 * Run: pnpm exec tsx scripts/verify-studio-menus.mts
 * Expects production build in dist/ (vite preview).
 */`,
);
replaceExactRequired(
  "scripts/verify-studio-menus.mts",
  `/**
 * Korean menubar titles for the two composite groups. \`COMPOSITE_LABELS\` in
 * \`src/domains/creator/studio-main-menu-presentation.ts\` owns these strings but does not
 * export them; the ids and the fold itself are imported from that module, so only the
 * two words are restated here.
 */
const COMPOSITE_TITLES: Readonly<Record<StudioMainMenuCompositeGroupId, string>> = {
  insert: "삽입",
  tools: "도구",
};`,
  `/** Visible Korean titles for the six workflow composites. */
const COMPOSITE_TITLES: Readonly<Record<StudioMainMenuCompositeGroupId, string>> = {
  file: "파일",
  edit: "편집",
  view: "보기",
  insert: "삽입",
  comic: "만화",
  filter: "효과",
};`,
);
replaceAllOptional(
  "scripts/verify-studio-menus.mts",
  "`true` when several catalogue groups share this title (삽입 / 도구).",
  "`true` when several catalogue groups share this workflow title.",
);
replaceExactRequired(
  "scripts/verify-studio-menus.mts",
  `/**
 * 메뉴바 감사가 확정한 제시 제목 12종 — 순서까지 포함한 계약.
 *
 * 이 목록만은 모듈에서 유도하지 않고 손으로 적는다. 스스로 기대값을 유도하는 검증기는
 * 재접기(re-fold)를 절대 잡을 수 없기 때문이다: \`PRESENTED_ORDER\` 는
 * \`STUDIO_MAIN_MENU_PRESENTATION_ORDER\` 그 자체이고 \`buildPresentedMenus\` 는 제품과 똑같은
 * 매핑으로 카탈로그를 접는다. 그래서 순서에서 \`insert\` 를 빼고 텍스트·벡터를 다른 제목
 * 밑으로 옮기는 "짝맞춘 수정" 이 들어오면 유도된 단언은 전부 초록 그대로인 채 메뉴바만
 * 조용히 11개로 줄어든다. 그 경우를 깨는 것은 독립적으로 적어 둔 기대값뿐이다.
 *
 * 반대로 ROWS(각 드롭다운의 항목·섹션)는 계속 유도한다. 항목 구성은 카탈로그의 소관이고
 * 여기에 다시 적으면 중복 대장이 하나 더 생길 뿐이다. 고정하는 것은 제목 목록뿐.
 */
const PINNED_PRESENTED_TITLES: readonly string[] = [
  "파일",
  "편집",
  "보기",
  "삽입",
  "레이어",
  "선택",
  "그리기",
  "만화",
  "필터",
  "도구",
  "창",
  "도움말",
];`,
  `/**
 * 메뉴 IA 감사가 확정한 제시 제목 9종 — 개수·순서·표기까지 독립적으로 고정한다.
 * 행과 섹션은 카탈로그에서 계속 유도해 중복 대장을 만들지 않는다.
 */
const PINNED_PRESENTED_TITLES: readonly string[] = [
  "파일",
  "편집",
  "보기",
  "삽입",
  "레이어",
  "그리기",
  "만화",
  "효과",
  "도움말",
];`,
);
replaceAllRequired(
  "scripts/verify-studio-menus.mts",
  "유도된 제시 제목이 고정 12종과 정확히(개수·순서·표기) 일치하는지 대조한다.",
  "유도된 제시 제목이 고정 9종과 정확히(개수·순서·표기) 일치하는지 대조한다.",
);
replaceAllRequired(
  "scripts/verify-studio-menus.mts",
  "제시 제목 12종 계약 위반",
  "제시 제목 9종 계약 위반",
);
replaceAllRequired(
  "scripts/verify-studio-menus.mts",
  '예: "ai" → 도구',
  '예: "ai" → 효과',
);
replaceAllOptional(
  "scripts/verify-studio-menus.mts",
  "// The pinned twelve come first:",
  "// The pinned nine come first:",
);
replaceAllOptional(
  "scripts/verify-studio-menus.mts",
  "// Presented titles always visible. The folded catalogue groups (캔버스·변형·벡터·텍스트·\n  // 애니메이션·3D·협업·AI) are NOT titles any more, so asserting them here would be wrong.",
  "// Presented titles are always visible. Folded catalogue groups remain section captions,\n  // not menubar titles, so asserting them in this loop would be wrong.",
);
replaceAllOptional(
  "scripts/verify-studio-menus.mts",
  "// 창 stands on its own today; resolve it anyway so a future fold does not strand this check.",
  "// 창 is owned by 보기; resolve through the presentation so the check follows future IA changes.",
);
replaceExactRequired(
  "scripts/verify-studio-menus.mts",
  `  for (const menu of PRESENTED_MENUS) {`,
  `  const triggerCount = await nav.locator("[data-studio-main-menu-trigger]").count();
  if (triggerCount !== PINNED_PRESENTED_TITLES.length) {
    failures.push(
      \`메인 메뉴 제목 수 불일치: 기대 \${PINNED_PRESENTED_TITLES.length} / 실제 \${triggerCount}\`,
    );
  }

  for (const menu of PRESENTED_MENUS) {`,
);
replaceAllRequired(
  "scripts/verify-studio-menus.mts",
  "PASS: all menus exposed (main menu + rail + popovers + draw options + export)",
  "PASS: optimized menus exposed (9 titles + sections + rail + popovers + draw options + export)",
);

// Creation ToolBelt follows the same basic-to-specialist workflow as the menu bar.
moveToolBeltInsertBeforeReference();

// Update automation entry points that intentionally traverse the visible top-level IA.
replaceAllRequired(
  "scripts/verify-studio-native-raster-tools.mts",
  '[data-studio-main-menu-trigger="tools"]',
  '[data-studio-main-menu-trigger="view"]',
);
replaceAllRequired(
  "scripts/studio-native-raster-tools-policy.test.ts",
  '[data-studio-main-menu-trigger="tools"]',
  '[data-studio-main-menu-trigger="view"]',
);
replaceAllOptional(
  "scripts/verify-studio-native-raster-tools.mts",
  "캔버스 그룹은 2026-09-02 IA 정리로 '도구' 복합 메뉴 안의 한 구획으로 표시된다",
  "캔버스 그룹은 2026-09-05 IA 정리로 '보기' 메뉴 안의 한 구획으로 표시된다",
);
replaceAllOptional(
  "scripts/studio-native-raster-tools-policy.test.ts",
  "캔버스 그룹은 '도구' 복합 타이틀 아래 한 구획으로 표시된다(2026-09-02 IA 정리).",
  "캔버스 그룹은 '보기' 메뉴 아래 한 구획으로 표시된다(2026-09-05 IA 정리).",
);

replaceAllRequired("scripts/verify-studio-collab-ui.mts", "STUDIO_TOOLS_MENU_TITLE", "STUDIO_FILE_MENU_TITLE");
replaceAllRequired(
  "scripts/verify-studio-collab-ui.mts",
  'const STUDIO_FILE_MENU_TITLE = "도구";',
  'const STUDIO_FILE_MENU_TITLE = "파일";',
);
replaceAllOptional(
  "scripts/verify-studio-collab-ui.mts",
  "협업을 도구 복합 타이틀로 접었다.",
  "협업을 파일 메뉴의 검토·공유 구획으로 옮겼다.",
);

for (const path of ["scripts/verify-studio-bg3d-physics.mts", "scripts/verify-studio-3d-console.mts"]) {
  replaceAllRequired(path, "STUDIO_TOOLS_MENU_TITLE", "STUDIO_INSERT_MENU_TITLE");
  replaceAllRequired(
    path,
    'const STUDIO_INSERT_MENU_TITLE = "도구";',
    'const STUDIO_INSERT_MENU_TITLE = "삽입";',
  );
  replaceAllOptional(path, "3D 를 도구 복합 타이틀로 접었다", "3D 를 삽입 메뉴의 3D 구획으로 옮겼다");
}
replaceAllRequired(
  "scripts/verify-studio-3d-console.test.ts",
  "STUDIO_TOOLS_MENU_TITLE",
  "STUDIO_INSERT_MENU_TITLE",
);
replaceAllRequired(
  "scripts/verify-studio-3d-console.test.ts",
  'const STUDIO_INSERT_MENU_TITLE = "도구"',
  'const STUDIO_INSERT_MENU_TITLE = "삽입"',
);
replaceAllOptional(
  "scripts/verify-studio-3d-console.test.ts",
  "3D 를 도구 복합 타이틀로 접었으므로 진입은",
  "3D 를 삽입 메뉴로 옮겼으므로 진입은",
);
replaceAllOptional(
  "scripts/verify-studio-3d-console.test.ts",
  "도구 트리거와 도구 드롭다운",
  "삽입 트리거와 삽입 드롭다운",
);

replaceAllRequired(
  "scripts/probe-filter-image-target.mts",
  'name: "필터", exact: true',
  'name: "효과", exact: true',
);
replaceAllRequired(
  "scripts/probe-filter-image-target.mts",
  '[role="menu"][aria-label="필터"]',
  '[role="menu"][aria-label="효과"]',
  2,
);
replaceAllRequired(
  "scripts/verify-studio-filter-dialog.mts",
  'openMainMenuGroup(page, "필터")',
  'openMainMenuGroup(page, "효과")',
);
replaceAllRequired(
  "scripts/verify-studio-filter-dialog.mts",
  '[role="menu"][aria-label="필터"]',
  '[role="menu"][aria-label="효과"]',
);
replaceAllRequired(
  "scripts/audit-studio-brushes-filters.mjs",
  'getByRole("menuitem", { name: "필터" })',
  'getByRole("menuitem", { name: "효과" })',
  2,
);
replaceAllRequired(
  "scripts/verify-studio-companion.mts",
  'name: "창", exact: true',
  'name: "보기", exact: true',
);
replaceAllRequired(
  "scripts/verify-studio-companion.mts",
  '[role="menu"][aria-label="창"]',
  '[role="menu"][aria-label="보기"]',
);

// Guard against the old visible IA surviving in executable automation.
for (const [path, marker] of [
  ["src/domains/creator/StudioMenubarContent.tsx", 'compositeMenuLabel("tools")'],
  ["scripts/verify-studio-native-raster-tools.mts", 'main-menu-trigger="tools"'],
  ["scripts/studio-native-raster-tools-policy.test.ts", 'main-menu-trigger="tools"'],
  ["scripts/verify-studio-collab-ui.mts", "STUDIO_TOOLS_MENU_TITLE"],
  ["scripts/verify-studio-bg3d-physics.mts", "STUDIO_TOOLS_MENU_TITLE"],
  ["scripts/verify-studio-3d-console.mts", "STUDIO_TOOLS_MENU_TITLE"],
  ["scripts/verify-studio-3d-console.test.ts", "STUDIO_TOOLS_MENU_TITLE"],
  ["scripts/probe-filter-image-target.mts", 'aria-label="필터"'],
  ["scripts/verify-studio-filter-dialog.mts", 'aria-label="필터"'],
  ["scripts/verify-studio-companion.mts", 'aria-label="창"'],
]) {
  assertAbsent(path, marker);
}

// Structural sanity checks that do not need installed dependencies.
const presentation = read("src/domains/creator/studio-main-menu-presentation.ts");
for (const title of ["file", "edit", "view", "insert", "layer", "brush", "comic", "filter", "help"]) {
  if (!presentation.includes(`  "${title}",`)) throw new Error(`presentation title missing: ${title}`);
}
const belt = read("src/domains/creator/StudioToolBeltCreateModeGroups.tsx");
const insertIndex = belt.indexOf("<StudioToolBeltCreateModeInsertTools");
const referenceIndex = belt.indexOf('studioUiDensityAllows(uiDensityMode, "toolbar-reference")');
const aiIndex = belt.indexOf('studioUiDensityAllows(uiDensityMode, "toolbar-ai")');
if (!(insertIndex >= 0 && insertIndex < referenceIndex && referenceIndex < aiIndex)) {
  throw new Error("ToolBelt workflow order is not insert → reference → AI");
}

// The bootstrap source is intentionally one-shot; the workflow file is removed separately.
if (existsSync("scripts/apply-menu-ia-optimization.mjs")) {
  rmSync("scripts/apply-menu-ia-optimization.mjs");
}

console.log("Studio menu IA optimization applied successfully.");
