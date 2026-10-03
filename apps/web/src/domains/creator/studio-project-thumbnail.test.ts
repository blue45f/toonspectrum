// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioAutosavePayload } from "./studio-autosave";
import type { StudioProjectLibraryStorage } from "./studio-project-library-reader";
import {
  createStudioProject,
  readStudioProjectLibrary,
  updateStudioProjectThumbnailUrl,
} from "./studio-project-library-store";
import {
  buildStudioProjectThumbnailSvg,
  deleteStudioProjectThumbnail,
  isStudioProjectThumbnailLocator,
  parseStudioProjectThumbnailLocator,
  readStudioProjectThumbnailBlob,
  readStudioProjectThumbnailRecord,
  selectStudioProjectThumbnailPage,
  studioProjectThumbnailCropHeight,
  studioProjectThumbnailFingerprint,
  studioProjectThumbnailLocator,
  syncStudioProjectThumbnailAfterSave,
} from "./studio-project-thumbnail";

function memoryStorage(): StudioProjectLibraryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const TEXT_ELEMENT = {
  id: "el-text",
  type: "text",
  text: "첫 컷 대사",
  x: 40,
  y: 80,
  width: 320,
  fontSize: 28,
  fill: "#111111",
};

function makePayload(
  pages: readonly Record<string, unknown>[],
  currentPageId?: string,
): StudioAutosavePayload {
  return {
    version: 3,
    savedAt: "2026-10-03T00:00:00.000Z",
    pagesList: pages as StudioAutosavePayload["pagesList"],
    ...(currentPageId ? { currentPageId } : {}),
  };
}

function pageWithText(id: string, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    canvasH: 1080,
    bg: "#fdfdfd",
    elements: [{ ...TEXT_ELEMENT, text }],
    ...extra,
  };
}

