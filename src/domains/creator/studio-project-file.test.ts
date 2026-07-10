import { describe, expect, it } from "vitest";

import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
} from "./studio-ai-provenance";
import {
  parseStudioProjectFile,
  resetStudioAiProvenanceForRemix,
  serializeStudioProjectFile,
} from "./studio-project-file";

const page = { id: "p1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 };
const PRIVATE_PROMPT = "원작자의 비공개 결말 프롬프트";

function retainedAiProvenance() {
  return appendStudioAiOperation(
    createEmptyStudioAiProvenanceDocument(),
    {
      id: "operation-1",
      kind: "image",
      task: "background-image",
      provider: "image-provider",
      model: "image-v1",
      transport: "byok",
      promptVersion: 2,
      prompt: PRIVATE_PROMPT,
      createdAt: "2026-07-10T00:00:00.000Z",
      requestId: "private-provider-request",
      target: { pageId: "private-page", elementId: "private-element" },
    },
    { retainRawPrompt: true }
  );
}

describe("studio project file", () => {
  it("v2 문서의 게시·편집 메타데이터를 함께 보존한다", () => {
    expect(
      parseStudioProjectFile({
        version: 2,
        title: "제목",
        description: "설명",
        tagsText: "일상, 학원",
        pagesList: [page],
        currentPageId: "p1",
        webtoonTheme: "soft",
        panelGutter: 32,
        characterBible: { version: 1, characters: [{ id: "hero", name: "윤슬" }] },
        writerRoom: { version: 1, stages: { premise: { text: "비밀" } } },
        comments: { version: 1, threads: [{ id: "comment-1" }] },
        releaseSchedule: { version: 1, items: [{ id: "release-1" }] },
        publicationAnalytics: { version: 1, records: [{ id: "metric-1" }] },
        publishPack: { profile: "webtoon", aiUsage: "assisted", disclosure: "번역 초안에 AI 사용" },
      })
    ).toMatchObject({
      description: "설명",
      tagsText: "일상, 학원",
      webtoonTheme: "soft",
      panelGutter: 32,
      characterBible: { version: 1, characters: [{ id: "hero", name: "윤슬" }] },
      writerRoom: { version: 1, stages: { premise: { text: "비밀" } } },
      comments: { version: 1, threads: [{ id: "comment-1" }] },
      releaseSchedule: { version: 1, items: [{ id: "release-1" }] },
      publicationAnalytics: { version: 1, records: [{ id: "metric-1" }] },
      publishPack: { profile: "webtoon", aiUsage: "assisted", disclosure: "번역 초안에 AI 사용" },
    });
  });

  it("기존 1.0 pages 파일을 v2 형태로 마이그레이션한다", () => {
    expect(parseStudioProjectFile({ version: "1.0", title: "과거", pages: [page] })).toMatchObject({
      version: 2,
      title: "과거",
      pagesList: [page],
      currentPageId: "p1",
    });
  });

  it("프로젝트 AI 이력을 정규화하고 가져오기에서 원문 프롬프트를 제거한다", () => {
    const serialized = serializeStudioProjectFile({
      version: 2,
      pagesList: [page],
      aiProvenance: retainedAiProvenance(),
    });
    const parsed = parseStudioProjectFile(JSON.parse(serialized));

    expect(serialized).not.toContain(PRIVATE_PROMPT);
    expect(parsed.aiProvenance?.operations).toHaveLength(1);
    expect(parsed.aiProvenance?.operations[0].prompt.retention).toBe("hash-only");
    expect(parsed.aiProvenance?.operations[0].prompt).not.toHaveProperty("raw");
    expect(JSON.stringify(parsed)).not.toContain(PRIVATE_PROMPT);
  });

  it("레거시 프로젝트의 AI 이력도 보존하고 이력 없는 파일은 선택 필드를 만들지 않는다", () => {
    const withHistory = parseStudioProjectFile({
      version: "1.0",
      title: "과거",
      pages: [page],
      aiProvenance: retainedAiProvenance(),
    });
    const withoutHistory = parseStudioProjectFile({ version: "1.0", title: "과거", pages: [page] });

    expect(withHistory.aiProvenance?.operations).toHaveLength(1);
    expect(withoutHistory.aiProvenance).toBeUndefined();
  });

  it("리믹스는 원작자의 AI 이력을 상속하지 않고 독립된 빈 이력으로 시작한다", () => {
    const source = parseStudioProjectFile({
      version: 2,
      pagesList: [page],
      aiProvenance: retainedAiProvenance(),
    });
    const remix = resetStudioAiProvenanceForRemix();

    expect(source.aiProvenance?.operations).toHaveLength(1);
    expect(remix).toEqual({ version: 1, operations: [] });
    expect(JSON.stringify(remix)).not.toContain(source.aiProvenance?.operations[0].prompt.sha256);
  });

  it("페이지가 없거나 페이지 구조가 손상된 파일을 거부한다", () => {
    expect(() => parseStudioProjectFile({ version: 2, title: "빈 파일", pagesList: [] })).toThrow(/프로젝트/);
    expect(() => parseStudioProjectFile({ version: 2, pagesList: [{ id: "p1" }] })).toThrow(/프로젝트/);
  });
});
