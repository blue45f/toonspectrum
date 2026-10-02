/**
 * 레퍼런스 이미지로 렌더할 URL 스킴 검증.
 *
 * `type="url"`은 브라우저 힌트일 뿐 검증이 아니며, 3D 셰이퍼 스냅샷 입력값은 원문이 그대로 이
 * 경로에 온다. 이 값은 localStorage에도 남아 있으므로 입력 지점에서 거르면 저장본을 못 막는다.
 * 그래서 렌더 직전에 최종으로 거른다.
 *
 * 허용: 상대경로(번들 아바타)·https·http·blob·래스터 data:image. 그 외 스킴은 렌더하지 않는다.
 *
 * 스킴 판정은 접두 문자열 리터럴 비교로 한다. 집합 조회나 정규식 캡처로 판정하면 정적 분석이
 * "어떤 값이 통과하는지" 알 수 없어 검증된 값도 sink로 흘려보낸다(알림 #130 재발 원인).
 */

// SVG는 <svg onload=...>로 스크립트를 실행할 수 있어 data:image 중에서도 제외한다.
const RASTER_DATA_IMAGE_PREFIXES = [
  "data:image/apng,",
  "data:image/apng;",
  "data:image/avif,",
  "data:image/avif;",
  "data:image/bmp,",
  "data:image/bmp;",
  "data:image/gif,",
  "data:image/gif;",
  "data:image/jpeg,",
  "data:image/jpeg;",
  "data:image/png,",
  "data:image/png;",
  "data:image/webp,",
  "data:image/webp;",
];

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
  // 데이터 URL은 대소문자를 무시해야 한다(data:image/PNG도 브라우저엔 정상 이미지다).
  // 소문자로 접어 접두 문자열 리터럴과 비교하면 정적 분석이 통과 경로를 좇을 수 있다.
  const schemeFolded = normalized.toLowerCase();
  for (const prefix of RASTER_DATA_IMAGE_PREFIXES) {
    if (schemeFolded.startsWith(prefix)) return normalized;
  }
  if (schemeFolded.startsWith("data:")) return null;
  if (schemeFolded.startsWith("https://") || schemeFolded.startsWith("http://")) return normalized;
  if (schemeFolded.startsWith("blob:")) return normalized;
  return null;
}

/**
 * 렌더 직전 마지막 검증.
 *
 * sanitizer가 값을 "반환"하면 정적 분석은 호출자를 통과 경로로 보지 못해 taint를 그대로 sink까지
 * 흘려보낸다(알림 #130 재발 원인). 그래서 sink에서 직접 스킴을 대조하는 형태로 검증한다.
 * 반환값이 아니라 "허용되는 URL 문자열 그 자체"만 통과시킨다.
 */
export function isSafeReferenceImageUrl(value: string): boolean {
  if (value.startsWith("//")) return false;
  const schemeFolded = value.toLowerCase();
  for (const prefix of RASTER_DATA_IMAGE_PREFIXES) {
    if (schemeFolded.startsWith(prefix)) return true;
  }
  return (
    schemeFolded.startsWith("https://") ||
    schemeFolded.startsWith("http://") ||
    schemeFolded.startsWith("blob:") ||
    schemeFolded.startsWith("/") ||
    schemeFolded.startsWith("./") ||
    schemeFolded.startsWith("../")
  );
}