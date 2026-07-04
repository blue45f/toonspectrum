// StudioStockImagePanel의 "마운트 시점" 렌더 계약 회귀 테스트.
//
// 이 스위트는 renderToStaticMarkup(1회성 SSR 렌더, components/author-line.test.tsx 등 이 저장소의
// 기존 .test.tsx가 쓰는 것과 동일한 패턴)만 쓴다 — package.json에 jsdom/happy-dom이 없어(확인됨)
// @testing-library/react의 render()/fireEvent(실제 DOM 이벤트로 재렌더를 유발하는 API)를 쓸 수
// 없다. 그래서 이 스위트가 증명하는 건 "컴포넌트가 처음 마운트되는 순간, Access Key 저장 여부에 따라
// <details>가 정확히 반대로 펼쳐/접혀 있고 검색 입력이 정확히 반대로 비활성/활성인가"까지다.
//
// 이걸로는 증명 못 하는 것(명시): 이전 버전의 실제 버그 — <details open={!configured}>처럼 매 렌더
// 반응형으로 파생시키면, Access Key 입력란에 글자를 한 개라도 치는 순간(재렌더 발생, configured가
// false→true로 바뀜) React가 이전 렌더와 다른 open prop 값을 보고 실제 DOM의 open 속성을 다시 써서
// <details>를 강제로 접어버리고, 그 안에서 포커스 중이던 <input>이 display:none 처리되며 포커스를
// 잃는(타이핑 도중 입력창이 사라지는) 버그였다. 이 "재렌더 간 동작"은 실제 리컨실러(jsdom+
// @testing-library/react 또는 react-test-renderer)가 있어야 재현/검증 가능한데 이 저장소엔 둘 다
// 없다 — 새 테스트 의존성을 추가하는 건 이번 리뷰 스코프(신규 파일만, 기존 공유 파일인 package.json/
// lockfile 무수정) 밖이라 추가하지 않았다. 대신 아래 두 테스트가 고정하는 "마운트 시점 계약"이
// 고쳐진 코드(useRef로 마운트 시점 값만 고정)가 반드시 지켜야 하는 전제 조건이므로, 예를 들어 누가
// 실수로 useRef의 초기값 표현식을 뒤집으면(`useRef(configured)`처럼) 이 테스트가 바로 잡아낸다.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, afterEach } from "vitest";

import { STUDIO_STOCK_IMAGE_ACCESS_KEY_STORAGE_KEY } from "./studio-stock-image-client";
import { StudioStockImagePanel } from "./StudioStockImagePanel";

// studio-stock-image-client.test.ts의 createMemoryStorage와 동일한 최소 stub. 이 저장소는 Node
// 환경(vitest.config.ts environment:"node")이라 globalThis.localStorage가 원래 존재하지 않으므로
// (studio-stock-image-client.ts의 loadStudioStockImageAccessKey가 그 경우 ""로 취급하는 것과
// 동일하게), 테스트마다 이 stub을 globalThis에 직접 얹었다가 afterEach에서 지운다.
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const noopInsert = () => {
  // 이 스위트는 정적 마운트 렌더만 검증한다 — onInsert는 절대 호출되지 않는다(클릭 이벤트가 없음).
};

describe("StudioStockImagePanel mount-time render contract", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("starts with the Access Key <details> expanded and the search input disabled when no key is saved", () => {
    globalThis.localStorage = fakeStorage() as unknown as Storage;

    const html = renderToStaticMarkup(<StudioStockImagePanel onInsert={noopInsert} />);

    expect(html).toContain('<details open=""');
    expect(html).toMatch(/<summary[^>]*>Unsplash Access Key 등록<\/summary>/);
    expect(html).not.toContain("등록됨");
    expect(html).toMatch(/<input type="text" placeholder="예: 도시 야경, 카페, 바다" disabled="" /);
    expect(html).toContain("Access Key를 먼저 등록하세요.");
  });

  it("starts with the Access Key <details> collapsed and the search input enabled when a key is already saved", () => {
    globalThis.localStorage = fakeStorage({
      [STUDIO_STOCK_IMAGE_ACCESS_KEY_STORAGE_KEY]: "unsplash-existing-key",
    }) as unknown as Storage;

    const html = renderToStaticMarkup(<StudioStockImagePanel onInsert={noopInsert} />);

    expect(html).not.toContain("<details open");
    expect(html).toMatch(/<summary[^>]*>Unsplash Access Key 등록됨 · 변경<\/summary>/);
    expect(html).toMatch(/<input type="text" placeholder="예: 도시 야경, 카페, 바다" class="/);
    expect(html).toContain("검색어를 입력해 무료 사진을 찾아보세요.");
    expect(html).toContain('value="unsplash-existing-key"');
  });
});
