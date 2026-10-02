/**
 * 임베딩 유사도(순수). MediaPipe ImageEmbedder가 돌려주는 float 벡터를 `Embedding`(Float32Array)으로 다루며
 * 코사인 유사도·L2 정규화·안정 정렬 Top-K를 제공한다. 결정적이고 입력을 바꾸지 않는다.
 *
 * 길이가 다른 벡터 비교는 계약 위반이므로 조용히 0을 돌려주지 않고 throw한다(무음 대체 금지).
 */
import type { Embedding } from "../../contracts";

/** number[]·TypedArray → Embedding(복사본) */
export function toEmbedding(values: ArrayLike<number>): Embedding {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    out[i] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return out;
}

export function dot(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error(`임베딩 길이가 다릅니다(${a.length} vs ${b.length}).`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function norm(a: Embedding): number {
  return Math.sqrt(dot(a, a));
}

/** 길이 1로 정규화한 새 벡터. 영벡터는 그대로(영벡터) 돌려준다. */
export function l2Normalize(a: Embedding): Embedding {
  const length = norm(a);
  const out = new Float32Array(a.length);
  if (length === 0 || !Number.isFinite(length)) return out;
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) / length;
  return out;
}

/**
 * 코사인 유사도 [-1, 1]. 어느 한쪽이 영벡터면 0(정의 불가를 0으로 보고하되 NaN은 내지 않는다).
 */
export function cosine(a: Embedding, b: Embedding): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  const value = dot(a, b) / denominator;
  return Math.min(1, Math.max(-1, value));
}

export interface SimilarityCandidate<Id extends string = string> {
  readonly id: Id;
  readonly embedding: Embedding;
}

export interface RankedCandidate<Id extends string = string> {
  readonly id: Id;
  readonly score: number;
  /** 0부터, 점수 내림차순 */
  readonly rank: number;
}

/**
 * query와 각 후보의 코사인 유사도로 상위 k개를 고른다. 점수가 같으면 입력 순서를 유지한다(안정 정렬).
 * k를 생략하면 전부 돌려준다. 후보 길이가 query와 다르면 throw.
 */
export function rankBySimilarity<Id extends string = string>(
  query: Embedding,
  candidates: readonly SimilarityCandidate<Id>[],
  k?: number,
): RankedCandidate<Id>[] {
  const scored = candidates.map((candidate, index) => ({ id: candidate.id, score: cosine(query, candidate.embedding), index }));
  scored.sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));
  const limit = k === undefined ? scored.length : Math.max(0, Math.min(k, scored.length));
  return scored.slice(0, limit).map((entry, rank) => ({ id: entry.id, score: entry.score, rank }));
}
