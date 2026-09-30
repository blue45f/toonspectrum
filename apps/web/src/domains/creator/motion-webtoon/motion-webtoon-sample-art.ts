/**
 * 모션 웹툰 샘플 컷 아트.
 *
 * 히어로 CTA·맛보기 버튼에서 쓰는 샘플 회차의 컷 이미지.
 * 자체 에셋(`public/assets/motion-webtoon/`)을 참조한다:
 * 외부 플레이스홀더(picsum) 의존을 제거하고, 오프라인에서도 동작하며,
 * 대사 분위기(고백·긴장·축하)와 어울리는 시네마틱 무드를 제공한다.
 *
 * SVG 원본: `apps/web/public/assets/motion-webtoon/sample-cut-*.svg`
 */

/** 샘플 회차의 컷 이미지 3종 — 대사 분위기와 매칭 (고백·긴장·축하). */
export const SAMPLE_CUT_IMAGE_URIS: readonly string[] = [
  "/assets/motion-webtoon/sample-cut-romance.svg",
  "/assets/motion-webtoon/sample-cut-tension.svg",
  "/assets/motion-webtoon/sample-cut-joy.svg",
];

/** 인덱스에 맞는 샘플 컷 이미지 (순환). */
export function sampleCutImageUri(index: number): string {
  const normalized =
    ((index % SAMPLE_CUT_IMAGE_URIS.length) + SAMPLE_CUT_IMAGE_URIS.length) %
    SAMPLE_CUT_IMAGE_URIS.length;
  return SAMPLE_CUT_IMAGE_URIS[normalized];
}
