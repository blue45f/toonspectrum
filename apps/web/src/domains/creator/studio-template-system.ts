export const STUDIO_TEMPLATE_SLOT_KINDS = [
  "text",
  "image",
  "color",
  "asset",
  "number",
] as const;

export type StudioTemplateSlotKind =
  (typeof STUDIO_TEMPLATE_SLOT_KINDS)[number];
export type StudioTemplateApplicationStatus = "ready" | "review" | "blocked";

export const STUDIO_TEMPLATE_LAYOUT_KINDS = [
  "vertical-strip",
  "panel-grid",
  "character-sheet",
  "expression-grid",
  "environment-board",
  "poster",
  "social-carousel",
  "slide",
  "storyboard",
] as const;

export type StudioTemplateLayoutKind =
  (typeof STUDIO_TEMPLATE_LAYOUT_KINDS)[number];
export type StudioTemplateStartMode =
  | "new-project"
  | "append-pages"
  | "replace-page"
  | "layout-only"
  | "style-only";

export interface StudioTemplateCompositionPage {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly layout: StudioTemplateLayoutKind;
  readonly panelCount: number;
  readonly editableSlotIds: readonly string[];
}

export interface StudioTemplateComposition {
  readonly aspectRatio: number;
  readonly canvasLabelKo: string;
  readonly canvasLabelEn: string;
  readonly pages: readonly StudioTemplateCompositionPage[];
  readonly layerLabels: readonly string[];
  readonly includedAssetCount: number;
  readonly startMode: StudioTemplateStartMode;
}

export type StudioTemplateValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "image"; readonly assetId: string; readonly rightsStatus: "allowed" | "warning" | "blocked" }
  | { readonly kind: "color"; readonly value: string }
  | { readonly kind: "asset"; readonly assetId: string; readonly assetType: string; readonly rightsStatus: "allowed" | "warning" | "blocked" }
  | { readonly kind: "number"; readonly value: number };

export interface StudioTemplateSlot {
  readonly id: string;
  readonly label: string;
  readonly kind: StudioTemplateSlotKind;
  readonly required: boolean;
  readonly maxLength: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly acceptedAssetTypes: readonly string[];
  readonly defaultValue: StudioTemplateValue | null;
}

export interface StudioTemplateDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly documentKind: string;
  readonly slots: readonly StudioTemplateSlot[];
  /** Canonical visual structure shared by preview and document handoff. */
  readonly composition?: StudioTemplateComposition;
}

export interface StudioTemplateFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly slotId: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioTemplateApplicationPlan {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly status: StudioTemplateApplicationStatus;
  readonly values: Readonly<Record<string, StudioTemplateValue>>;
  readonly findings: readonly StudioTemplateFinding[];
  readonly missingSlotIds: readonly string[];
}

const COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/iu;

function finding(
  code: string,
  severity: StudioTemplateFinding["severity"],
  slotId: string,
  messageKo: string,
  messageEn: string,
): StudioTemplateFinding {
  return Object.freeze({ code, severity, slotId, messageKo, messageEn });
}

function validNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function validateStudioTemplate(
  template: StudioTemplateDefinition,
): readonly StudioTemplateFinding[] {
  const findings: StudioTemplateFinding[] = [];
  if (!template.id.trim() || !template.title.trim() || !template.documentKind.trim()) {
    findings.push(finding(
      "template-required",
      "error",
      "",
      "템플릿 기본 정보가 완성되지 않았습니다.",
      "Template identity is incomplete.",
    ));
  }
  if (!Number.isSafeInteger(template.version) || template.version < 1) {
    findings.push(finding("template-version", "error", "", "템플릿 버전이 올바르지 않습니다.", "Template version is invalid."));
  }
  const seen = new Set<string>();
  for (const slot of template.slots) {
    if (!slot.id.trim() || !slot.label.trim()) {
      findings.push(finding("slot-required", "error", slot.id, "슬롯 이름이 필요합니다.", "A slot id and label are required."));
    }
    if (seen.has(slot.id)) {
      findings.push(finding("slot-duplicate", "error", slot.id, "같은 슬롯이 두 번 선언됐습니다.", "A template slot is declared more than once."));
    }
    seen.add(slot.id);
    if (slot.maxLength !== null && (!Number.isSafeInteger(slot.maxLength) || slot.maxLength < 1)) {
      findings.push(finding("slot-max-length", "error", slot.id, "최대 글자 수가 올바르지 않습니다.", "Slot maximum length is invalid."));
    }
    if (slot.minimum !== null && !validNumber(slot.minimum)) {
      findings.push(finding("slot-minimum", "error", slot.id, "최솟값이 올바르지 않습니다.", "Slot minimum is invalid."));
    }
    if (slot.maximum !== null && !validNumber(slot.maximum)) {
      findings.push(finding("slot-maximum", "error", slot.id, "최댓값이 올바르지 않습니다.", "Slot maximum is invalid."));
    }
    if (slot.minimum !== null && slot.maximum !== null && slot.minimum > slot.maximum) {
      findings.push(finding("slot-range", "error", slot.id, "숫자 범위가 뒤바뀌었습니다.", "Slot numeric range is invalid."));
    }
    if (slot.defaultValue && slot.defaultValue.kind !== slot.kind) {
      findings.push(finding("slot-default-kind", "error", slot.id, "기본값 종류가 슬롯과 다릅니다.", "Slot default value has the wrong kind."));
    }
  }

  const composition = template.composition;
  if (composition) {
    if (!Number.isFinite(composition.aspectRatio) || composition.aspectRatio <= 0) {
      findings.push(finding(
        "composition-aspect-ratio",
        "error",
        "",
        "템플릿 미리보기 비율이 올바르지 않습니다.",
        "Template preview aspect ratio is invalid.",
      ));
    }
    if (!composition.canvasLabelKo.trim() || !composition.canvasLabelEn.trim()) {
      findings.push(finding(
        "composition-canvas-label",
        "error",
        "",
        "템플릿 출력 규격 이름이 필요합니다.",
        "Template canvas labels are required.",
      ));
    }
    if (composition.pages.length === 0) {
      findings.push(finding(
        "composition-pages",
        "error",
        "",
        "템플릿에 최소 한 개의 페이지가 필요합니다.",
        "A template composition requires at least one page.",
      ));
    }
    const declaredSlots = new Set(template.slots.map((slot) => slot.id));
    const pageIds = new Set<string>();
    for (const page of composition.pages) {
      if (!page.id.trim() || !page.labelKo.trim() || !page.labelEn.trim()) {
        findings.push(finding(
          "composition-page-required",
          "error",
          "",
          "템플릿 페이지 정보가 완성되지 않았습니다.",
          "Template page identity is incomplete.",
        ));
      }
      if (pageIds.has(page.id)) {
        findings.push(finding(
          "composition-page-duplicate",
          "error",
          "",
          "같은 템플릿 페이지가 두 번 선언됐습니다.",
          "A template page is declared more than once.",
        ));
      }
      pageIds.add(page.id);
      if (!Number.isSafeInteger(page.panelCount) || page.panelCount < 0) {
        findings.push(finding(
          "composition-panel-count",
          "error",
          "",
          "템플릿 컷 수가 올바르지 않습니다.",
          "Template panel count is invalid.",
        ));
      }
      for (const slotId of page.editableSlotIds) {
        if (!declaredSlots.has(slotId)) {
          findings.push(finding(
            "composition-slot-reference",
            "error",
            slotId,
            "미리보기 페이지가 존재하지 않는 편집 슬롯을 참조합니다.",
            "A preview page references an unknown editable slot.",
          ));
        }
      }
    }
    if (composition.layerLabels.length === 0
      || composition.layerLabels.some((label) => !label.trim())) {
      findings.push(finding(
        "composition-layers",
        "error",
        "",
        "템플릿 레이어 구성이 필요합니다.",
        "Template layer metadata is required.",
      ));
    }
    if (!Number.isSafeInteger(composition.includedAssetCount)
      || composition.includedAssetCount < 0) {
      findings.push(finding(
        "composition-assets",
        "error",
        "",
        "포함 에셋 수가 올바르지 않습니다.",
        "Included asset count is invalid.",
      ));
    }
  }
  return Object.freeze(findings);
}

