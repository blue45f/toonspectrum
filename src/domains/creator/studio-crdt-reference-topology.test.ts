import { describe, expect, it } from "vitest";

import {
  StudioCrdtDocument,
  type StudioCrdtLayerGroupInput,
} from "./studio-crdt-document";
import { reconcileStudioCrdtSceneGraphHistory } from "./studio-crdt-history";
import {
  reconcileStudioCrdtSceneGraphPages,
  studioCrdtElementToSceneElement,
  studioElementToCrdtSceneElement,
} from "./studio-crdt-page-bridge";
import { publishStudioCrdtSceneGraphDiff } from "./studio-crdt-scene-publisher";

interface TestElement {
  id: string;
  type: string;
  groupId?: string;
  src?: string;
  x?: number;
  [key: string]: unknown;
}

interface TestGroup {
  id: string;
  name: string;
  hidden?: boolean;
  locked?: boolean;
}

interface TestPage {
  id: string;
  elements: TestElement[];
  groups: TestGroup[];
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  note?: string;
}

function page(
  id: string,
  elements: TestElement[] = [],
  groups: TestGroup[] = [],
  note?: string
): TestPage {
  return { id, elements, groups, bg: "#ffffff", bgGrad: null, canvasH: 1600, note };
}

function group(id: string, name = id): TestGroup {
  return { id, name };
}

function groupInput(pageId: string, id: string): StudioCrdtLayerGroupInput {
  return { id, pageId, payload: { version: 1, props: { name: id } } };
}

function asset(
  id: string,
  type: string,
  src: string,
  groupId?: string,
  x = 10
): TestElement {
  return { id, type, src, groupId, x, authoredMetadata: { keep: true } };
}

function converge(left: StudioCrdtDocument, right: StudioCrdtDocument, base: StudioCrdtDocument) {
  const baseVector = base.encodeStateVector();
  const leftUpdate = left.encodeStateAsUpdate(baseVector);
  const rightUpdate = right.encodeStateAsUpdate(baseVector);
  left.applyUpdate(rightUpdate);
  right.applyUpdate(leftUpdate);
}

function reconcile(document: StudioCrdtDocument, pages: readonly TestPage[]): TestPage[] {
  return reconcileStudioCrdtSceneGraphPages(
    pages,
    document.getStrokes({ includeDeleted: true }),
    document.getSceneElements({ includeDeleted: true }),
    document.getPages(true),
    document.getLayerGroups({ includeDeleted: true })
  ).pages;
}

