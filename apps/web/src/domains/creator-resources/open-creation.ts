/** Free-only, browser-side discovery. No credentials, paid fallback, or private manuscript upload. */
export type OpenProvider = "artic" | "cleveland" | "commons" | "wikipedia";
export type KitFormat = "comic" | "character" | "world" | "promo" | "study" | "article";
export interface OpenReference {
  id: string;
  provider: OpenProvider | "saved";
  title: string;
  creator: string;
  date: string;
  sourceUrl: string;
  imageUrl: string;
  rights: "CC0" | "원문 확인";
  credit: string;
  fetchedAt: string;
}
export const OPEN_PROVIDERS: { id: OpenProvider; name: string; detail: string; url: string }[] = [
  { id: "artic", name: "시카고 미술관", detail: "공개 이용 표시가 있는 미술·복식·소품", url: "https://api.artic.edu/docs/" },
  { id: "cleveland", name: "클리블랜드 미술관", detail: "CC0 유물·동양화·공예·장식", url: "https://openaccess-api.clevelandart.org/" },
  { id: "commons", name: "Wikimedia Commons 무료 CC0", detail: "CC0로 표시된 이미지와 파일별 저작자·출처", url: "https://commons.wikimedia.org/" },
  { id: "wikipedia", name: "한국어 배경지식", detail: "한국어 문서 제목·원문 링크 (이미지/본문 재배포 아님)", url: "https://ko.wikipedia.org/" },
];
export const KIT_FORMATS: { id: KitFormat; title: string; detail: string }[] = [
  { id: "comic", title: "4컷 만화 콘티", detail: "도입 → 발견 → 선택 → 반전" },
  { id: "character", title: "캐릭터 설정집", detail: "실루엣·복식·소품·성격" },
  { id: "world", title: "세계관·배경 시트", detail: "공간·문화·생활·설정 근거" },
  { id: "promo", title: "숏폼 홍보 구성안", detail: "15초 컷 구성·자막·제작 체크" },
  { id: "study", title: "드로잉 연습 과제", detail: "관찰·형태·명암·창작 변형" },
  { id: "article", title: "자료 큐레이션 초안", detail: "비교·관찰 포인트·출처 목록" },
];
export const OPEN_TOPICS = ["한복", "갑옷", "도자기", "가구", "건축", "정원", "바다", "꽃", "용", "고양이", "보석", "악기"];
const KEYWORDS: Record<string, string> = {
  한복: "Korean clothing", 한국: "Korea", 조선: "Joseon", 갑옷: "armor", 복식: "costume", 도자기: "ceramics", 가구: "furniture",
  건축: "architecture", 정원: "garden", 바다: "sea", 꽃: "flowers", 용: "dragon", 고양이: "cat", 보석: "jewelry", 악기: "musical instrument",
  풍경: "landscape", 산: "mountain", 숲: "forest", 문양: "pattern", 초상화: "portrait", 검: "sword", 왕관: "crown", 의자: "chair", 새: "bird",
};
export const BOARD_PREFIX = "toonstudio.open-creation.board.v1:";
const CACHE_KEY = "toonstudio.open-creation.cache.v2";
export const CACHE_TTL = 24 * 60 * 60 * 1000;
export const BOARD_LIMIT = 60;
const PAGE_SIZE = 18;
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
type Row = Record<string, unknown>;
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
function row(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function hasRestriction(value: unknown): boolean {
  return value != null && (typeof value !== "string" || value.trim().length > 0);
}
function text(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  let plain = "";
  let markupDepth = 0;
  let pendingSpace = false;
  for (const character of value) {
    if (character === "<") { markupDepth += 1; continue; }
    if (markupDepth > 0) {
      if (character === ">") markupDepth -= 1;
      continue;
    }
    if (/\s/u.test(character) || character.charCodeAt(0) < 0x20 || character === "\u007f") {
      pendingSpace = plain.length > 0;
      continue;
    }
    if (pendingSpace) { plain += " "; pendingSpace = false; }
    plain += character;
    if (plain.length >= max) break;
  }
  return plain.trim().slice(0, max);
}
export function safeOpenUrl(value: unknown, hosts?: string[]): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return "";
    if (hosts && !hosts.includes(url.hostname)) return "";
    if (!hosts && (!url.hostname.includes(".") || /^(?:\d|localhost)/u.test(url.hostname) || url.hostname.endsWith(".local"))) return "";
    return url.href;
  } catch { return ""; }
}
export function openSearchQuery(provider: OpenProvider, query: string): string {
  const normalized = query.trim().replace(/\s+/gu, " ");
  if (normalized.length < 1 || normalized.length > 80) throw new Error("검색어를 1~80자로 입력하세요.");
  if (provider === "wikipedia") return normalized;
  // Deliberately a visible dictionary, not an AI translation or fabricated translation service.
  const expanded = normalized.split(" ").map((word) => Object.hasOwn(KEYWORDS, word) ? KEYWORDS[word] : word).join(" ");
  return expanded.length <= 80 ? expanded : normalized;
}
export function openSearchUrl(provider: OpenProvider, query: string, page = 1): string {
  if (!Number.isInteger(page) || page < 1 || page > 10) throw new Error("검색은 1~10페이지까지 지원합니다.");
  const q = openSearchQuery(provider, query);
  if (provider === "artic") {
    const params = new URLSearchParams({ q, page: String(page), limit: String(PAGE_SIZE),
      fields: "id,title,artist_display,date_display,image_id,is_public_domain,credit_line,copyright_notice", "query[term][is_public_domain]": "true" });
    return `https://api.artic.edu/api/v1/artworks/search?${params}`;
  }
  if (provider === "cleveland") {
    const params = new URLSearchParams({ q, cc0: "1", has_image: "1", limit: String(PAGE_SIZE), skip: String((page - 1) * PAGE_SIZE),
      fields: "id,title,creators,creation_date,images,share_license_status,creditline,url,copyright" });
    return `https://openaccess-api.clevelandart.org/api/artworks/?${params}`;
  }
  if (provider === "commons") {
    const params = new URLSearchParams({
      action: "query", generator: "search", gsrsearch: `${q} incategory:"CC-Zero"`, gsrnamespace: "6",
      gsrlimit: String(PAGE_SIZE), gsroffset: String((page - 1) * PAGE_SIZE), prop: "imageinfo",
      iiprop: "url|extmetadata", iiurlwidth: "400",
      iiextmetadatafilter: "LicenseShortName|License|AttributionRequired|Restrictions|Artist|Credit|DateTimeOriginal",
      iiextmetadatalanguage: "en", format: "json", formatversion: "2", origin: "*", maxlag: "5",
    });
    return `https://commons.wikimedia.org/w/api.php?${params}`;
  }
  if (provider !== "wikipedia") throw new Error("지원하지 않는 제공처입니다.");
  const params = new URLSearchParams({ action: "query", list: "search", srsearch: q, srlimit: String(PAGE_SIZE),
    sroffset: String((page - 1) * PAGE_SIZE), srprop: "timestamp", format: "json", origin: "*" });
  return `https://ko.wikipedia.org/w/api.php?${params}`;
}
export function parseOpenReferences(provider: OpenProvider, payload: unknown, now = new Date().toISOString()): OpenReference[] {
  const root = row(payload);
  if (root.error || root.errors) throw new Error("제공처에서 검색 오류를 반환했습니다. 공식 사이트에서 확인하세요.");
  const raw = provider === "wikipedia" ? row(root.query).search
    : provider === "commons" ? row(root.query).pages : root.data;
  if (!Array.isArray(raw)) throw new Error("검색 응답 형식을 확인하지 못했습니다.");
  const metadataRawValue = (metadata: Row, key: string) => {
    const value = row(metadata[key]).value;
    return typeof value === "string" ? value.slice(0, 4_000) : "";
  };
  const metadataValue = (metadata: Row, key: string) => text(metadataRawValue(metadata, key), 800);
  const found = new Map<string, OpenReference>();
  for (const value of raw.slice(0, PAGE_SIZE)) {
    const item = row(value);
    const rawId = provider === "wikipedia" || provider === "commons" ? item.pageid : item.id;
    if (!Number.isSafeInteger(rawId) || Number(rawId) <= 0 || !text(item.title)) continue;
    const ref: OpenReference = { id: `${provider}:${rawId}`, provider, title: text(item.title), creator: "", date: "", sourceUrl: "", imageUrl: "", rights: "원문 확인", credit: "", fetchedAt: now };
    if (provider === "artic") {
      if (item.is_public_domain !== true || hasRestriction(item.copyright_notice)) continue;
      ref.sourceUrl = `https://www.artic.edu/artworks/${rawId}`;
      const iiif = safeOpenUrl(row(root.config).iiif_url, ["www.artic.edu", "artic.edu"]);
      if (iiif && new URL(iiif).pathname.replace(/\/$/u, "") === "/iiif/2" && typeof item.image_id === "string" && /^[a-zA-Z0-9-]{1,100}$/u.test(item.image_id)) ref.imageUrl = `${iiif.replace(/\/$/u, "")}/${item.image_id}/full/400,/0/default.jpg`;
      ref.creator = text(item.artist_display); ref.date = text(item.date_display); ref.credit = text(item.credit_line); ref.rights = "CC0";
    } else if (provider === "cleveland") {
      if (item.share_license_status !== "CC0" || hasRestriction(item.copyright)) continue;
      ref.sourceUrl = safeOpenUrl(item.url, ["www.clevelandart.org", "clevelandart.org"]);
      if (!ref.sourceUrl) continue;
      ref.imageUrl = safeOpenUrl(row(row(item.images).web).url, ["openaccess-cdn.clevelandart.org"]);
      ref.creator = Array.isArray(item.creators) ? item.creators.slice(0, 3).map((creator) => text(row(creator).description)).filter(Boolean).join(" · ") : "";
      ref.date = text(item.creation_date); ref.credit = text(item.creditline); ref.rights = "CC0";
    } else if (provider === "commons") {
      const info = Array.isArray(item.imageinfo) ? row(item.imageinfo[0]) : {};
      const metadata = row(info.extmetadata);
      const license = metadataValue(metadata, "LicenseShortName").toUpperCase();
      const licenseCode = metadataValue(metadata, "License").toLowerCase();
      const attributionRequired = metadataValue(metadata, "AttributionRequired").toLowerCase();
      const restrictions = metadataValue(metadata, "Restrictions");
      const rawRestrictions = row(metadata.Restrictions).value;
      if (license !== "CC0" || licenseCode !== "cc0" || attributionRequired !== "false"
        || rawRestrictions !== "" || restrictions) continue;
      ref.sourceUrl = safeOpenUrl(info.descriptionurl, ["commons.wikimedia.org"]);
      ref.imageUrl = safeOpenUrl(info.thumburl, ["thumb.wikimedia.org", "upload.wikimedia.org"]);
      if (!ref.sourceUrl || !ref.imageUrl) continue;
      ref.title = text(item.title).replace(/^File:/u, "").trim();
      if (!ref.title) continue;
      ref.creator = metadataValue(metadata, "Artist");
      ref.date = text(metadataRawValue(metadata, "DateTimeOriginal").split(/<div\b/iu)[0], 120);
      ref.credit = metadataValue(metadata, "Credit") || "Wikimedia Commons 파일 페이지";
      ref.rights = "CC0";
    } else {
      ref.sourceUrl = `https://ko.wikipedia.org/?curid=${rawId}`;
      ref.creator = "위키백과 기여자"; ref.date = text(item.timestamp);
      ref.credit = "문서 제목·원문 링크만 제공. 본문·이미지 이용조건은 원문에서 확인하세요.";
    }
    found.set(ref.id, ref);
  }
  return [...found.values()];
}
export function parseSavedOpenReference(value: unknown): OpenReference | null {
  const item = row(value);
  if (typeof item.id !== "string" || !/^(artic|cleveland|commons|wikipedia|saved):[a-zA-Z0-9:_-]{1,180}$/u.test(item.id)) return null;
  if (!["artic", "cleveland", "commons", "wikipedia", "saved"].includes(String(item.provider)) || !item.id.startsWith(`${item.provider}:`)) return null;
  const sourceUrl = safeOpenUrl(item.sourceUrl);
  if (!sourceUrl || !text(item.title) || typeof item.fetchedAt !== "string" || !Number.isFinite(Date.parse(item.fetchedAt))) return null;
  // Stored/imported metadata cannot promote a knowledge link into an image licence.
  const host = new URL(sourceUrl).hostname;
  const verifiedSource = ["www.artic.edu", "artic.edu"].includes(host) ? "artic"
    : ["www.clevelandart.org", "clevelandart.org"].includes(host) ? "cleveland"
    : host === "commons.wikimedia.org" ? "commons"
    : ["www.metmuseum.org", "metmuseum.org"].includes(host) ? "met" : null;
  const allowed = item.provider === "saved"
    ? verifiedSource === "artic" || verifiedSource === "cleveland" || verifiedSource === "met"
    : item.provider === verifiedSource;
  const rights = item.rights === "CC0" && allowed ? "CC0" : "원문 확인";
  const imageHosts = verifiedSource === "artic" ? ["www.artic.edu", "artic.edu"]
    : verifiedSource === "cleveland" ? ["openaccess-cdn.clevelandart.org"]
    : verifiedSource === "commons" ? ["thumb.wikimedia.org", "upload.wikimedia.org"] : ["images.metmuseum.org"];
  return { id: item.id, provider: item.provider as OpenReference["provider"], title: text(item.title), creator: text(item.creator), date: text(item.date),
    sourceUrl, imageUrl: rights === "CC0" ? safeOpenUrl(item.imageUrl, imageHosts) : "",
    rights, credit: text(item.credit), fetchedAt: item.fetchedAt };
}
export function fromExistingResource(value: unknown): OpenReference | null {
  const item = row(value);
  const id = text(item.id, 160).replace(/[^a-zA-Z0-9:_-]/gu, "_");
  if (!id) return null;
  return parseSavedOpenReference({ id: `saved:${id}`, provider: "saved", title: item.title, creator: item.creator, date: item.dateLabel,
    sourceUrl: item.sourceUrl, imageUrl: ["met", "aic", "cleveland"].includes(String(item.provider)) ? item.imageUrl : "", rights: ["met", "aic", "cleveland"].includes(String(item.provider)) && item.license === "CC0" ? "CC0" : "원문 확인",
    credit: `${text(item.provider)} · ${text(item.credit)}`, fetchedAt: item.fetchedAt });
}
export function readOpenBoard(storage: KeyValueStorage): OpenReference[] {
  const items: OpenReference[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(BOARD_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw || raw.length > 12000) throw new Error("저장 자료가 손상되었습니다. 원본을 덮어쓰지 않습니다.");
    let item: OpenReference | null;
    try { item = parseSavedOpenReference(JSON.parse(raw)); } catch { item = null; }
    if (!item || key !== BOARD_PREFIX + item.id) throw new Error("저장 자료 형식을 확인하지 못했습니다. 원본을 덮어쓰지 않습니다.");
    items.push(item);
    if (items.length > BOARD_LIMIT) throw new Error("저장 자료 한도를 초과했습니다.");
  }
  return items.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}
