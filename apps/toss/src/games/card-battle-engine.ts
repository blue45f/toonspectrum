// 웹툰 카드 배틀 — 하스스톤式 미니 CCG의 순수 엔진.
// 실제 웹툰 스탯(조회수/좋아요/북마크)에서 카드 코스트·공격·체력을 결정적으로 도출하고,
// 턴/마나/필드/영웅 체력의 상태 전이를 순수 함수로 처리한다(React/DOM 의존 없음 → 단위 테스트).

// 토스앱에서는 GameTitle을 PlayTitle로 별칭해 엔진 본문(웹 레퍼런스와 동일)을 그대로 유지한다.
import type { GameTitle as PlayTitle } from "./types";

export type Side = "you" | "ai";
export const HERO_HP = 30;
export const MAX_MANA = 10;
const DECK_SIZE = 20;
const OPENING_HAND = 3;

export interface Card {
  uid: string; // 인스턴스 고유 id
  titleId: string;
  name: string;
  cost: number; // 1..8
  atk: number; // 1..12
  hp: number; // 1..12
  cover: [string, string];
  coverImage?: string;
  genre: string;
}

export interface Minion extends Card {
  curHp: number;
  ready: boolean; // 이번 턴 공격 가능(소환 멀미 해제)
}

export interface BattleState {
  turn: number;
  active: Side;
  mana: Record<Side, number>;
  maxMana: Record<Side, number>;
  heroHp: Record<Side, number>;
  board: Record<Side, Minion[]>;
  hand: Record<Side, Card[]>;
  deck: Record<Side, Card[]>;
  fatigue: Record<Side, number>;
  winner: Side | null;
  log: string[];
  seq: number; // uid 생성 카운터
}

const clampi = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** 문자열 id → 결정적 0..n-1 해시(카드 변량 시드). */
function hashInt(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0);
}

/** 웹툰 인기도 → 카드 스탯(코스트/공격/체력). 결정적. */
export function statToCard(title: PlayTitle): Omit<Card, "uid"> {
  const power = Math.log10(title.views + title.likes * 12 + title.bookmarks * 6 + 10);
  // power 대략 1(무명)~9(초대형). 코스트 1..8로 매핑.
  const cost = clampi(power - 1.2, 1, 8);
  const h = hashInt(title.id, 1);
  const atkVar = (h % 3) - 1; // -1..1
  const hpVar = (hashInt(title.id, 7) % 3) - 1;
  const base = cost + 1;
  return {
    titleId: title.id,
    name: title.title,
    cost,
    atk: clampi(base + atkVar, 1, 12),
    hp: clampi(base + 1 + hpVar, 1, 12),
    cover: title.cover,
    coverImage: title.coverImage,
    genre: title.genres[0] ?? "장르미상",
  };
}

/** Fisher–Yates(주입 rng) — 입력 불변. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck(titles: readonly PlayTitle[], rng: () => number, startSeq: number): { deck: Card[]; seq: number } {
  let seq = startSeq;
  const picked = shuffle(titles, rng).slice(0, DECK_SIZE);
  const deck = picked.map((t) => ({ uid: `c${seq++}`, ...statToCard(t) }));
  return { deck, seq };
}

/** 새 대전 시작 — 양측 덱 구성 + 선공(you) 1턴 시작까지. */
export function startBattle(
  youTitles: readonly PlayTitle[],
  aiTitles: readonly PlayTitle[],
  rng: () => number
): BattleState {
  const you = makeDeck(youTitles, rng, 0);
  const ai = makeDeck(aiTitles, rng, you.seq);
  const state: BattleState = {
    turn: 0,
    active: "you",
    mana: { you: 0, ai: 0 },
    maxMana: { you: 0, ai: 0 },
    heroHp: { you: HERO_HP, ai: HERO_HP },
    board: { you: [], ai: [] },
    hand: { you: you.deck.slice(0, OPENING_HAND), ai: ai.deck.slice(0, OPENING_HAND + 1) },
    deck: { you: you.deck.slice(OPENING_HAND), ai: ai.deck.slice(OPENING_HAND + 1) },
    fatigue: { you: 0, ai: 0 },
    winner: null,
    log: ["대전 시작!"],
    seq: ai.seq,
  };
  return beginTurn(state, "you");
}

function clone(s: BattleState): BattleState {
  return {
    ...s,
    mana: { ...s.mana },
    maxMana: { ...s.maxMana },
    heroHp: { ...s.heroHp },
    fatigue: { ...s.fatigue },
    board: { you: s.board.you.map((m) => ({ ...m })), ai: s.board.ai.map((m) => ({ ...m })) },
    hand: { you: s.hand.you.slice(), ai: s.hand.ai.slice() },
    deck: { you: s.deck.you.slice(), ai: s.deck.ai.slice() },
    log: s.log.slice(),
  };
}

const other = (s: Side): Side => (s === "you" ? "ai" : "you");

/** 카드 1장 드로우(덱 소진 시 누적 피로 피해). 입력 클론을 직접 변경. */
function draw(d: BattleState, side: Side): void {
  if (d.deck[side].length > 0) {
    d.hand[side] = [...d.hand[side], d.deck[side][0]];
    d.deck[side] = d.deck[side].slice(1);
  } else {
    d.fatigue[side] += 1;
    d.heroHp[side] -= d.fatigue[side];
    d.log.push(`${labelOf(side)} 덱 소진 — 피로 ${d.fatigue[side]} 피해`);
    checkWinner(d);
  }
}

