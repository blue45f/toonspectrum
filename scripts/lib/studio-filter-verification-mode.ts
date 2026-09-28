export type StudioFilterVerificationAuthority =
  | "authenticated-canonical" | "authenticated-disconnected-denial"
  | "owned-static-local" | "external-or-static";

/** 로컬 편집 성공을 서버 연결 단절 거절로 바꾸어 보고하지 않는다. */
export function resolveStudioFilterVerificationMode(
  environment: Readonly<Record<string, string | undefined>>,
): { authenticated: boolean; localOnly: boolean; expectDenial: boolean; authority: StudioFilterVerificationAuthority } {
  const authenticated = environment.TOONSPECTRUM_FILTER_DIALOG_AUTHENTICATED === "1";
  const localOnly = environment.TOONSPECTRUM_FILTER_DIALOG_LOCAL_ONLY === "1";
  const expectDenial = environment.TOONSPECTRUM_FILTER_DIALOG_EXPECT_DENIAL === "1";
  if (authenticated && localOnly) {
    throw new Error("정본 저장과 로컬 문서 검증은 별도 실행하세요.");
  }
  if (expectDenial && !authenticated) {
    throw new Error("거절 검증에는 실제 인증된 QA 원고가 필요합니다. 로컬 단독 편집 성공으로 대체할 수 없습니다.");
  }
  if ((localOnly || expectDenial) && environment.TOONSPECTRUM_VERIFY_ORIGIN?.trim()) {
    throw new Error("로컬 편집과 연결 단절 검증은 검사기가 소유한 loopback QA runtime에서만 실행하세요.");
  }
  const authority = expectDenial ? "authenticated-disconnected-denial"
    : authenticated ? "authenticated-canonical"
      : localOnly ? "owned-static-local" : "external-or-static";
  return { authenticated, localOnly, expectDenial, authority };
}
