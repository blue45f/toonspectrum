import { describe, expect, it } from "vitest";

import { createDefaultStudioDrawingAssistDocument } from "../brush/studio-drawing-assist-document";
import { captureLayerComp } from "../layer/studio-layer-comps";
import { DEFAULT_PAGE_GRADE } from "../studio-page-grade";
import { cloneJsonObject, jsonObject, jsonValue } from "./studio-crdt-json-value";
import { studioPageToCrdtPage as bridgePageToCrdtPage } from "./studio-crdt-page-bridge";
import {
  hasSameStudioCrdtPageMetadata,
  STUDIO_CRDT_PAGE_MAX_BYTES,
  STUDIO_CRDT_PAGE_PROPERTY_KEYS,
  studioPageToCrdtPage,
  validateStudioCrdtPagePayload,
} from "./studio-crdt-page-payload";
import {
  STUDIO_CRDT_PAGE_MAX_BYTES as legacyPageMaxBytes,
  STUDIO_CRDT_PAGE_PROPERTY_KEYS as legacyPagePropertyKeys,
  validateStudioCrdtPagePayload as legacyValidatePagePayload,
} from "./studio-crdt-scene-schema";

import type { PageState } from "../studio-page-state";
import type { StudioCrdtJsonObject } from "./studio-crdt-json-value";

const page: PageState = { id: "page", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };

describe("lightweight page payload admission", () => {
  it("keeps the bridge's existing serializer API identical and preserves the wire projection", () => {
    expect(bridgePageToCrdtPage).toBe(studioPageToCrdtPage);
    expect(studioPageToCrdtPage(page)).toEqual({
      id: "page", payload: { version: 1, props: { bg: "#fff", bgGrad: null, canvasH: 1080 } },
    });
  });

  it("preserves the scene schema's public page contract through the same validator and key set", () => {
    expect(legacyValidatePagePayload).toBe(validateStudioCrdtPagePayload);
    expect(legacyPagePropertyKeys).toBe(STUDIO_CRDT_PAGE_PROPERTY_KEYS);
    expect(legacyPageMaxBytes).toBe(STUDIO_CRDT_PAGE_MAX_BYTES);
    expect(legacyPageMaxBytes).toBe(8192);
    const input = studioPageToCrdtPage(page).payload;
    expect(legacyValidatePagePayload(input)).toEqual(input);
  });

  it.each([undefined, null])("requires admission when there is no previous page (%s)", (previous) => {
    expect(hasSameStudioCrdtPageMetadata(previous, page)).toBe(false);
  });

  it("skips metadata serialization for immutable element, group and sidecar-only changes", () => {
    const next: PageState = {
      ...page, id: "copied-page", elements: [{
        id: "image", type: "image", src: "", x: 0, y: 0, width: 10, height: 10, rotation: 0,
      }], groups: [{ id: "folder", name: "새 폴더" }], grade: { ...DEFAULT_PAGE_GRADE, brightness: 0.5 },
    };
    expect(hasSameStudioCrdtPageMetadata(page, page)).toBe(true);
    expect(hasSameStudioCrdtPageMetadata(page, next)).toBe(true);
    expect(studioPageToCrdtPage(next).payload).toEqual(studioPageToCrdtPage(page).payload);
  });

  it.each([
    { bg: "#000" }, { bgGrad: ["#fff", "#000"] }, { canvasH: 1200 },
    { name: "페이지 이름" }, { note: "메모" }, { hideMaster: false }, { shotType: "wide" },
    { cameraAngle: "low" }, { paperSurface: { kind: "washi", seed: 1 } }, { paperGrainVisible: false },
    { drawingAssist: createDefaultStudioDrawingAssistDocument({ canvasWidth: 800, canvasHeight: 1080 }) },
    { layerComps: [captureLayerComp("콤프", [], "comp", 1)] },
  ] satisfies Partial<PageState>[])("revalidates a changed serialized page property %j", (patch) => {
    expect(hasSameStudioCrdtPageMetadata(page, { ...page, ...patch })).toBe(false);
  });

  it("revalidates nested metadata replacement even when its serialized values are equal", () => {
    const previous = { ...page, layerComps: [captureLayerComp("콤프", [], "comp", 1)] };
    const next = { ...previous, layerComps: [...previous.layerComps] };
    expect(studioPageToCrdtPage(next).payload).toEqual(studioPageToCrdtPage(previous).payload);
    expect(hasSameStudioCrdtPageMetadata(previous, next)).toBe(false);
    expect(hasSameStudioCrdtPageMetadata(previous, { ...previous, layerComps: undefined })).toBe(false);
  });

  const invalidPagePropertyCases: { props: StudioCrdtJsonObject; message: string }[] = [
    { props: { bgGrad: false, note: false }, message: "페이지 그라데이션이 올바르지 않습니다." },
    { props: { note: false, hideMaster: "bad" }, message: "페이지의 note 값이 올바르지 않습니다." },
    { props: { hideMaster: "bad", paperGrainVisible: "bad" }, message: "페이지 마스터 표시 값이 올바르지 않습니다." },
    { props: { paperGrainVisible: "bad", paperSurface: null }, message: "페이지 종이 결 표시 값이 올바르지 않습니다." },
    { props: { paperSurface: null, layerComps: null }, message: "페이지 종이 표면 설정이 올바르지 않습니다." },
    { props: { layerComps: null, drawingAssist: null }, message: "페이지 레이어 콤프가 올바르지 않습니다." },
    { props: { drawingAssist: null, note: "한".repeat(3000) }, message: "페이지 드로잉 보조 설정이 손상되었거나 지원하지 않는 버전입니다." },
    { props: { note: "한".repeat(3000) }, message: "페이지 정보가 실시간 동기화 8KiB 한도를 초과했습니다." },
  ];

  it.each(invalidPagePropertyCases)(
    "preserves the first invalid field before downstream normalization: $message",
    ({ props, message }) => {
      expect(() => validateStudioCrdtPagePayload({
        version: 1, props: { bg: "#fff", bgGrad: null, canvasH: 1080, ...props },
      })).toThrow(message);
    },
  );

  it("detaches paper and drawing-assist state without changing the serialized page", () => {
    const drawingAssist = createDefaultStudioDrawingAssistDocument({ canvasWidth: 800, canvasHeight: 1080 });
    drawingAssist.perspective.points = [{ id: "point", x: 24, y: 80 }];
    const props = jsonObject({ ...page, drawingAssist, paperSurface: { kind: "washi", seed: 0xff_ff_ff_ff } });
    if (!props) throw new Error("The drawing-assist fixture must be valid JSON.");
    delete props.id;
    delete props.elements;
    const expected = cloneJsonObject(props);
    const validated = validateStudioCrdtPagePayload({ version: 1, props });
    expect(validated.props).toEqual(expected);
    expect(validated.props.paperSurface).not.toBe(props.paperSurface);
    expect(validated.props.drawingAssist).not.toBe(props.drawingAssist);
    drawingAssist.perspective.points[0].x = 99;
    props.drawingAssist = null;
    expect(validated.props).toEqual(expected);
  });
});

