import { describe, expect, it } from "vitest";

import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
} from "./studio-ai-provenance";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  createDefaultStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  parseStudioProjectFile,
  resetStudioAiProvenanceForRemix,
  serializeStudioProjectFile,
} from "./studio-project-file";

const page = { id: "p1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 };
const PRIVATE_PROMPT = "원작자의 비공개 결말 프롬프트";

function schemaV1Scene(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const current = createDefaultStudioBg3dSceneDocument();
  return {
    ...current,
    ...overrides,
    version: 1,
    budgets: {
      complexity: {
        maxNodes: current.budgets.complexity.maxNodes,
        maxTriangles: current.budgets.complexity.maxTriangles,
        maxDrawCalls: current.budgets.complexity.maxDrawCalls,
        maxMaterials: current.budgets.complexity.maxMaterials,
        maxLights: current.budgets.complexity.maxLights,
        maxModelBytes: current.budgets.complexity.maxModelBytes,
      },
      textures: { ...current.budgets.textures },
    },
  };
}

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
    expect(() => parseStudioProjectFile({
      version: 2,
      pagesList: [page],
      master: { elements: Array.from({ length: 10_001 }, (_, index) => ({ id: `m-${index}` })) },
    })).toThrow(/마스터 요소 수/);
  });

  it("페이지와 마스터의 canonical 3D 배경 장면을 별도 메타데이터로 왕복한다", () => {
    const scene = createDefaultStudioBg3dSceneDocument();
    const image = {
      id: "image-1",
      type: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
      bg3dScene: scene,
    };
    const parsed = parseStudioProjectFile({
      version: 2,
      pagesList: [{ ...page, elements: [image] }],
      master: { elements: [{ ...image, id: "master-image" }] },
    });
    const pageImage = parsed.pagesList[0].elements[0] as typeof image;
    const masterImage = (parsed.master as { elements: typeof image[] }).elements[0];

    expect(pageImage.src).not.toContain("#");
    expect(pageImage.bg3dScene).toEqual(scene);
    expect(masterImage.bg3dScene).toEqual(scene);
    expect(JSON.parse(serializeStudioProjectFile(parsed)).pagesList[0].elements[0].bg3dScene).toEqual(scene);
  });

  it("페이지와 마스터에 저장된 실제 schema-v1 3D 장면을 v2로 마이그레이션한다", () => {
    const scene = schemaV1Scene();
    const image = {
      id: "image-1",
      type: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
      bg3dScene: scene,
    };
    const parsed = parseStudioProjectFile({
      version: 2,
      pagesList: [{ ...page, elements: [image] }],
      master: { elements: [{ ...image, id: "master-image" }] },
    });
    const pageScene = (parsed.pagesList[0].elements[0] as typeof image).bg3dScene;
    const masterScene = ((parsed.master as { elements: typeof image[] }).elements[0]).bg3dScene;

    expect(pageScene).toMatchObject({
      version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
      budgets: {
        complexity: {
          maxAnimations: expect.any(Number),
          maxDecodedGeometryBytes: expect.any(Number),
        },
      },
    });
    expect(masterScene).toEqual(pageScene);
  });

  it("schema-v1 파노라마 URL만 제거하고 3D 편집 원본을 보존해 가져온다", () => {
    const current = createDefaultStudioBg3dSceneDocument();
    const historicalScene = schemaV1Scene({
      camera: { ...current.camera, position: [8, 4, 6] },
      background: {
        ...current.background,
        skyPresetId: "sunset",
        panoramaRotation: 35,
        panoramaUrl: "https://private.invalid/legacy.webp?access_token=secret",
      },
    });
    const parsed = parseStudioProjectFile({
      version: 2,
      pagesList: [{
        ...page,
        elements: [{
          id: "image-1",
          type: "image",
          src: "data:image/png;base64,AA==",
          bg3dScene: historicalScene,
        }],
      }],
    });
    const image = parsed.pagesList[0].elements[0] as Record<string, unknown>;
    const migrated = image.bg3dScene as typeof current;

    expect(migrated.version).toBe(STUDIO_BG3D_SCENE_DOCUMENT_VERSION);
    expect(migrated.camera.position).toEqual([8, 4, 6]);
    expect(migrated.background).toMatchObject({
      panoramaRotation: 35,
      skyPresetId: "sunset",
    });
    expect(JSON.stringify(migrated)).not.toContain("panoramaUrl");
    expect(JSON.stringify(migrated)).not.toContain("private.invalid");
    expect(JSON.stringify(migrated)).not.toContain("access_token");
  });

  it("3D 장면의 알 수 없는 런타임 필드를 조용히 제거하지 않고 가져오기를 거부한다", () => {
    const scene = {
      ...createDefaultStudioBg3dSceneDocument(),
      runtimeUrl: "blob:https://private.invalid/model",
      storageKey: "private-indexed-db-key",
    };
    const input = {
      version: 2,
      pagesList: [{
        ...page,
        elements: [{ id: "image-1", type: "image", src: "data:image/png;base64,AA==", bg3dScene: scene }],
      }],
    };
    expect(() => parseStudioProjectFile(input)).toThrow(/3D 배경 장면/);
    expect(scene).toHaveProperty("runtimeUrl");
    expect(scene).toHaveProperty("storageKey");
  });

  it("손상되거나 미래 버전인 canonical 3D 장면은 조용히 유실시키지 않고 프로젝트 가져오기를 거부한다", () => {
    const withScene = (bg3dScene: unknown) => ({
      version: 2,
      pagesList: [{
        ...page,
        elements: [{ id: "image-1", type: "image", src: "data:image/png;base64,AA==", bg3dScene }],
      }],
    });

    expect(() => parseStudioProjectFile(withScene({
      ...createDefaultStudioBg3dSceneDocument(),
      version: 99,
    }))).toThrow(/3D 배경 장면/);
    expect(() => parseStudioProjectFile(withScene({
      kind: "toonspectrum.bg3d-scene",
      version: 1,
      nodes: [],
      attachments: [],
    }))).toThrow(/3D 배경 장면/);
    expect(() => parseStudioProjectFile(withScene({
      tool: "bg3d",
      primitives: [],
    }))).toThrow(/3D 배경 장면/);
    expect(() => parseStudioProjectFile(withScene({
      ...createDefaultStudioBg3dSceneDocument(),
      attachments: [{
        id: "broken-model",
        name: "broken.glb",
        mime: "model/gltf-binary",
        byteSize: 48,
        hash: "sha256:broken",
        rights: { status: "owned", commercialUse: true, attributionRequired: false },
        source: "upload",
      }],
      nodes: [{
        id: "broken-node",
        name: "손상 모델",
        kind: "model",
        attachmentId: "broken-model",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        castsShadow: true,
        receivesShadow: true,
      }],
    }))).toThrow(/3D 배경 장면/);
  });

  it("레거시 PNG fragment는 기존 호환 경로를 위해 그대로 보존한다", () => {
    const src = "data:image/png;base64,AA==#%7B%22tool%22%3A%22bg3d%22%2C%22primitives%22%3A%5B%5D%7D";
    const parsed = parseStudioProjectFile({
      version: "1.0",
      pages: [{
        ...page,
        elements: [{ id: "legacy-bg", type: "image", src }],
      }],
    });
    const image = parsed.pagesList[0].elements[0] as Record<string, unknown>;

    expect(image.src).toBe(src);
    expect(image).not.toHaveProperty("bg3dScene");
  });
});
