// 캐릭터 캐논 시트를 AI 코믹 디렉터의 그림 프롬프트에 주입하는 로직.
// 프롬프트 텍스트 안에 "[캐릭터 캐논: 이름]" 마커 블록을 넣고 빼는 방식으로,
// 멱등하게(여러 번 눌러도 블록이 중복되지 않게) 동작한다.
// 실제 이미지 생성 API 호출은 하지 않는다 — 프롬프트 구성까지가 이 모듈의 범위.
import type { CharacterCanonSheet } from "./studio-character-canon";

const CANON_MARKER_PATTERN = /^\[캐릭터 캐논: ([^\]]+)\]$/u;

/** 시트 한 장을 프롬프트에 넣을 텍스트 블록으로 만든다. */
export function buildCanonPromptBlock(sheet: CharacterCanonSheet): string {
  const lines = [`[캐릭터 캐논: ${sheet.name}]`];
  if (sheet.appearance) lines.push(`- 외모: ${sheet.appearance}`);
  if (sheet.outfit) lines.push(`- 의상: ${sheet.outfit}`);
  if (sheet.tags.length > 0) lines.push(`- 특징: ${sheet.tags.join(", ")}`);
  return lines.join("\n");
}

/** 프롬프트에 들어 있는 캐논 블록의 캐릭터 이름 목록. */
export function parseCanonPromptBlocks(prompt: string): string[] {
  const names: string[] = [];
  for (const line of prompt.split("\n")) {
    const match = line.trim().match(CANON_MARKER_PATTERN);
    if (match?.[1]) names.push(match[1].trim());
  }
  return names;
}

/**
 * 프롬프트에서 캐논 블록을 모두 제거한다.
 * 마커 줄 다음에 오는 "- " 상세 줄들을 함께 걷어낸다. 블록 바로 뒤에 본문
 * 텍스트가 이어져도(빈 줄 없이) 본문은 살린다 — 상세 줄이 아닌 줄을 만나면
 * 그 줄부터는 다시 본문으로 취급한다. 블록과 본문 사이의 빈 줄 하나는 정리한다.
 */
export function stripCanonPromptBlocks(prompt: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of prompt.split("\n")) {
    if (CANON_MARKER_PATTERN.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim().startsWith("- ")) continue;
      // 블록·본문 사이 빈 줄은 걷어내고, 본문 줄은 살린다.
      skipping = false;
      if (line.trim() === "") continue;
    }
    kept.push(line);
  }
  // 끝에만 남은 빈 줄 정리 — 중간 빈 줄은 원본 리듬을 살린다.
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === "") kept.pop();
  while (kept.length > 0 && kept[0]!.trim() === "") kept.shift();
  return kept.join("\n");
}

/**
 * 선택한 캐릭터들의 캐논 블록을 프롬프트에 반영한다.
 * 기존 블록은 먼저 걷어내서 중복 주입을 막고, 본문 뒤에 블록을 붙인다.
 * (디렉터 제작 방향 지시는 프롬프트 앞부분에 붙는 방식이라 서로 간섭하지 않는다.)
 */
export function applyCanonPromptBlocks(
  prompt: string,
  sheets: readonly CharacterCanonSheet[],
): string {
  const body = stripCanonPromptBlocks(prompt);
  if (sheets.length === 0) return body;
  const blocks = sheets.map(buildCanonPromptBlock);
  return body ? `${body}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
}

/** 프롬프트에 이 캐릭터의 캐논 블록이 이미 들어 있는지. */
export function hasCanonPromptBlock(
  prompt: string,
  sheetName: string,
): boolean {
  return parseCanonPromptBlocks(prompt).includes(sheetName);
}
