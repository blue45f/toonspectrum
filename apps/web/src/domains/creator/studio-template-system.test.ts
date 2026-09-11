import { describe, expect, it } from "vitest";

import {
  planStudioTemplateApplication,
  validateStudioTemplate,
  type StudioTemplateDefinition,
} from "./studio-template-system";

const TEMPLATE: StudioTemplateDefinition = Object.freeze({
  id: "cover-template",
  version: 2,
  title: "작품 표지",
  documentKind: "design",
  slots: [
    {
      id: "title",
      label: "작품명",
      kind: "text",
      required: true,
      maxLength: 20,
      minimum: null,
      maximum: null,
      acceptedAssetTypes: [],
      defaultValue: null,
    },
    {
      id: "hero",
      label: "주인공 이미지",
      kind: "image",
      required: true,
      maxLength: null,
      minimum: null,
      maximum: null,
      acceptedAssetTypes: [],
      defaultValue: null,
    },
    {
      id: "accent",
      label: "강조색",
      kind: "color",
      required: false,
      maxLength: null,
      minimum: null,
      maximum: null,
      acceptedAssetTypes: [],
      defaultValue: { kind: "color", value: "#ff8844" },
    },
  ],
});

describe("Studio template system", () => {
  it("binds project data to a ready template without flattening it", () => {
    expect(validateStudioTemplate(TEMPLATE)).toEqual([]);
    expect(planStudioTemplateApplication(TEMPLATE, {
      title: { kind: "text", value: "별빛 아래 우리" },
      hero: { kind: "image", assetId: "hero-key-art", rightsStatus: "allowed" },
    })).toMatchObject({
      status: "ready",
      missingSlotIds: [],
      values: {
        title: { kind: "text", value: "별빛 아래 우리" },
        hero: { kind: "image", assetId: "hero-key-art" },
        accent: { kind: "color", value: "#ff8844" },
      },
    });
  });

  it("blocks missing required content and incompatible asset rights", () => {
    const plan = planStudioTemplateApplication(TEMPLATE, {
      hero: { kind: "image", assetId: "unlicensed", rightsStatus: "blocked" },
    });
    expect(plan.status).toBe("blocked");
    expect(plan.missingSlotIds).toEqual(["title"]);
    expect(plan.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "required-slot-missing", slotId: "title" }),
      expect.objectContaining({ code: "asset-rights", slotId: "hero" }),
    ]));
  });

  it("warns instead of silently truncating long text", () => {
    const plan = planStudioTemplateApplication(TEMPLATE, {
      title: { kind: "text", value: "아주 길어서 표지의 권장 영역을 넘을 가능성이 높은 작품 제목" },
      hero: { kind: "image", assetId: "hero", rightsStatus: "warning" },
    });
    expect(plan.status).toBe("review");
    expect(plan.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text-overflow-risk", severity: "warning" }),
      expect.objectContaining({ code: "asset-rights-review", severity: "warning" }),
    ]));
  });

  it("rejects malformed templates and unknown slot inputs", () => {
    expect(validateStudioTemplate({
      ...TEMPLATE,
      slots: [TEMPLATE.slots[0]!, { ...TEMPLATE.slots[0]! }],
    })).toContainEqual(expect.objectContaining({ code: "slot-duplicate" }));
    expect(() => planStudioTemplateApplication(TEMPLATE, {
      unknown: { kind: "text", value: "x" },
    })).toThrow("Unknown template slots");
  });
});