export function saveOpenReference(storage: KeyValueStorage, value: OpenReference, remove = false): OpenReference[] {
  const valid = parseSavedOpenReference(value);
  if (!valid) throw new Error("유효한 출처가 있는 자료만 저장할 수 있습니다.");
  const board = readOpenBoard(storage);
  const key = BOARD_PREFIX + valid.id;
  if (remove) storage.removeItem(key);
  else {
    if (!board.some((item) => item.id === valid.id) && board.length >= BOARD_LIMIT) throw new Error(`최대 ${BOARD_LIMIT}개까지 저장할 수 있습니다. 백업 후 일부 자료를 해제하세요.`);
    // One key per reference: saving different items in two tabs never replaces the whole board.
    storage.setItem(key, JSON.stringify(valid));
  }
  return readOpenBoard(storage);
}
interface CachedSearch { key: string; at: number; items: OpenReference[] }
function cacheEntries(storage: KeyValueStorage): CachedSearch[] {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw || raw.length > 600000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12).flatMap((value) => {
      const item = row(value);
      if (typeof item.key !== "string" || item.key.length > 500 || typeof item.at !== "number" || !Number.isFinite(item.at) || !Array.isArray(item.items)) return [];
      const items = item.items.slice(0, PAGE_SIZE).map(parseSavedOpenReference).filter((ref): ref is OpenReference => ref !== null);
      return [{ key: item.key, at: item.at, items }];
    });
  } catch { return []; }
}
export function readOpenCache(storage: KeyValueStorage, key: string, now = Date.now()): { items: OpenReference[]; stale: boolean; at: number } | null {
  const entry = cacheEntries(storage).find((item) => item.key === key && item.at <= now);
  return entry ? { items: entry.items, stale: now - entry.at >= CACHE_TTL, at: entry.at } : null;
}
export function writeOpenCache(storage: KeyValueStorage, key: string, items: OpenReference[], now = Date.now()): void {
  try { storage.setItem(CACHE_KEY, JSON.stringify([{ key, at: now, items: items.slice(0, PAGE_SIZE) }, ...cacheEntries(storage).filter((item) => item.key !== key)].slice(0, 12))); }
  catch { /* Cache failure must never fail a successful search. */ }
}
function markdown(value: string): string { return text(value, 2000).replace(/[\\`*_[\]<>#|]/gu, "\\$&"); }
export function buildCreationKit(format: KitFormat, subject: string, notes: string, references: OpenReference[]): string {
  const selected = references.slice(0, 12);
  const title = KIT_FORMATS.find((item) => item.id === format)?.title ?? "창작 브리프";
  const topic = markdown(subject || "새로운 이야기");
  const material = selected.map((item) => markdown(item.title)).join(" / ") || "직접 정할 소재";
  const sections: Record<KitFormat, string[]> = {
    comic: ["1컷 · 도입: 주인공이 원하는 것과 장소를 한 장면에 배치합니다.", "2컷 · 발견: 참고 소재 하나를 단서로 사용합니다. 대사보다 형태·행동으로 보여 주세요.", "3컷 · 선택: 단서를 오해하거나 새로운 용도로 써서 상황을 바꿉니다.", "4컷 · 반전: 첫 컷의 소품을 다시 보여 주며 감정이나 의미를 뒤집습니다."],
    character: ["외형: 자료에서 실루엣·재질·장식 요소를 각각 하나씩 관찰합니다.", "복식과 소품: 원형의 기능을 조사한 뒤 캐릭터의 직업에 맞게 변형합니다.", "성격: 겉으로 보이는 인상과 반대되는 욕구·약점을 정합니다.", "설정 시트: 정면·측면·표정 3개·대표 포즈를 그립니다. 역사적 사실과 창작 설정을 분리해 적습니다."],
    world: ["공간: 전경·중경·원경에 서로 다른 크기의 소재를 배치합니다.", "생활: 등장인물이 쓰는 도구·이동 방식·주거 환경을 정합니다.", "세계의 규칙: 현실 자료에서 관찰한 요소 하나를 변형하고 그 결과를 설정합니다.", "고증: 시대·지역·재질을 원문에서 확인합니다. 서로 다른 시대의 자료를 같은 문화라고 단정하지 않습니다."],
    promo: ["0–3초 · 훅: 독자가 궁금해할 갈등 한 가지를 자막으로 제시합니다.", "3–7초 · 소개: 주인공의 실루엣과 대표 소품을 보여 줍니다.", "7–12초 · 긴장: 장소 전환과 선택 직전의 장면을 이어 붙입니다.", "12–15초 · 마무리: 작품명·공개일·작품 링크를 넣습니다. 실제 영상·음원은 생성하지 않습니다."],
    study: ["관찰 3분: 외곽선·비례·시선 흐름을 메모합니다.", "형태 5분: 사각형·원·원기둥만으로 소재를 재구성합니다.", "명암 5분: 밝음·중간·어두움의 세 단계로 정리합니다.", "변형 7분: 재질·크기·시점을 바꿔 자신의 장면으로 그립니다."],
    article: ["도입: 이번 큐레이션 주제와 자료를 고른 이유를 직접 적습니다.", "자료 카드: 각각의 형태·색·용도를 관찰하고 원문에 있는 정보만 사실로 서술합니다.", "비교: 공통점 2개와 차이점 2개를 정리합니다. 원문에 없는 역사·해석을 사실처럼 만들지 않습니다.", "활용: 독자가 직접 시도할 드로잉 과제와 확인할 원문 링크를 덧붙입니다."],
  };
  return [`# ${topic} — ${title}`, "", "> 로컬 규칙 기반 초안입니다. AI 추론·사실 검증·이미지/영상 생성 결과가 아닙니다.", "", "## 창작 방향", `주제: ${topic}`, `참고 소재: ${material}`, `작가 메모: ${markdown(notes) || "직접 입력"}`, "", "## 제작 구성", ...sections[format].map((line) => `- ${line}`), "", "## 자료 관찰 메모", ...selected.map((item, index) => `${index + 1}. ${markdown(item.title)}: 형태 / 색 / 재질 / 이야기 속 역할을 관찰해 적으세요.`), "", "## 출처·권리 기록", ...selected.flatMap((item, index) => [`### ${index + 1}. ${markdown(item.title)}`, `- 원문: ${safeOpenUrl(item.sourceUrl)}`, `- 저작자/기관: ${markdown(item.creator || item.provider)}`, `- 시대/날짜: ${markdown(item.date || "원문 확인")}`, `- 표시된 권리: ${item.rights}${item.rights === "CC0" ? ` (${CC0})` : " — 이미지·본문 재사용 허락 아님"}`, `- 크레딧: ${markdown(item.credit || "원문 확인")}`, `- 조회일: ${markdown(item.fetchedAt)}`, ""]), "## 공개 전 확인", "- 원문에서 최신 이용조건과 초상·상표 등 제3자 권리를 확인하세요.", "- 도서 표지·위키 본문·현대 번역·음원은 별도 권리 확인 없이 복제하지 마세요.", "- 메타데이터 검색 결과를 각색 허락이나 사실 검증 완료로 간주하지 마세요.", ""].join("\n");
}
