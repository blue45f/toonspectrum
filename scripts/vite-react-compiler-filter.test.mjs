import assert from "node:assert/strict";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

import { WEB_REACT_COMPILER_EXCLUDE } from "../apps/web/vite-react-compiler-filter.ts";

// 이 파일은 루트 Vitest 수집 대상이면서 `node --test`로도 직접 돌려야 하므로,
// 러너에 따라 테스트 등록 함수를 바꾼다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const excluded = (path) => WEB_REACT_COMPILER_EXCLUDE.some((pattern) => pattern.test(path));

test("React와 사전 번들링한 3D 의존성을 다시 컴파일하지 않는다", () => {
  for (const path of [
    "/workspace/node_modules/react-dom/client.js",
    "/@fs/worktree/node_modules/.vite/deps/react-dom_client.js?v=123",
    "/workspace/node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.js",
    "C:\\work\\node_modules\\lucide-react\\dist\\index.js",
    "\0rolldown/runtime.js",
  ]) assert.equal(excluded(path), true, path);
});

test("리로드 안정성 예외는 쿼리 문자열이 있어도 보존한다", () => {
  for (const path of [
    "/src/shared/lib/programmatic-reload.ts",
    "/src/shared/lib/programmatic-reload-hmr.ts?direct",
  ]) assert.equal(excluded(path), true, path);
});

test("앱과 현재 워크스페이스의 React 소스는 여전히 컴파일한다", () => {
  for (const path of [
    "/workspace/apps/web/src/domains/creator/character-shaper/StudioCharacterShaper.tsx",
    "/workspace/packages/studio-project-model/src/useProject.ts",
  ]) assert.equal(excluded(path), false, path);
});
