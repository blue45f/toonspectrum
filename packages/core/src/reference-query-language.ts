/**
 * Bounded Korean vocabulary shared by the browser and the Met adapter.
 * Not a general-purpose translator: unknown words and names are preserved.
 */
export const REFERENCE_QUERY_LANGUAGE_VERSION = 2;
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
  "수묵화": "ink painting", "민화": "Korean folk painting",
  "백자": "white porcelain", "청자": "celadon", "분청사기": "buncheong",
  "저고리": "Korean jacket", "치마": "skirt", "바지": "trousers", "두루마기": "Korean coat",
  "왕관": "crown", "귀걸이": "earrings", "반지": "ring", "비녀": "hairpin",
  "신전": "temple", "사원": "temple", "성당": "cathedral", "탑": "tower",
  "기둥": "column", "회랑": "corridor", "천장": "ceiling", "분수": "fountain",
  "마차": "carriage", "기차": "train", "배": "boat", "돛단배": "sailboat",
  "벚꽃": "cherry blossom", "대나무": "bamboo", "소나무": "pine tree", "연꽃": "lotus",
  "폭포": "waterfall", "해변": "beach", "사막": "desert", "일몰": "sunset",
  "인체": "human figure", "해부학": "anatomy", "근육": "muscles", "손가락": "fingers",
  "눈동자": "eyes", "눈썹": "eyebrows", "입술": "lips", "머리카락": "hair",
  "옆모습": "profile", "뒷모습": "back view", "전신": "full length figure",
  "달리는 사람": "running figure", "걷는 사람": "walking figure",
  "앉은 자세": "seated figure", "누운 자세": "reclining figure",
  "손 포즈": "hand gesture", "두 손": "hands", "인물 눈": "human eyes",
  "옷 주름": "drapery", "천 주름": "drapery", "무도회": "ballroom",
  "로코코": "Rococo", "바로크": "Baroque", "빅토리아": "Victorian",
});

export type ReferenceQueryResolution = Readonly<{
  original: string;
  providerQuery: string;
  status: "unchanged" | "translated" | "partial" | "unsupported" | "invalid";
  matched: readonly string[];
  unresolved: readonly string[];
}>;

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;
const PARTICLES = ["에서", "으로", "에게", "까지", "부터", "처럼", "보다", "의", "을", "를", "은", "는", "이", "가", "에", "와", "과", "도", "로"] as const;
// Only compact known phrases. Never segment an arbitrary Korean name into substrings.
const COMPACT_TERMS = new Map(Object.entries(TERMS)
  .filter(([term]) => term.includes(" "))
  .map(([term, translation]) => [term.replace(/ /gu, ""), translation]));

function lookupTerm(term: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(TERMS, term)) return TERMS[term];
  return COMPACT_TERMS.get(term);
}

function lookupPhrase(phrase: string): string | undefined {
  const direct = lookupTerm(phrase);
  if (direct) return direct;
  for (const particle of PARTICLES) {
    if (!phrase.endsWith(particle)) continue;
    const stem = phrase.slice(0, -particle.length);
    const translated = lookupTerm(stem);
    if (translated) return translated;
  }
  return undefined;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function resolveReferenceQuery(input: string): ReferenceQueryResolution {
  const original = input.normalize("NFC").trim().replace(/ +/gu, " ");
  const base = { original, providerQuery: input, matched: [] as string[], unresolved: [] as string[] };
  const exact = lookupPhrase(original);
  // A single known Korean noun (숲, 손, 검...) is a useful complete search.
  if (input.length > REFERENCE_QUERY_MAX_LENGTH || containsControlCharacter(input)
    || !original || (original.length < 2 && !exact)) {
    return { ...base, status: "invalid" };
  }
  if (!HANGUL.test(original)) return { ...base, providerQuery: original, status: "unchanged" };
  if (exact) return { ...base, providerQuery: exact, matched: [original], status: "translated" };

  const tokens = original.split(/[\s,，、;；]+/u).filter(Boolean);
  const matched: string[] = [];
  const unresolved: string[] = [];
  const translated: string[] = [];
  for (let i = 0; i < tokens.length;) {
    let found = false;
    for (let length = Math.min(4, tokens.length - i); length >= 1; length--) {
      const phrase = tokens.slice(i, i + length).join(" ");
      const translation = lookupPhrase(phrase);
      if (translation) {
        translated.push(translation);
        matched.push(phrase);
        i += length;
        found = true;
        break;
      }
    }
    if (!found) {
      const token = tokens[i++];
      if (token === undefined) break;
      translated.push(token);
      if (HANGUL.test(token)) unresolved.push(token);
    }
  }
  const providerQuery = translated.join(" ");
  if (providerQuery.length > REFERENCE_QUERY_MAX_LENGTH) {
    return { ...base, providerQuery: original, unresolved: tokens.filter((token) => HANGUL.test(token)), status: "unsupported" };
  }
  return {
    original, providerQuery: matched.length ? providerQuery : original, matched, unresolved,
    status: matched.length === 0 ? "unsupported" : unresolved.length ? "partial" : "translated",
  };
}

/** Museum adapters share bounded vocabulary expansion; books keep their contract. */
export function localizeReferenceProviderQuery(query: Record<string, unknown>): Record<string, unknown> {
  if (!["met", "aic", "cleveland"].includes(String(query.provider)) || typeof query.q !== "string") return query;
  const resolution = resolveReferenceQuery(query.q);
  return resolution.status === "translated" || resolution.status === "partial"
    ? { ...query, q: resolution.providerQuery }
    : query;
}
