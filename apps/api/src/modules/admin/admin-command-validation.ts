import { BadRequestException } from "@nestjs/common";

import type { AppConfigPayload } from "./admin-types";

const ADMIN_CONFIG_BOOLEAN_FIELDS = [
  "monetizationEnabled",
  "authKakao",
  "authNaver",
  "showCovers",
  "showPricing",
  "showAvailability",
  "showSynopsis",
  "showRelatedInfo",
] as const;

const ADMIN_CONFIG_BOOLEAN_FIELD_SET = new Set<string>(
  ADMIN_CONFIG_BOOLEAN_FIELDS,
);

/** Destructive commands require an explicit JSON boolean, not truthiness.
 * In particular, "false", 0, null, a missing field and arrays must not silently
 * switch content visibility or take the service into maintenance mode.
 */
export function requireAdminCommandBoolean(
  value: unknown,
  field: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException({
      error: `${field} 값은 true 또는 false여야 해요.`,
    });
  }
  return value;
}

/**
 * Global configuration changes accept only the documented boolean keys. This
 * rejects unknown fields and string truthiness such as `"false"`, which would
 * otherwise enable a production flag when coerced with `!!value`.
 */
export function requireAdminConfigPatch(value: unknown): AppConfigPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({
      error: "설정 변경 본문은 객체여야 해요.",
    });
  }

  const source = value as Record<string, unknown>;
  const unknownFields = Object.keys(source).filter(
    (field) => !ADMIN_CONFIG_BOOLEAN_FIELD_SET.has(field),
  );
  if (unknownFields.length > 0) {
    throw new BadRequestException({
      error: `지원하지 않는 설정 필드예요: ${unknownFields.join(", ")}`,
    });
  }

  const patch: AppConfigPayload = {};
  let fieldCount = 0;
  for (const field of ADMIN_CONFIG_BOOLEAN_FIELDS) {
    if (!Object.hasOwn(source, field)) continue;
    patch[field] = requireAdminCommandBoolean(source[field], field);
    fieldCount += 1;
  }
  if (fieldCount === 0) {
    throw new BadRequestException({
      error: "변경할 설정을 1개 이상 전달해 주세요.",
    });
  }
  return patch;
}
