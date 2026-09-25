import type { StudioTownMiniGameId } from "./studio-virtual-space-town-program";

export interface StudioMiniGameRound {
  readonly id: string;
  readonly gameId: StudioTownMiniGameId;
  readonly promptKo: string;
  readonly promptEn: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
  readonly startedAt: number;
  readonly endsAt: number;
}

export interface StudioMiniGameResult {
  readonly correct: boolean;
  readonly score: number;
  readonly elapsedMs: number;
}

interface RoundTemplate {
  readonly ko: string;
  readonly en: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
}

const ROUNDS: Readonly<Record<StudioTownMiniGameId, readonly RoundTemplate[]>> = Object.freeze({
  "panel-order": [
    { ko: "도입 → 갈등 → 반전 → 여운에 맞는 순서는?", en: "Which sequence matches setup → conflict → turn → aftertaste?", choices: ["1-2-3-4", "2-1-4-3", "4-3-2-1"], correctIndex: 0 },
    { ko: "시선 방향이 자연스럽게 이어지는 컷 배열은?", en: "Which panel order preserves the eyeline?", choices: ["A-C-B-D", "A-B-C-D", "D-B-A-C"], correctIndex: 1 },
  ],
  "palette-match": [
    { ko: "따뜻한 노을 장면에 가장 어울리는 팔레트는?", en: "Which palette best fits a warm sunset scene?", choices: ["#FFB56B · #D96C75", "#4C72B8 · #9BD8EA", "#4A4A4A · #D8D8D8"], correctIndex: 0 },
    { ko: "차가운 긴장 장면의 포인트 컬러는?", en: "Choose the accent for a cold suspense scene.", choices: ["민트", "주황", "황토"], correctIndex: 0 },
  ],
  "pose-guess": [
    { ko: "어깨가 올라가고 몸이 뒤로 물러난 실루엣의 감정은?", en: "What emotion fits raised shoulders and a backward lean?", choices: ["놀람", "평온", "졸림"], correctIndex: 0 },
    { ko: "상체가 앞으로 기울고 주먹을 쥔 포즈는?", en: "A forward lean with clenched fists suggests…", choices: ["결의", "권태", "망설임"], correctIndex: 0 },
  ],
  "hidden-assets": [
    { ko: "비 오는 골목 장면에 빠진 소재는?", en: "Which asset is missing from a rainy alley?", choices: ["젖은 반사광", "사막 모래", "눈 결정"], correctIndex: 0 },
    { ko: "카페 배경의 원근감을 강화할 소품은?", en: "Which prop strengthens depth in a cafe?", choices: ["전경 의자", "평면 로고", "단색 배경"], correctIndex: 0 },
  ],
  "perspective-grid": [
    { ko: "긴 복도 장면에 적합한 소실점은?", en: "Which vanishing setup fits a long corridor?", choices: ["1점 투시", "구면 투시", "무투시"], correctIndex: 0 },
    { ko: "건물 모서리를 강조하는 구도는?", en: "Which setup emphasizes a building corner?", choices: ["2점 투시", "1점 투시", "정사영"], correctIndex: 0 },
  ],
  "deadline-relay": [
    { ko: "출고 전 올바른 순서는?", en: "Choose the correct pre-release order.", choices: ["수정 → 검수 → QC → 내보내기", "내보내기 → 수정 → QC", "QC → 콘티 → 수정"], correctIndex: 0 },
    { ko: "검수 의견을 받은 다음 행동은?", en: "What follows a review comment?", choices: ["담당자 확인 후 수정", "즉시 공개", "원본 삭제"], correctIndex: 0 },
  ],
});

function hash(value: string): number {
  let output = 2166136261;
  for (const character of value) output = Math.imul(output ^ character.charCodeAt(0), 16777619);
  return output >>> 0;
}

export function createStudioMiniGameRound(
  gameId: StudioTownMiniGameId,
  seed: string,
  now = Date.now(),
  durationSeconds = 60,
): StudioMiniGameRound {
  const templates = ROUNDS[gameId];
  const template = templates[hash(`${gameId}:${seed}`) % templates.length]!;
  return Object.freeze({
    id: `${gameId}:${hash(`${seed}:${now}`).toString(36)}`,
    gameId,
    promptKo: template.ko,
    promptEn: template.en,
    choices: Object.freeze([...template.choices]),
    correctIndex: template.correctIndex,
    startedAt: now,
    endsAt: now + durationSeconds * 1000,
  });
}

export function answerStudioMiniGameRound(
  round: StudioMiniGameRound,
  choiceIndex: number,
  now = Date.now(),
): StudioMiniGameResult {
  const elapsedMs = Math.max(0, now - round.startedAt);
  const correct = now <= round.endsAt && choiceIndex === round.correctIndex;
  const remaining = Math.max(0, round.endsAt - now);
  const speedBonus = Math.floor(remaining / 1000) * 2;
  return Object.freeze({ correct, elapsedMs, score: correct ? 100 + speedBonus : 0 });
}