describe("studio CRDT universal reference topology", () => {
  it("keeps image and 3D asset payloads local while converging their page, group, and z-order", () => {
    const document = new StudioCrdtDocument();
    document.addLayerGroup(groupInput("page-a", "backgrounds"));
    const hugeImage = asset(
      "image-a",
      "image",
      `data:image/png;base64,${"A".repeat(80 * 1024)}`,
      "backgrounds"
    );
    const background3d = asset(
      "scene-3d",
      "background3d",
      "studio3d://scene/city-night",
      "backgrounds",
      40
    );
    const encodedImage = studioElementToCrdtSceneElement("page-a", hugeImage);
    const encoded3d = studioElementToCrdtSceneElement("page-a", background3d);

    expect(encodedImage).toMatchObject({
      id: "image-a",
      pageId: "page-a",
      layerId: "backgrounds",
      payload: { version: 1, type: "reference", props: { elementType: "image" } },
    });
    expect(JSON.stringify(encodedImage)).not.toContain("base64");
    expect(encoded3d.payload).toEqual({
      version: 1,
      type: "reference",
      props: { elementType: "background3d" },
    });

    document.addSceneElement(encodedImage);
    document.addSceneElement(encoded3d, "image-a");
    expect(() => studioCrdtElementToSceneElement(document.getSceneElement("image-a")!))
      .toThrow("원본 에셋");
    expect(studioCrdtElementToSceneElement(
      document.getSceneElement("image-a")!,
      hugeImage
    )).toMatchObject({
      id: "image-a",
      type: "image",
      src: hugeImage.src,
      authoredMetadata: { keep: true },
      groupId: "backgrounds",
    });

    const result = reconcile(document, [
      page("page-a", [hugeImage, background3d], [group("backgrounds")]),
    ]);
    expect(result[0]!.elements.map(({ id }) => id)).toEqual(["scene-3d", "image-a"]);
    expect(result[0]!.elements[0]).toMatchObject({
      type: "background3d",
      src: "studio3d://scene/city-night",
      groupId: "backgrounds",
      authoredMetadata: { keep: true },
    });
    expect(result[0]!.elements[1]!.src).toBe(hugeImage.src);
    document.destroy();
  });

  it("converges an image page move with a peer z-order edit and resolves same-named groups by page", () => {
    const seed = new StudioCrdtDocument();
    const moving = asset("moving", "image", "asset://character.webp", "shared");
    const model = asset("model", "vrm", "asset://actor.vrm", "shared", 30);
    const empty = [
      page("page-a", [], [group("shared", "A 공유")]),
      page("page-b", [], [group("shared", "B 공유")]),
    ];
    const initial = [
      page("page-a", [moving, model], [group("shared", "A 공유")]),
      page("page-b", [], [group("shared", "B 공유")]),
    ];
    publishStudioCrdtSceneGraphDiff(seed, empty, initial);
    const initialUpdate = seed.encodeStateAsUpdate();
    const left = new StudioCrdtDocument(initialUpdate);
    const right = new StudioCrdtDocument(initialUpdate);
    const moved = [
      page("page-a", [model], [group("shared", "A 공유")]),
      page("page-b", [moving], [group("shared", "B 공유")]),
    ];

    publishStudioCrdtSceneGraphDiff(left, initial, moved);
    right.moveElement("model", "moving");
    converge(left, right, seed);

    expect(left.getSceneElement("moving")).toEqual(right.getSceneElement("moving"));
    expect(left.getSceneElement("model")).toEqual(right.getSceneElement("model"));
    expect(left.getSceneElement("moving")).toMatchObject({
      pageId: "page-b",
      layerId: "shared",
      deleted: false,
      payload: { type: "reference", props: { elementType: "image" } },
    });
    expect(left.getSceneElement("model")).toMatchObject({
      pageId: "page-a",
      layerId: "shared",
      payload: { type: "reference", props: { elementType: "vrm" } },
    });
    const leftPages = reconcile(left, moved);
    const rightPages = reconcile(right, structuredClone(moved));
    expect(leftPages).toEqual(rightPages);
    expect(leftPages[0]!.elements).toHaveLength(1);
    expect(leftPages[0]!.elements[0]).toMatchObject({ id: "model", src: "asset://actor.vrm" });
    expect(leftPages[1]!.elements[0]).toMatchObject({
      id: "moving",
      src: "asset://character.webp",
      groupId: "shared",
    });
    expect(leftPages[0]!.groups[0]!.name).toBe("A 공유");
    expect(leftPages[1]!.groups[0]!.name).toBe("B 공유");
    seed.destroy();
    left.destroy();
    right.destroy();
  });

  it("converges a concurrent group tombstone and reference reassignment without orphan membership", () => {
    const seed = new StudioCrdtDocument();
    seed.addLayerGroup(groupInput("page-a", "cast"));
    seed.addLayerGroup(groupInput("page-a", "props"));
    const image = asset("portrait", "image", "asset://portrait.webp", "cast");
    seed.addSceneElement(studioElementToCrdtSceneElement("page-a", image));
    const initialUpdate = seed.encodeStateAsUpdate();
    const left = new StudioCrdtDocument(initialUpdate);
    const right = new StudioCrdtDocument(initialUpdate);

    left.deleteLayerGroup("page-a", "cast");
    right.patchSceneElement("portrait", { layerId: "props" });
    converge(left, right, seed);

    expect(left.getLayerGroup("page-a", "cast")).toBeNull();
    expect(right.getLayerGroup("page-a", "cast")).toBeNull();
    expect(left.getSceneElement("portrait")).toEqual(right.getSceneElement("portrait"));
    expect(left.getSceneElement("portrait")?.layerId).toBe("props");
    const stale = [page(
      "page-a",
      [image],
      [group("cast", "등장인물"), group("props", "소품")]
    )];
    const leftPages = reconcile(left, stale);
    const rightPages = reconcile(right, structuredClone(stale));
    expect(leftPages).toEqual(rightPages);
    expect(leftPages[0]!.groups.map(({ id }) => id)).toEqual(["props"]);
    expect(leftPages[0]!.elements[0]).toMatchObject({
      id: "portrait",
      groupId: "props",
      src: "asset://portrait.webp",
    });

    seed.destroy();
    left.destroy();
    right.destroy();
  });

  it("preserves a moved asset body when its source page is concurrently tombstoned", () => {
    const seed = new StudioCrdtDocument();
    const photo = asset("moving-photo", "image", "asset://moving-photo.webp");
    const initial = [
      page("page-a", [photo]),
      page("page-b"),
    ];
    publishStudioCrdtSceneGraphDiff(seed, [], initial);
    const initialUpdate = seed.encodeStateAsUpdate();
    const left = new StudioCrdtDocument(initialUpdate);
    const right = new StudioCrdtDocument(initialUpdate);

    left.deletePage("page-a");
    right.patchSceneElement("moving-photo", {
      pageId: "page-b",
      layerId: "page-root",
    });
    converge(left, right, seed);

    const leftPages = reconcile(left, initial);
    const rightPages = reconcile(right, structuredClone(initial));
    expect(leftPages).toEqual(rightPages);
    expect(leftPages.map(({ id }) => id)).toEqual(["page-b"]);
    expect(leftPages[0]!.elements).toEqual([
      expect.objectContaining({
        id: "moving-photo",
        type: "image",
        src: "asset://moving-photo.webp",
      }),
    ]);

    seed.destroy();
    left.destroy();
    right.destroy();
  });

  it("carries remote reference moves and tombstones through undo snapshots without stale revival", () => {
    const document = new StudioCrdtDocument();
    document.addLayerGroup(groupInput("page-a", "cast"));
    document.addLayerGroup(groupInput("page-b", "props"));
    const original = asset("photo", "image", "asset://history-a.webp", "cast", 10);
    document.addSceneElement(studioElementToCrdtSceneElement("page-a", original));
    document.patchSceneElement("photo", { pageId: "page-b", layerId: "props" });
    const history = [
      [
        page("page-a", [original], [group("cast")]),
        page("page-b", [], [group("props")]),
      ],
      [
        page("page-a", [
          asset("photo", "image", "asset://history-b.webp", "cast", 90),
        ], [group("cast")]),
        page("page-b", [], [group("props")]),
      ],
    ];
    const frontier = {
      strokes: document.getStrokes({ includeDeleted: true }),
      sceneElements: document.getSceneElements({ includeDeleted: true }),
      pages: document.getPages(true),
      layerGroups: document.getLayerGroups({ includeDeleted: true }),
    };
    const moved = reconcileStudioCrdtSceneGraphHistory(history, 1, frontier, {
      strokeIds: new Set<string>(),
      sceneElementIds: new Set(["photo"]),
      pageIds: new Set<string>(),
      layerGroupIds: new Set<string>(),
    });

    expect(moved.history[0]![0]!.elements).toEqual([]);
    expect(moved.history[1]![0]!.elements).toEqual([]);
    expect(moved.history[0]![1]!.elements[0]).toMatchObject({
      id: "photo",
      src: "asset://history-a.webp",
      groupId: "props",
    });
    expect(moved.history[1]![1]!.elements[0]).toMatchObject({
      id: "photo",
      src: "asset://history-b.webp",
      x: 90,
      groupId: "props",
    });

    document.deleteSceneElement("photo");
    const tombstoned = reconcileStudioCrdtSceneGraphHistory(moved.history, 1, {
      ...frontier,
      sceneElements: document.getSceneElements({ includeDeleted: true }),
    }, {
      strokeIds: new Set<string>(),
      sceneElementIds: new Set(["photo"]),
      pageIds: new Set<string>(),
      layerGroupIds: new Set<string>(),
    });
    for (const snapshot of tombstoned.history) {
      expect(snapshot.flatMap((candidate) => candidate.elements)).toEqual([]);
    }

    const staleBefore = [
      page("page-a", [original], [group("cast")]),
      page("page-b", [], [group("props")]),
    ];
    const staleAfter = [
      page("page-a", [structuredClone(original)], [group("cast")], "unrelated"),
      page("page-b", [], [group("props")]),
    ];
    publishStudioCrdtSceneGraphDiff(document, staleBefore, staleAfter);
    expect(document.getSceneElement("photo")).toBeNull();

    const absent = [
      page("page-a", [], [group("cast")]),
      page("page-b", [], [group("props")]),
    ];
    publishStudioCrdtSceneGraphDiff(document, absent, staleBefore);
    expect(document.getSceneElement("photo")).toMatchObject({
      pageId: "page-a",
      layerId: "cast",
      deleted: false,
      payload: { type: "reference", props: { elementType: "image" } },
    });
    document.destroy();
  });
});
