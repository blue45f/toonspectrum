// 웹(루트)과 동일한 Tailwind v4 파이프라인. vite 가 이 설정을 자동 로드해
// build:preview(브라우저 프리뷰)와 ait build(.ait) 양쪽에서 동일하게 적용된다.
// 이 덕분에 웹의 Tailwind 기반 feature 컴포넌트(/studio·/create)를 토스 미니앱에서 그대로 렌더할 수 있다.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
