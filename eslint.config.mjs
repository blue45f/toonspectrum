import { base, react, plugin, defineConfig } from '@heejun/eslint-config'
import js from '@eslint/js'
import { globalIgnores } from 'eslint/config'
import globals from 'globals'

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.vercel/**',
    '**/*.d.ts',
    '**/*.tsbuildinfo',
    '**/*.config.{js,mjs,cjs,ts}',
  ]),

  // 공유 베이스(TS + import 위생 + 커스텀 규칙 + prettier 충돌 비활성).
  base({ files: ['**/*.{ts,tsx}'] }),

  // 루트 Vite 앱(src/·components/·lib/) — React 19 + RC + jsx-a11y.
  // ToonSpectrum 은 Vite 앱이 레포 루트에 있고, NestJS API 만 apps/api 에 있다.
  react({ files: ['{src,components,lib}/**/*.{ts,tsx}'] }),

  // heejun 개인 테스트/목 컨벤션 규칙은 비활성 — 횡단 일관성 대상이 아니라
  // ToonSpectrum 자체 테스트 스타일과 충돌한다(shared base 의 일반 규칙만 채택).
  {
    plugins: { '@heejun': plugin },
    rules: {
      '@heejun/vitest-mock-import': 'off',
      '@heejun/vitest-mock-import-original': 'off',
      '@heejun/mock-response-naming': 'off',
      '@heejun/no-js-interface-direct-access': 'off',
    },
  },

  // 루트 Vite 앱 react-hooks 정책:
  // - exhaustive-deps 는 error 로 강제(공유 react() 는 recommended=warn). OLD 인라인 config 가
  //   error 였고 lint:ci 는 --max-warnings=0 이라 parity 유지.
  // - react-hooks v7 의 신규 "advice" 규칙(set-state-in-effect/refs/immutability/incompatible-library)
  //   은 OLD config 가 활성화하지 않았다(OLD = rules-of-hooks + exhaustive-deps + react-compiler 만).
  //   이들은 정당한 관용구(fetch 직전 setLoading 리셋, latest-ref 패턴, react-hook-form watch)에서
  //   대량 오탐을 낸다. 공유 config 채택이 8000줄 스튜디오에 동작 변경 리스크를 끌고 오지 않도록,
  //   OLD 의 react-hooks 적용 범위와 동일하게 비활성한다(스코프 크립 방지).
  {
    files: ['{src,components,lib}/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },

  // apps/api — NestJS (Node). 데코레이터 + 빈 생성자/클래스 관용.
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // 서버/DB/스크립트 유틸은 Node 런타임.
  {
    files: ['lib/db/**/*.ts', 'lib/server/**/*.ts', 'scripts/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },

  // JS/MJS(스크립트·SW 등) — TS 파서 밖이라 js.recommended + Node globals 로 별도 처리.
  {
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // 테스트 — Vitest globals; fast-refresh 제약 완화 + any 허용.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'off',
    },
  }
)
