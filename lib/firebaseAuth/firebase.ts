import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

import { firebaseConfig, isFirebaseAuthConfigured } from './config'

// env(apiKey 등) 미주입 시 getAuth 가 'auth/invalid-api-key' 로 throw 하므로,
// 설정됐을 때만 초기화한다. 미설정이면 auth=null — 소비자는 isFirebaseAuthConfigured 로 가드.
export const firebaseApp: FirebaseApp | null = isFirebaseAuthConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

export const auth: Auth = firebaseApp ? getAuth(firebaseApp) : (null as unknown as Auth)
