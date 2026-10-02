/**
 * LPC 캐릭터 레이어별 크레딧(credits.json의 entries) 해석.
 *
 * 화면은 요약(작가·라이선스별 레이어 수)을 정적 상수로 바로 보여 주고, 레이어마다의 작가·선택 라이선스·원본 출처는
 * 사용자가 펼칠 때만 `credits.json`을 내려받아 보여 준다. 정적 파일이지만 외부에서 가져온 데이터로 보고
 * 모양과 URL 스킴을 확인해, 깨진 파일이나 `javascript:` 같은 링크가 화면에 닿지 않게 한다.
 * (원본 크레딧에는 `http://` 출처 주소가 섞여 있다. 출처 링크는 새 탭에서 열기만 하므로 http·https를 모두 받는다.)
 */

export interface StudioLpcCreditEntry {
  /** credits.json의 안정 id(레이어 경로를 하이픈으로 이은 값). */
  readonly id: string;
  /** LPC 원본 저장소 안의 레이어 경로(예: body/bodies/female). */
  readonly sourcePath: string;
  readonly chosenLicense: string;
  /** 선택한 라이선스 전문 주소(http·https). */
  readonly chosenLicenseUrl: string;
  readonly authors: readonly string[];
  /** 원본 출처 주소(http·https). */
  readonly urls: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    const text = nonEmptyString(item);
    if (text === null) return null;
    items.push(text);
  }
  return items;
}

/** 링크로 열어도 안전한 웹 주소(http·https)만 통과시킨다. javascript:·data:·상대 경로는 거부한다. */
export function isStudioLpcCreditWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function parseEntry(value: unknown): StudioLpcCreditEntry | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const sourcePath = nonEmptyString(value.sourcePath);
  const chosenLicense = nonEmptyString(value.chosenLicense);
  const chosenLicenseUrl = nonEmptyString(value.chosenLicenseUrl);
  const authors = stringList(value.authors);
  const urls = stringList(value.urls);
  if (id === null || sourcePath === null || chosenLicense === null || chosenLicenseUrl === null || authors === null || urls === null) return null;
  if (authors.length === 0 || !isStudioLpcCreditWebUrl(chosenLicenseUrl) || !urls.every(isStudioLpcCreditWebUrl)) return null;
  return Object.freeze({
    id, sourcePath, chosenLicense, chosenLicenseUrl,
    authors: Object.freeze([...authors]),
    // 같은 주소가 겹쳐 있어도 링크 키가 충돌하지 않게 처음 순서를 지키며 합친다.
    urls: Object.freeze([...new Set(urls)]),
  });
}

/**
 * credits.json 본문에서 레이어별 크레딧을 읽는다.
 * 모양이 다르거나 한 항목이라도 깨졌으면 일부만 보여 주지 않고 null을 돌려준다(크레딧이 조용히 빠지는 것을 막는다).
 */
export function parseStudioLpcCreditEntries(value: unknown): readonly StudioLpcCreditEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length === 0) return null;
  const entries: StudioLpcCreditEntry[] = [];
  for (const raw of value.entries) {
    const entry = parseEntry(raw);
    if (entry === null) return null;
    entries.push(entry);
  }
  return Object.freeze(entries);
}

/** 긴 출처 주소를 화면용 짧은 글자로 줄인다(스킴과 앞의 www.를 떼고, 길면 가운데를 줄인다). */
export function studioLpcCreditUrlLabel(url: string, maxLength = 56): string {
  const bare = url.replace(/^https?:\/\//u, "").replace(/^www\./u, "").replace(/\/$/u, "");
  if (bare.length <= maxLength) return bare;
  const head = Math.ceil((maxLength - 1) * 0.65);
  return `${bare.slice(0, head)}…${bare.slice(bare.length - (maxLength - 1 - head))}`;
}
