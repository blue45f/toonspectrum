import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isFirebaseAuthConfigured } from "./config";
import { AuthContext, authErrorMessage, type AuthState, type AuthUser } from "./context";
import { auth } from "./firebase";

/** Firebase User → 앱이 쓰는 가벼운 형태로 투영. */
function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName,
  };
}

/** auth 호출을 감싸 에러를 한국어 메시지로 정규화한다(throw 는 안 함 — state.error 로 노출). */
function errorCodeOf(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

/**
 * Firebase Auth 컨텍스트 Provider — 앱 루트에 1회 마운트한다.
 * `onAuthStateChanged` 를 구독해 세션을 유지하고, 인증 액션을 컨텍스트로 노출한다.
 *
 * 환경변수(VITE_FIREBASE_*) 미설정이면 인증을 초기화하지 않고 loading 을 즉시 해제한다.
 * 그 경우 액션은 친절한 에러를 세팅한다(빌드/런타임 크래시 없음).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // 미설정이면 구독할 게 없으니 처음부터 loading=false(effect 내 동기 setState 회피).
  const [loading, setLoading] = useState(isFirebaseAuthConfigured);
  const [error, setError] = useState<string | null>(null);

  // StrictMode 이중 호출/언마운트 사이 setState 경합을 막기 위한 활성 가드.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!isFirebaseAuthConfigured) {
      return () => {
        mounted.current = false;
      };
    }
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!mounted.current) return;
      setUser(fbUser ? toAuthUser(fbUser) : null);
      setLoading(false);
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** 인증 액션 공통 래퍼 — 미설정 가드 + 에러 정규화. 성공 시 onAuthStateChanged 가 user 갱신. */
  const run = useCallback(async (op: () => Promise<unknown>): Promise<void> => {
    if (!isFirebaseAuthConfigured) {
      setError(authErrorMessage("auth/configuration-not-found"));
      return;
    }
    setError(null);
    try {
      await op();
    } catch (err) {
      const message = authErrorMessage(errorCodeOf(err));
      if (mounted.current) setError(message);
      throw new Error(message, { cause: err });
    }
  }, []);

  const signUp = useCallback(
    (email: string, password: string) =>
      run(() => createUserWithEmailAndPassword(auth, email, password)),
    [run]
  );
  const signIn = useCallback(
    (email: string, password: string) =>
      run(() => signInWithEmailAndPassword(auth, email, password)),
    [run]
  );
  const signInAsGuest = useCallback(() => run(() => signInAnonymously(auth)), [run]);
  const signOut = useCallback(() => run(() => fbSignOut(auth)), [run]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, error, signUp, signIn, signInAsGuest, signOut, clearError }),
    [user, loading, error, signUp, signIn, signInAsGuest, signOut, clearError]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
