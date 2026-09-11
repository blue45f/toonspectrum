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
