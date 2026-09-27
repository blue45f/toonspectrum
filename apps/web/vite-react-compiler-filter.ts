/** 사용자 제외 규칙은 Babel 기본값을 덮어쓰므로 의존성과 가상 런타임 제외도 함께 보존한다. */
export const WEB_REACT_COMPILER_EXCLUDE = [
  /[/\\]node_modules[/\\]|^\0rolldown\/runtime\.js$/u,
  /programmatic-reload(?:-hmr)?\.ts(?:\?.*)?$/u,
];
