/**
 * AI 답변의 간단한 마크다운(제목·목록·굵게)을 화면 블록으로 나눈다.
 * HTML을 해석하지 않고 문자열 조각만 만들기 때문에 답변 내용이 마크업으로 실행되지 않는다.
 */
export interface DirectorInline {
  readonly text: string;
  readonly strong: boolean;
}

export type DirectorBlock =
  | { readonly kind: "heading"; readonly inline: readonly DirectorInline[] }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly DirectorInline[])[] }
  | { readonly kind: "paragraph"; readonly inline: readonly DirectorInline[] };

const HEADING = /^#{1,6}\s+(.+)$/u;
const BULLET = /^\s*[-*•]\s+(.+)$/u;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/u;

export function parseDirectorInline(text: string): readonly DirectorInline[] {
  const parts = text.split("**");
  // 짝이 맞지 않는 ** 는 굵게로 해석하지 않고 원문 그대로 둔다.
  if (parts.length % 2 === 0) return [{ text, strong: false }];
  return parts
    .map((part, index) => ({ text: part, strong: index % 2 === 1 }))
    .filter((part) => part.text.length > 0);
}

export function parseDirectorAnswer(content: string): readonly DirectorBlock[] {
  const blocks: DirectorBlock[] = [];
  let list: { ordered: boolean; items: (readonly DirectorInline[])[] } | null = null;
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  for (const raw of content.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(raw);
    const numbered = NUMBERED.exec(raw);
    if (heading?.[1]) {
      flushList();
      blocks.push({ kind: "heading", inline: parseDirectorInline(heading[1].replace(/\*\*/gu, "")) });
    } else if (bullet?.[1] || numbered?.[1]) {
      const ordered = Boolean(numbered?.[1]);
      const text = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseDirectorInline(text));
    } else {
      flushList();
      blocks.push({ kind: "paragraph", inline: parseDirectorInline(line) });
    }
  }
  flushList();
  return blocks;
}
