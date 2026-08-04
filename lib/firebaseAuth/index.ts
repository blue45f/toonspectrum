/**
 * Firebase Auth 모듈 — desk/형제 앱용 벤더 소스.
 *
 * 중요: ToonSpectrum 웹 GNB·사이트 세션 로그인에는 쓰지 않는다.
 * 사이트 계정은 `components/auth/auth-menu.tsx`(Nest HttpOnly 세션)가 단일 진입점이다.
 * Firebase 를 GNB에 다시 붙이면 "회원" / "로그인" 이중 UI가 재발한다.
 *
 * 사용(비-사이트 크롬):
 *   1) 앱 루트에 <AuthProvider> 마운트
 *   2) 어디서든 useAuth() 로 { user, loading, error, signIn, signUp, signInAsGuest, signOut }
 *   3) 로그인 진입점에서 <AuthDialog open onOpenChange={...} />
 *
 * 설정은 env(VITE_FIREBASE_*)로만 주입한다 — config.ts 참고(리터럴 금지).
 */
export { AuthProvider } from "./AuthProvider";
export { AuthDialog } from "./AuthDialog";
export { useAuth } from "./useAuth";
export { isFirebaseAuthConfigured } from "./config";
export type { AuthUser, AuthState } from "./context";
