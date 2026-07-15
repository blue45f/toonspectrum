import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
// 브라우저 프리뷰 빌드(PREVIEW_NO_TDS=1)에서는 TDS를 대체 컴포넌트로 alias 해요.
// @toss/tds-mobile은 앱인토스 밖에서 런타임 가드로 예외를 던져 일반 브라우저 마운트를 막거든요.
// 실제 앱인토스(.ait) 빌드에는 영향이 없어요(env 미설정 시 alias 비활성).
const previewNoTds = process.env.PREVIEW_NO_TDS === '1';
const tdsShim = fileURLToPath(new URL('./src/tds-shim.tsx', import.meta.url));
// 웹 feature 컴포넌트(/studio·/create)를 재사용하려고 toss 가 레포 루트의 소스를 cross-app import
// 한다. 웹은 "@/…" 를 레포 루트로 매핑(루트 tsconfig/vite 와 동일) → toss 에서도 같은 매핑을 줘야
// 웹 컴포넌트의 "@/lib/*","@/components/*","@/src/*" 임포트가 동일 파일로 해소된다.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    // web·toss 가 같은 모노레포에서 섞이지 않도록(둘 다 React 19) 단일 React 인스턴스로 정렬.
    // (invalid hook 방지) 웹 컴포넌트를 끌어와도 동일 react/react-dom 으로 dedupe 된다.
    dedupe: ['react', 'react-dom'],
    alias: {
      // 웹과 동일한 "@/…" → 레포 루트 매핑. trailing slash 로 prefix 매칭(다른 alias 와 충돌 X).
      '@/': repoRoot,
      ...(previewNoTds ? { '@toss/tds-mobile-ait': tdsShim, '@toss/tds-mobile': tdsShim } : {}),
    },
  },
});