function labelOf(side: Side): string {
  return side === "you" ? "나" : "상대";
}

/** 턴 시작 — 마나 증가/회복, 드로우, 자기 필드 미니언 준비. */
export function beginTurn(state: BattleState, side: Side): BattleState {
  const d = clone(state);
  d.active = side;
  d.turn += 1;
  d.maxMana[side] = Math.min(MAX_MANA, d.maxMana[side] + 1);
  d.mana[side] = d.maxMana[side];
  draw(d, side);
  d.board[side] = d.board[side].map((m) => ({ ...m, ready: true }));
  return d;
}

/** 손패의 카드를 필드에 소환(마나 차감, 소환 멀미). */
export function playCard(state: BattleState, side: Side, uid: string): BattleState {
  if (state.winner) return state;
  const card = state.hand[side].find((c) => c.uid === uid);
  if (!card || state.active !== side || state.mana[side] < card.cost || state.board[side].length >= 7) {
    return state;
  }
  const d = clone(state);
  d.mana[side] -= card.cost;
  d.hand[side] = d.hand[side].filter((c) => c.uid !== uid);
  d.board[side] = [...d.board[side], { ...card, curHp: card.hp, ready: false }];
  d.log.push(`${labelOf(side)}: ${card.name} 소환 (${card.atk}/${card.hp})`);
  return d;
}

/** 미니언 공격 — target='hero' 면 적 영웅, 아니면 적 미니언 uid. */
export function attack(state: BattleState, side: Side, attackerUid: string, target: "hero" | string): BattleState {
  if (state.winner || state.active !== side) return state;
  const attacker = state.board[side].find((m) => m.uid === attackerUid);
  if (!attacker || !attacker.ready) return state;
  const foe = other(side);
  const d = clone(state);
  const atk = d.board[side].find((m) => m.uid === attackerUid)!;
  if (target === "hero") {
    d.heroHp[foe] -= atk.atk;
    atk.ready = false;
    d.log.push(`${labelOf(side)}: ${atk.name} → 상대 영웅 ${atk.atk} 피해`);
  } else {
    const def = d.board[foe].find((m) => m.uid === target);
    if (!def) return state;
    def.curHp -= atk.atk;
    atk.curHp -= def.atk;
    atk.ready = false;
    d.log.push(`${labelOf(side)}: ${atk.name} ⚔ ${def.name}`);
  }
  d.board.you = d.board.you.filter((m) => m.curHp > 0);
  d.board.ai = d.board.ai.filter((m) => m.curHp > 0);
  checkWinner(d);
  return d;
}

/** 현재 턴 종료 → 상대 턴 시작. */
export function endTurn(state: BattleState): BattleState {
  if (state.winner) return state;
  return beginTurn(state, other(state.active));
}

function checkWinner(d: BattleState): void {
  const youDead = d.heroHp.you <= 0;
  const aiDead = d.heroHp.ai <= 0;
  if (youDead && aiDead) d.winner = "you"; // 동시면 플레이어 승(드묾)
  else if (aiDead) d.winner = "you";
  else if (youDead) d.winner = "ai";
}

/**
 * AI 한 턴 전체 진행 — 마나 효율적으로 카드 소환 후, 준비된 미니언으로
 * (치명타 우선 → 유리한 교환 → 영웅 공격) 순으로 공격. 마지막에 턴 종료.
 * 결정적(rng 주입).
 */
export function aiTakeTurn(state: BattleState, rng: () => number): BattleState {
  let d: BattleState = state;
  if (d.active !== "ai" || d.winner) return d;

  // 1) 소환: 마나가 허락하는 한, 비싼 카드부터.
  let guard = 0;
  while (guard++ < 20) {
    const playable = d.hand.ai
      .filter((c) => c.cost <= d.mana.ai)
      .sort((a, b) => b.cost - a.cost || b.atk - a.atk);
    if (!playable.length || d.board.ai.length >= 7) break;
    d = playCard(d, "ai", playable[0].uid);
  }

  // 2) 공격: 준비된 미니언 각각.
  guard = 0;
  while (guard++ < 30) {
    const attacker = d.board.ai.find((m) => m.ready);
    if (!attacker || d.winner) break;
    // 치명타: 영웅 체력 <= 총 공격 가능치면 영웅 직공.
    const lethal = d.heroHp.you <= attacker.atk;
    if (lethal) {
      d = attack(d, "ai", attacker.uid, "hero");
      continue;
    }
    // 유리한 교환: 죽일 수 있고 반격에 안 죽는 적 미니언.
    const targets = d.board.you
      .filter((m) => m.curHp <= attacker.atk)
      .sort((a, b) => b.atk - a.atk);
    const safe = targets.find((t) => t.atk < attacker.curHp);
    const target = safe ?? targets[0];
    if (target && d.board.you.length > 0 && rng() < 0.85) {
      d = attack(d, "ai", attacker.uid, target.uid);
    } else {
      d = attack(d, "ai", attacker.uid, "hero");
    }
  }

  if (!d.winner) d = endTurn(d);
  return d;
}

/** 플레이어가 더 진행 가능한 액션이 있는지(소환 또는 공격). */
export function youHasMove(state: BattleState): boolean {
  if (state.active !== "you" || state.winner) return false;
  const canPlay = state.hand.you.some((c) => c.cost <= state.mana.you) && state.board.you.length < 7;
  const canAttack = state.board.you.some((m) => m.ready);
  return canPlay || canAttack;
}