beforeEach(() => {
  // 팩토리를 갈아끼우면 모듈이 새 팩토리로 다시 연다 — 테스트 간 격리(idb-kv와 같은 방식).
  vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("썸네일 로케이터", () => {
  it("프로젝트 id를 담고 되읽을 수 있다", () => {
    const locator = studioProjectThumbnailLocator("project-abc");
    expect(locator).toBe("studio-thumbnail:v1/project-abc");
    expect(parseStudioProjectThumbnailLocator(locator)).toBe("project-abc");
    expect(isStudioProjectThumbnailLocator(locator)).toBe(true);
  });

  it("일반 URL과 빈 로케이터는 로케이터가 아니다", () => {
    expect(parseStudioProjectThumbnailLocator("https://example.test/cover.png")).toBeNull();
    expect(parseStudioProjectThumbnailLocator("studio-thumbnail:v1/")).toBeNull();
    expect(isStudioProjectThumbnailLocator("data:image/png;base64,AAAA")).toBe(false);
  });
});

describe("대표 페이지 선택", () => {
  it("현재 페이지를 우선한다", () => {
    const payload = makePayload([
      pageWithText("page-1", "첫 페이지"),
      pageWithText("page-2", "둘째 페이지"),
    ], "page-2");
    expect(selectStudioProjectThumbnailPage(payload)?.id).toBe("page-2");
  });

  it("현재 페이지가 없으면 요소가 있는 첫 페이지를 고른다", () => {
    const payload = makePayload([
      { id: "page-empty", canvasH: 1080, elements: [] },
      pageWithText("page-2", "내용 있음"),
    ]);
    expect(selectStudioProjectThumbnailPage(payload)?.id).toBe("page-2");
  });

  it("요소가 있는 페이지가 없으면 null이다", () => {
    const payload = makePayload([
      { id: "page-1", canvasH: 1080, elements: [] },
      { id: "page-2", canvasH: 1080, elements: [{ type: "text" }, { id: "", type: "text" }] },
    ]);
    expect(selectStudioProjectThumbnailPage(payload)).toBeNull();
  });
});

describe("내용 지문", () => {
  it("같은 페이지면 같고 요소가 바뀌면 달라진다", () => {
    const page = selectStudioProjectThumbnailPage(makePayload([pageWithText("page-1", "대사")]));
    const changed = selectStudioProjectThumbnailPage(makePayload([pageWithText("page-1", "다른 대사")]));
    expect(page).not.toBeNull();
    expect(changed).not.toBeNull();
    expect(studioProjectThumbnailFingerprint(page!)).toBe(studioProjectThumbnailFingerprint(page!));
    expect(studioProjectThumbnailFingerprint(page!)).not.toBe(studioProjectThumbnailFingerprint(changed!));
  });
});

describe("SVG 직렬화", () => {
  it("배경색과 텍스트를 담고 긴 페이지는 위쪽만 자른다", () => {
    const page = selectStudioProjectThumbnailPage(makePayload([
      pageWithText("page-1", "안녕하세요", { canvasH: 2_000, bg: "#123456" }),
    ]));
    const svg = buildStudioProjectThumbnailSvg(page!);
    expect(svg).toContain("<svg");
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain("<text");
    expect(svg).toContain("안녕하세요");
    expect(svg).toContain('height="270"');
    expect(studioProjectThumbnailCropHeight(2_000)).toBe(270);
    expect(studioProjectThumbnailCropHeight(100)).toBe(100);
  });

  it("그라디언트 배경은 defs로 직렬화한다", () => {
    const page = selectStudioProjectThumbnailPage(makePayload([
      pageWithText("page-1", "대사", { bgGrad: ["#0b1026", "#274690"] }),
    ]));
    const svg = buildStudioProjectThumbnailSvg(page!);
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('stop-color="#0b1026"');
    expect(svg).toContain('stop-color="#274690"');
    expect(svg).toContain('fill="url(#studio-project-thumbnail-bg-grad)"');
  });

  it("텍스트의 XML 특수문자를 이스케이프한다", () => {
    const page = selectStudioProjectThumbnailPage(makePayload([
      pageWithText("page-1", 'A<B>&"C"'),
    ]));
    const svg = buildStudioProjectThumbnailSvg(page!);
    expect(svg).toContain("A&lt;B&gt;&amp;&quot;C&quot;");
    expect(svg).not.toContain("A<B>");
  });

  it("원격 이미지 URL은 자리표시자로, data 이미지는 그대로 그린다", () => {
    const remote = selectStudioProjectThumbnailPage(makePayload([{
      id: "page-1",
      canvasH: 1080,
      elements: [{ id: "img-1", type: "image", src: "https://example.test/x.png", x: 0, y: 0, width: 200, height: 100 }],
    }]));
    const remoteSvg = buildStudioProjectThumbnailSvg(remote!);
    expect(remoteSvg).not.toContain("<image");
    expect(remoteSvg).toContain("rgb(99 102 241");

    const embedded = selectStudioProjectThumbnailPage(makePayload([{
      id: "page-1",
      canvasH: 1080,
      elements: [{ id: "img-1", type: "image", src: "data:image/png;base64,AAAA", x: 0, y: 0, width: 200, height: 100 }],
    }]));
    const embeddedSvg = buildStudioProjectThumbnailSvg(embedded!);
    expect(embeddedSvg).toContain("<image");
    expect(embeddedSvg).toContain("data:image/png;base64,AAAA");
  });
});

describe("저장 후 썸네일 동기화", () => {
  it("저장하면 라이브러리 항목이 로케이터를 가리키고 IDB에 바이트가 쌓인다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => new Blob(["webp-bytes"], { type: "image/webp" }));

    const result = await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload([pageWithText("page-1", "첫 컷")]),
      rasterize,
    });

    expect(result).toEqual({ status: "updated" });
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(rasterize.mock.calls[0]?.[0]).toContain("<svg");
    const saved = readStudioProjectLibrary(storage).projects.find((project) => project.id === entry.id);
    expect(saved?.thumbnailUrl).toBe(studioProjectThumbnailLocator(entry.id));
    // 썸네일 갱신이 작품의 updatedAt을 흔들지 않는다.
    expect(saved?.updatedAt).toBe(entry.updatedAt);

    const record = await readStudioProjectThumbnailRecord(entry.id);
    expect(record?.blob.type).toBe("image/webp");
    expect(record?.blob.size).toBe("webp-bytes".length);
    const page = selectStudioProjectThumbnailPage(makePayload([pageWithText("page-1", "첫 컷")]));
    expect(record?.fingerprint).toBe(studioProjectThumbnailFingerprint(page!));
  });

  it("내용이 같으면 다시 굽지 않고, 포인터가 지워졌으면 복구만 한다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => new Blob(["webp-bytes"], { type: "image/webp" }));
    const payload = makePayload([pageWithText("page-1", "첫 컷")]);

    await syncStudioProjectThumbnailAfterSave({ storage, projectId: entry.id, payload, rasterize });
    updateStudioProjectThumbnailUrl(storage, entry.id, null);

    const result = await syncStudioProjectThumbnailAfterSave({ storage, projectId: entry.id, payload, rasterize });
    expect(result).toEqual({ status: "unchanged" });
    expect(rasterize).toHaveBeenCalledTimes(1);
    const saved = readStudioProjectLibrary(storage).projects.find((project) => project.id === entry.id);
    expect(saved?.thumbnailUrl).toBe(studioProjectThumbnailLocator(entry.id));
  });

  it("내용이 바뀌면 다시 굽는다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => new Blob(["webp-bytes"], { type: "image/webp" }));

    await syncStudioProjectThumbnailAfterSave({
      storage, projectId: entry.id, rasterize,
      payload: makePayload([pageWithText("page-1", "첫 컷")]),
    });
    const result = await syncStudioProjectThumbnailAfterSave({
      storage, projectId: entry.id, rasterize,
      payload: makePayload([pageWithText("page-1", "바뀐 컷")]),
    });
    expect(result).toEqual({ status: "updated" });
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it("라이브러리에 없는 작품·프로젝트 없음·빈 페이지는 조용히 건너뛴다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => new Blob(["x"], { type: "image/webp" }));
    const payload = makePayload([pageWithText("page-1", "첫 컷")]);

    await expect(syncStudioProjectThumbnailAfterSave({ storage, projectId: null, payload, rasterize }))
      .resolves.toEqual({ status: "skipped", reason: "no-project" });
    await expect(syncStudioProjectThumbnailAfterSave({ storage, projectId: "missing-id", payload, rasterize }))
      .resolves.toEqual({ status: "skipped", reason: "project-not-found" });
    await expect(syncStudioProjectThumbnailAfterSave({
      storage, projectId: entry.id, rasterize,
      payload: makePayload([{ id: "page-1", canvasH: 1080, elements: [] }]),
    })).resolves.toEqual({ status: "skipped", reason: "no-source-page" });
    expect(rasterize).not.toHaveBeenCalled();
  });

  it("렌더가 실패하면 기존 값을 건드리지 않는다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => null);

    const result = await syncStudioProjectThumbnailAfterSave({
      storage, projectId: entry.id, rasterize,
      payload: makePayload([pageWithText("page-1", "첫 컷")]),
    });
    expect(result).toEqual({ status: "skipped", reason: "render-failed" });
    const saved = readStudioProjectLibrary(storage).projects.find((project) => project.id === entry.id);
    expect(saved?.thumbnailUrl).toBeNull();
    await expect(readStudioProjectThumbnailBlob(entry.id)).resolves.toBeNull();
  });

  it("삭제하면 IDB 기록도 사라진다", async () => {
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = vi.fn(async (_svg: string) => new Blob(["webp-bytes"], { type: "image/webp" }));
    await syncStudioProjectThumbnailAfterSave({
      storage, projectId: entry.id, rasterize,
      payload: makePayload([pageWithText("page-1", "첫 컷")]),
    });
    await expect(readStudioProjectThumbnailBlob(entry.id)).resolves.not.toBeNull();
    await deleteStudioProjectThumbnail(entry.id);
    await expect(readStudioProjectThumbnailBlob(entry.id)).resolves.toBeNull();
  });
});