function valueFinding(
  code: string,
  severity: StudioTemplateFinding["severity"],
  slot: StudioTemplateSlot,
  ko: string,
  en: string,
): StudioTemplateFinding {
  return finding(code, severity, slot.id, ko, en);
}

export function planStudioTemplateApplication(
  template: StudioTemplateDefinition,
  suppliedValues: Readonly<Record<string, StudioTemplateValue>>,
): StudioTemplateApplicationPlan {
  if (validateStudioTemplate(template).some((item) => item.severity === "error")) {
    throw new Error("A valid template definition is required.");
  }
  const slotIds = new Set(template.slots.map((slot) => slot.id));
  const unknownIds = Object.keys(suppliedValues).filter((id) => !slotIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown template slots: ${unknownIds.join(", ")}`);
  }

  const values: Record<string, StudioTemplateValue> = {};
  const findings: StudioTemplateFinding[] = [];
  const missingSlotIds: string[] = [];
  for (const slot of template.slots) {
    const value = suppliedValues[slot.id] ?? slot.defaultValue;
    if (!value) {
      if (slot.required) {
        missingSlotIds.push(slot.id);
        findings.push(valueFinding(
          "required-slot-missing",
          "error",
          slot,
          `${slot.label} 내용을 입력하세요.`,
          `Provide a value for ${slot.label}.`,
        ));
      }
      continue;
    }
    if (value.kind !== slot.kind) {
      findings.push(valueFinding(
        "slot-kind-mismatch",
        "error",
        slot,
        `${slot.label}에 맞지 않는 종류의 값입니다.`,
        `The value type does not match ${slot.label}.`,
      ));
      continue;
    }
    values[slot.id] = value;
    if (value.kind === "text" && slot.maxLength !== null && value.value.length > slot.maxLength) {
      findings.push(valueFinding(
        "text-overflow-risk",
        "warning",
        slot,
        `${slot.label}이 권장 글자 수를 넘습니다. 자동으로 자르지 않고 레이아웃을 확인합니다.`,
        `${slot.label} exceeds the recommended length. Review layout instead of truncating it.`,
      ));
    }
    if (value.kind === "color" && !COLOR_PATTERN.test(value.value)) {
      findings.push(valueFinding("color-invalid", "error", slot, "색상 값이 올바르지 않습니다.", "The color value is invalid."));
    }
    if (value.kind === "number") {
      if (!validNumber(value.value)) {
        findings.push(valueFinding("number-invalid", "error", slot, "숫자 값이 올바르지 않습니다.", "The numeric value is invalid."));
      } else if (
        (slot.minimum !== null && value.value < slot.minimum)
        || (slot.maximum !== null && value.value > slot.maximum)
      ) {
        findings.push(valueFinding("number-range", "warning", slot, "권장 숫자 범위를 벗어납니다.", "The value is outside the recommended range."));
      }
    }
    if (value.kind === "asset" && slot.acceptedAssetTypes.length > 0
      && !slot.acceptedAssetTypes.includes(value.assetType)) {
      findings.push(valueFinding("asset-type", "error", slot, "이 슬롯과 호환되지 않는 에셋입니다.", "The asset is incompatible with this slot."));
    }
    if ((value.kind === "asset" || value.kind === "image") && value.rightsStatus === "blocked") {
      findings.push(valueFinding("asset-rights", "error", slot, "현재 용도로 사용할 수 없는 에셋입니다.", "The asset is not licensed for this use."));
    } else if ((value.kind === "asset" || value.kind === "image") && value.rightsStatus === "warning") {
      findings.push(valueFinding("asset-rights-review", "warning", slot, "에셋 사용 조건을 확인하세요.", "Review the asset usage conditions."));
    }
  }

  const blocking = findings.some((item) => item.severity === "error");
  const warning = findings.some((item) => item.severity === "warning");
  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    status: blocking ? "blocked" : warning ? "review" : "ready",
    values: Object.freeze({ ...values }),
    findings: Object.freeze(findings),
    missingSlotIds: Object.freeze(missingSlotIds),
  });
}
