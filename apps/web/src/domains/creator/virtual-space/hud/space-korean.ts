/**
 * 한국어 조사 선택. 장소·사람 이름처럼 끝 글자가 바뀌는 낱말 뒤에 붙는 조사를 받침에 맞춘다.
 * 예: "창작자 광장" → "창작자 광장으로", "스카이 포트" → "스카이 포트로", "관제실" → "관제실로".
 * 끝 글자가 한글이 아니면(영문·숫자·기호) 받침 없는 형태를 쓴다.
 */
const PARTICLES = {
  "으로": ["으로", "로"],
  "과": ["과", "와"],
  "을": ["을", "를"],
  "이": ["이", "가"],
  "은": ["은", "는"],
} as const;

export type SpaceKoParticle = keyof typeof PARTICLES;

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const FINAL_CONSONANTS = 28;
/** ㄹ 받침의 종성 번호. '으로' 대신 '로'를 쓴다. */
const RIEUL_FINAL = 8;

function finalConsonant(word: string): number {
  const trimmed = word.trimEnd();
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (!(code >= HANGUL_FIRST && code <= HANGUL_LAST)) return 0;
  return (code - HANGUL_FIRST) % FINAL_CONSONANTS;
}

/** 낱말 뒤에 받침에 맞는 조사를 붙여 돌려준다. */
export function spaceKoParticle(word: string, particle: SpaceKoParticle): string {
  const [withFinal, withoutFinal] = PARTICLES[particle];
  const final = finalConsonant(word);
  const useFinalForm = final !== 0 && !(particle === "으로" && final === RIEUL_FINAL);
  return `${word}${useFinalForm ? withFinal : withoutFinal}`;
}

/** 이름·제목 뒤 서술격 조사(이에요/예요)를 받침에 맞춰 붙여 돌려준다. 예: "윤" → "윤이에요", "모아" → "모아예요". */
export function spaceKoCopula(word: string): string {
  return `${word}${finalConsonant(word) !== 0 ? "이에요" : "예요"}`;
}
