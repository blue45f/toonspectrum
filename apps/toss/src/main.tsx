import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import config from '../granite.config.ts';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
// 웹 디자인 시스템(Tailwind v4 + 토큰 + 커스텀 유틸리티)을 먼저 로드해 웹 feature
// 컴포넌트(/studio·/create)가 그대로 렌더되게 한다. 토스 셸의 기본 스타일은 그 다음
// index.css 가 덮어써 기존 TDS/인라인 페이지의 외형을 보존한다.
import './web-theme.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </TDSMobileAITProvider>
  </StrictMode>,
);
