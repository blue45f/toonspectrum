import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

import { firebaseConfig } from "./config";

/**
 * Firebase 앱 + Auth 싱글턴 — HMR 안전.
 *
 * Vite dev 의 모듈 핫리로드로 이 파일이 재평가돼도 `initializeApp` 을 다시 부르면
 * "Firebase App named '[DEFAULT]' already exists" 가 난다. 이미 초기화돼 있으면
 * `getApp()` 으로 재사용한다.
 */
export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(firebaseApp);
