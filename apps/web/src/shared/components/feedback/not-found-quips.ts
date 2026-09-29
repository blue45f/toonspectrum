/** 클릭할 때마다 바뀌는 웹툰 톤 랜덤 대사 — page 네임스페이스의 ko/en 키와 1:1 대응한다. */
export const NOT_FOUND_QUIP_KEYS = [
  "page.notFound.quip.1",
  "page.notFound.quip.2",
  "page.notFound.quip.3",
  "page.notFound.quip.4",
] as const;

/**
 * 현재와 다른 랜덤 대사 인덱스를 고른다.
 * rand를 주입받아 테스트에서 결정적으로 검증할 수 있다.
 */
export function nextQuipIndex(
  current: number,
  total: number,
  rand: () => number = Math.random,
): number {
  if (total <= 1) return 0;
  const candidate = Math.floor(rand() * total);
  return candidate === current ? (candidate + 1) % total : candidate;
}
