/**
 * 레퍼런스 이미지로 렌더할 URL 스킴 검증.
 *
 * `type="url"`은 브라우저 힌트일 뿐 검증이 아니며, 3D 셰이퍼 스냅샷 입력값은 원문이 그대로 이
 * 경로에 온다. 이 값은 localStorage에도 남아 있으므로 입력 지점에서 거르면 저장본을 못 막는다.
 * 그래서 렌더 직전에 최종으로 거른다.
 *
 * 허용: 상대경로(번들 아바타)·https·http·blob·래스터 data:image. 그 외 스킴은 렌더하지 않는다.
 */
const REFERENCE_IMAGE_SCHEMES = new Set(["http:", "https:", "blob:"]);

// SVG는 <svg onload=...>로 스크립트를 실행할 수 있어 data:image 중에서도 제외한다.
const REFERENCE_IMAGE_RASTER_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// 브라우저는 앞뒤 공백과 제어문자를 버린다. 제거하지 않으면 "java\tscript:"가 스킴을 우회한다.
const STRIPPED_URL_CHARS = new Set(Array.from({ length: 0x21 }, (_, code) => String.fromCharCode(code)));

export function safeReferenceImageSrc(value: string | null): string | null {
  if (!value) return null;
  let normalized = "";
  for (const ch of value) {
    if (!STRIPPED_URL_CHARS.has(ch)) normalized += ch;
  }
  normalized = normalized.trim();
  if (!normalized) return null;
  // 프로토콜 상대 URL("//host/path")은 상대경로처럼 보이지만 외부 호스트를 가리킨다.
  if (normalized.startsWith("//")) return null;
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) return normalized;
  const dataUrl = /^data:([^;,]+)[;,]/i.exec(normalized);
  if (dataUrl) {
    return dataUrl[1] && REFERENCE_IMAGE_RASTER_TYPES.has(dataUrl[1].toLowerCase()) ? normalized : null;
  }
  try {
    const { protocol } = new URL(normalized);
    return REFERENCE_IMAGE_SCHEMES.has(protocol) ? normalized : null;
  } catch {
    return null;
  }
}