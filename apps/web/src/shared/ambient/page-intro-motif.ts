/**
 * 담당 영역(프로덕션·협업) 페이지 진입 인트로 모티프 판정.
 *
 * 풀스크린 인트로가 아니라, 페이지 분위기에 맞는 1초 내외의 가벼운 진입 연출에
 * 쓰는 장식 모티프 종류를 경로에서 고른다. 이 모듈은 순수 함수만 두어 단위
 * 테스트에서 브라우저 없이 검증할 수 있다.
 */

export type PageIntroMotifKind =
  | "pipeline" // /production/* — 공정 단계가 차례로 채워지듯
  | "frames" // /studio/p/* — 콘티 프레임이 차곡차곡 쌓이듯
  | "gather" // /collaborate/* — 팀원 아바타가 모여들듯
  | "workspace" // /team/* — 워크스페이스 타일이 맞춰지듯
  | "bubbles"; // /messages — 말풍선이 오가듯

const MOTIF_PREFIXES: ReadonlyArray<readonly [prefix: string, motif: PageIntroMotifKind]> = [
  ["/production", "pipeline"],
  ["/studio/p", "frames"],
  ["/collaborate", "gather"],
  ["/team", "workspace"],
  ["/messages", "bubbles"],
];

function normalizeIntroPath(pathname: string): string {
  return pathname.toLowerCase().replace(/\/+$/u, "") || "/";
}

/** 이 경로에 인트로 모티프를 표시한다면 그 종류, 아니면 null. */
export function resolvePageIntroMotif(pathname: string): PageIntroMotifKind | null {
  const path = normalizeIntroPath(pathname);
  for (const [prefix, motif] of MOTIF_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return motif;
  }
  return null;
}