describe("shared CRDT JSON normalization", () => {
  it("detaches finite nested JSON while omitting unsupported object properties", () => {
    const source = { text: "한글", enabled: false, count: 3, absent: undefined, invalid: Number.NaN,
      list: [null, { text: "nested", missing: undefined }] };
    const normalized = jsonObject(source);
    expect(normalized).toEqual({ text: "한글", enabled: false, count: 3, list: [null, { text: "nested" }] });
    expect(normalized).not.toBe(source);
    expect(normalized?.list).not.toBe(source.list);
  });

  it("rejects unsupported array entries instead of changing their indices", () => {
    expect(jsonValue([1, undefined, 3])).toBeUndefined();
    expect(jsonValue([Number.POSITIVE_INFINITY])).toBeUndefined();
    expect(jsonObject([1, 2])).toBeUndefined();
    expect(jsonObject(null)).toBeUndefined();
  });

  it("keeps strict envelope cloning distinct from permissive value projection", () => {
    const source = { nested: { enabled: true }, list: [1, null, "한글"] };
    const cloned = cloneJsonObject(source);
    expect(cloned).toEqual(source);
    expect(cloned.nested).not.toBe(source.nested);
    expect(cloned.list).not.toBe(source.list);
    expect(jsonObject({ invalid: Number.NaN })).toEqual({});
    expect(() => cloneJsonObject({ invalid: Number.NaN })).toThrow(/유한하지/u);
    expect(() => cloneJsonObject({ "bad\0key": true })).toThrow(/키/u);
    expect(() => cloneJsonObject({ text: "x".repeat(65_537) })).toThrow(/문자열/u);
  });

  it("shares the entry budget across siblings and resets it after each successful or rejected clone", () => {
    const exactLimit = { values: Array.from({ length: 4094 }, () => null) };
    expect(cloneJsonObject(exactLimit)).toEqual(exactLimit);
    expect(cloneJsonObject(exactLimit)).toEqual(exactLimit);
    const overLimit = {
      first: Array.from({ length: 2047 }, () => null),
      second: Array.from({ length: 2047 }, () => null),
    };
    expect(() => cloneJsonObject(overLimit)).toThrow("장면 확장 데이터가 허용 범위를 벗어났습니다.");
    expect(cloneJsonObject(exactLimit)).toEqual(exactLimit);
  });
});
