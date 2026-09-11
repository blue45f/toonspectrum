import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, from, to) {
  const source = readFileSync(path, "utf8");
  const occurrences = source.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one replacement target, found ${occurrences}`);
  }
  writeFileSync(path, source.replace(from, to));
}

function replacePatternOnce(path, pattern, replacement) {
  const source = readFileSync(path, "utf8");
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one pattern target, found ${matches.length}`);
  }
  writeFileSync(path, source.replace(pattern, replacement));
}

const specPath = "apps/web/src/domains/creator/studio-main-menu-group-spec.ts";
replaceOnce(
  specPath,
  '      ours("brush/correct-current-stroke", "현재 스트로크 교정 — 최근 자유선을 도형으로 편집하고 원본을 복원한다."),\n      ours("brush/pixel-art", "픽셀 아트 모드."),',
  '      ours("brush/correct-current-stroke", "현재 스트로크 교정 — 최근 자유선을 도형으로 편집하고 원본을 복원한다."),\n      ours(\n        "brush/brush-lab",\n        "목적별 브러시 제작실 — 결과 중심의 통합 브러시 전문 편집 경로.",\n      ),\n      ours("brush/pixel-art", "픽셀 아트 모드."),',
);

const catalogPath = "apps/web/src/domains/creator/studio-command-catalog-base.ts";
replacePatternOnce(
  catalogPath,
  /  \/\/ brush \(\d+\)([^\n]*)/gu,
  "  // brush (15)$1",
);
replaceOnce(
  catalogPath,
  '\n  // Brush Studio V6 contextual workspace entry.\n  "brush/brush-lab",\n',
  "\n",
);
replaceOnce(
  catalogPath,
  '  "brush/brush-studio",\n  "brush/natural-media",',
  '  "brush/brush-studio",\n  "brush/brush-lab",\n  "brush/natural-media",',
);

const groupsTestPath = "apps/web/src/domains/creator/studio-main-menu-groups.test.ts";
replaceOnce(
  groupsTestPath,
  '      "studio.mainMenu.item.view.feature-tutorials": "Feature tutorials",',
  '      "studio.mainMenu.item.view.feature-tutorials": "Feature tutorials",\n      "studio.mainMenu.item.help.product": "Help home and guided learning",',
);
replaceOnce(
  groupsTestPath,
  '    expect(menuItem(english, "help", "feature-tutorials").label).toBe("Feature tutorials");',
  '    expect(menuItem(english, "help", "feature-tutorials").label).toBe(\n      "Help home and guided learning",\n    );',
);
replaceOnce(
  groupsTestPath,
  "    expect(editor.openFeatureTutorial).toHaveBeenCalledOnce();",
  "    // Product help now owns this entry through the shared help event; the editor tutorial\n    // callback must not become a second owner. Event dispatch is covered by the help-item tests.\n    expect(editor.openFeatureTutorial).not.toHaveBeenCalled();",
);

console.log("Studio menu, command inventory and help contracts repaired.");
