import { describe, expect, it } from "vitest";

import {
  diffStudioSeriesKits,
  resolveStudioSeriesBalloonStyle,
  resolveStudioSeriesTextStyle,
  validateStudioSeriesKit,
  type StudioSeriesKit,
} from "./studio-series-kit";

const KIT: StudioSeriesKit = Object.freeze({
  schemaVersion: 1,
  id: "series-kit-1",
  projectId: "project-1",
  version: 1,
  name: "작품 기본 스타일",
  colors: [
    { id: "ink", label: "잉크", value: "#171717" },
    { id: "paper", label: "종이", value: "#ffffff" },
  ],
  textStyles: [
    {
      id: "dialogue",
      label: "대사",
      fontId: "font-dialogue",
      sizePx: 22,
      lineHeight: 1.45,
      weight: 500,
      colorTokenId: "ink",
      verticalWriting: false,
    },
  ],
  balloonStyles: [
    {
      id: "normal",
      label: "기본 말풍선",
      textStyleId: "dialogue",
      fillColorTokenId: "paper",
      strokeColorTokenId: "ink",
      strokeWidthPx: 2,
      paddingPx: 16,
      cornerRadiusPx: 24,
    },
  ],
  components: [
    { id: "logo", label: "작품 로고", kind: "logo", assetId: "asset-logo" },
  ],
  exportDefaults: [
    { targetId: "webtoon-platform", widthPx: 800, format: "png", colorSpace: "srgb" },
  ],
});

describe("Studio Series Kit", () => {
  it("validates and resolves project-wide text and balloon styles", () => {
    expect(validateStudioSeriesKit(KIT)).toEqual([]);
    expect(resolveStudioSeriesTextStyle(KIT, "dialogue")).toMatchObject({
      fontId: "font-dialogue",
      color: "#171717",
      sizePx: 22,
    });
    expect(resolveStudioSeriesBalloonStyle(KIT, "normal")).toMatchObject({
      fillColor: "#ffffff",
      strokeColor: "#171717",
      text: { id: "dialogue" },
    });
  });

  it("reports duplicate identifiers and broken style references", () => {
    const issues = validateStudioSeriesKit({
      ...KIT,
      colors: [KIT.colors[0]!, { ...KIT.colors[0]! }],
      textStyles: [{ ...KIT.textStyles[0]!, colorTokenId: "missing", sizePx: 9 }],
      balloonStyles: [{
        ...KIT.balloonStyles[0]!,
        textStyleId: "missing",
        fillColorTokenId: "missing",
      }],
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "color-id-duplicate", severity: "error" }),
      expect.objectContaining({ code: "text-color-missing", severity: "error" }),
      expect.objectContaining({ code: "text-size-small", severity: "warning" }),
      expect.objectContaining({ code: "balloon-text-style-missing", severity: "error" }),
      expect.objectContaining({ code: "balloon-color-missing", severity: "error" }),
    ]));
  });

  it("diffs only the tokens and components changed between versions", () => {
    const next: StudioSeriesKit = {
      ...KIT,
      version: 2,
      colors: KIT.colors.map((color) => color.id === "ink"
        ? { ...color, value: "#202020" }
        : color),
      components: [...KIT.components, {
        id: "cover-frame",
        label: "표지 프레임",
        kind: "cover",
        assetId: "asset-cover-frame",
      }],
    };
    expect(diffStudioSeriesKits(KIT, next)).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      changedColorIds: ["ink"],
      changedTextStyleIds: [],
      changedBalloonStyleIds: [],
      changedComponentIds: ["cover-frame"],
      changedExportTargetIds: [],
    });
  });
});
