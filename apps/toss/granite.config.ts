import { defineConfig } from '@apps-in-toss/web-framework/config';

// 앱인토스 콘솔 등록명(toonspectrum)과 동일하게. 비게임=partner.
export default defineConfig({
  appName: 'toonspectrum',
  brand: {
    displayName: '툰스펙트럼',
    primaryColor: '#F0A868', // 웹툰 인덱스 따뜻한 앰버 액센트
    icon: '', // TODO: 콘솔 업로드 로고 URL
  },
  web: {
    host: 'localhost',
    port: 5181,
    commands: { dev: 'vite', build: 'vite build' },
  },
  permissions: [
    { name: 'clipboard', access: 'read' },
    { name: 'clipboard', access: 'write' },
  ],
  outdir: 'dist',
  webViewProps: { type: 'partner' },
  navigationBar: { withBackButton: true, withHomeButton: true },
});
