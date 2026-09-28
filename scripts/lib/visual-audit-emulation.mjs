/** 기본 전수 검사(1440/390, 한국어)는 유지하고 명시한 보충 조건만 확장한다. */
export function auditViewportOverrides(input) {
  if (!input) return null;
  const widths = input.split(",").map((value) => Number(value.trim()));
  if (widths.length > 6 || widths.some((width) => !Number.isInteger(width) || width < 280 || width > 3840)) {
    throw new Error("AUDIT_VIEWPORT_WIDTHS는 280~3840 사이 정수 최대 6개여야 합니다.");
  }
  return [...new Set(widths)].map((width) => [`width-${width}`, {
    width, height: width < 768 ? 844 : 1000, hasTouch: width < 1024, isMobile: width < 768,
  }]);
}

export function auditLanguage(input = "ko") {
  if (!["ko", "en"].includes(input)) throw new Error("AUDIT_LANGUAGE는 ko 또는 en이어야 합니다.");
  return input;
}

export function auditMotion(input = "no-preference") {
  if (!["reduce", "no-preference"].includes(input)) throw new Error("AUDIT_REDUCED_MOTION 값이 올바르지 않습니다.");
  return input;
}
