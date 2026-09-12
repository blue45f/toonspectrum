/**
 * Bounded, deterministic Korean vocabulary for the Met reference search.
 * This is NOT a general-purpose translator. Unknown tokens are preserved.
 * Keep the browser hint and server request on the same versioned contract.
 */
export const REFERENCE_QUERY_LANGUAGE_VERSION = 1;
export const REFERENCE_QUERY_MAX_LENGTH = 80;

const TERMS: Readonly<Record<string, string>> = Object.freeze({
  "비 오는 골목": "rain alley", "비오는 골목": "rain alley",
  "비 오는 거리": "rain street", "전통 의상": "traditional costume",
  "한국 전통 의상": "Korean costume", "조선 시대": "Joseon",
  "중세 갑옷": "medieval armor", "서양 갑옷": "European armor",
  "동양 건축": "Asian architecture", "일본 정원": "Japanese garden",
  "고양이": "cat", "강아지": "dog", "개": "dog", "새": "bird",
  "말": "horse", "호랑이": "tiger", "용": "dragon", "나비": "butterfly",
  "꽃": "flowers", "나무": "tree", "숲": "forest", "산": "mountain",
  "바다": "sea", "파도": "waves", "강": "river", "호수": "lake",
  "비": "rain", "눈": "snow", "달": "moon", "밤": "night", "구름": "clouds",
  "골목": "alley", "거리": "street", "도시": "city", "마을": "village",
  "건축": "architecture", "건물": "building", "성": "castle", "궁전": "palace",
  "궁궐": "Korean palace", "한옥": "Korean house", "기와": "roof tiles",
  "문": "door", "창문": "window", "계단": "stairs", "다리": "bridge",
  "실내": "interior", "방": "room", "정원": "garden", "배경": "landscape",
  "가구": "furniture", "의자": "chair", "책상": "desk", "침대": "bed",
  "거울": "mirror", "등불": "lantern", "촛대": "candlestick", "책": "book",
  "그릇": "bowl", "도자기": "ceramics", "항아리": "jar", "꽃병": "vase",
  "주전자": "teapot", "잔": "cup", "부채": "fan", "악기": "musical instrument",
  "복식": "costume", "의상": "costume", "옷": "clothing", "드레스": "dress",
  "한복": "Korean costume", "도포": "Korean robe", "기모노": "kimono",
  "모자": "hat", "신발": "shoes", "장신구": "jewelry", "목걸이": "necklace",
  "갑옷": "armor", "갑주": "armor", "무기": "weapons", "검": "sword",
  "칼": "sword", "방패": "shield", "투구": "helmet", "활": "bow",
  "인물": "figure", "초상화": "portrait", "자세": "pose", "포즈": "pose",
  "동세": "figure drawing", "손": "hand", "얼굴": "face", "춤": "dance",
  "문양": "pattern", "패턴": "pattern", "장식": "ornament", "자수": "embroidery",
  "회화": "painting", "그림": "painting", "선화": "drawing", "드로잉": "drawing",
  "수채화": "watercolor", "유화": "oil painting", "판화": "print", "조각": "sculpture",
  "사진": "photograph", "금속": "metalwork", "직물": "textiles", "목재": "wood",
  "한국": "Korea", "조선": "Joseon", "일본": "Japan", "중국": "China",
  "유럽": "Europe", "이집트": "Egypt", "그리스": "Greece", "로마": "Rome",
  "중세": "medieval", "르네상스": "Renaissance", "전통": "traditional",
});

export type ReferenceQueryResolution = Readonly<{
  original: string;
  providerQuery: string;
  status: "unchanged" | "translated" | "partial" | "unsupported" | "invalid";
  matched: readonly string[];
  unresolved: readonly string[];
}>;

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;

export function resolveReferenceQuery(input: string): ReferenceQueryResolution {
  // Do not truncate or sanitize invalid input into a valid upstream request.
  const original = input.normalize("NFC").trim().replace(/ +/gu, " ");
  const base = { original, providerQuery: input, matched: [] as string[], unresolved: [] as string[] };
  if (input.length > REFERENCE_QUERY_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(input) || original.length < 2) {
    return { ...base, status: "invalid" };
  }
  if (!HANGUL.test(original)) return { ...base, providerQuery: original, status: "unchanged" };
  const exact = TERMS[original];
  if (exact) return { ...base, providerQuery: exact, matched: [original], status: "translated" };

  // Match entire whitespace-delimited terms, never substrings of names.
  // A phrase such as '한국화' must not silently become 'Korea화'.
  const tokens = original.split(/\s+/u);
  const matched: string[] = [];
  const unresolved: string[] = [];
  const translated: string[] = [];
  for (let i = 0; i < tokens.length;) {
    let found = false;
    for (let length = Math.min(4, tokens.length - i); length >= 1; length--) {
      const phrase = tokens.slice(i, i + length).join(" ");
      if (Object.prototype.hasOwnProperty.call(TERMS, phrase)) {
        translated.push(TERMS[phrase]);
        matched.push(phrase);
        i += length;
        found = true;
        break;
      }
    }
    if (!found) {
      const token = tokens[i++];
      translated.push(token);
      if (HANGUL.test(token)) unresolved.push(token);
    }
  }
  const providerQuery = translated.join(" ");
  // Preserve the whole original if expansion would exceed the provider contract.
  if (providerQuery.length > REFERENCE_QUERY_MAX_LENGTH) {
    return { ...base, providerQuery: original, unresolved: tokens.filter((token) => HANGUL.test(token)), status: "unsupported" };
  }
  return {
    original, providerQuery, matched, unresolved,
    status: matched.length === 0 ? "unsupported" : unresolved.length ? "partial" : "translated",
  };
}

/** Only the Met adapter gets vocabulary expansion; other providers keep their contract. */
export function localizeReferenceProviderQuery(query: Record<string, unknown>): Record<string, unknown> {
  if (query.provider !== "met" || typeof query.q !== "string") return query;
  const resolution = resolveReferenceQuery(query.q);
  return resolution.status === "translated" || resolution.status === "partial"
    ? { ...query, q: resolution.providerQuery }
    : query;
}
