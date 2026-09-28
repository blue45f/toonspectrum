// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteScrollRestoration } from './RouteScrollRestoration';

const routing = vi.hoisted(() => ({
  location: { pathname: '/learn', search: '', hash: '', key: 'learn-entry', state: null },
  navigation: 'POP',
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useLocation: () => routing.location,
  useNavigationType: () => routing.navigation,
}));

let position = 0;
let height = 12000;
const originalY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight');

beforeEach(() => {
  position = 0;
  height = 12000;
  routing.location = { pathname: '/learn', search: '', hash: '', key: 'learn-entry', state: null };
  routing.navigation = 'POP';
  vi.stubGlobal('ResizeObserver', undefined);
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => height });
  vi.spyOn(window, 'scrollTo').mockImplementation((first?: number | ScrollToOptions, second?: number) => {
    position = typeof first === 'number' ? second ?? 0 : first?.top ?? 0;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalY) Object.defineProperty(window, 'scrollY', originalY);
  else Reflect.deleteProperty(window, 'scrollY');
  if (originalHeight) Object.defineProperty(document.documentElement, 'scrollHeight', originalHeight);
  else Reflect.deleteProperty(document.documentElement, 'scrollHeight');
});

function navigate(pathname: string, key: string, navigation = 'PUSH') {
  routing.location = { pathname, key, search: '', hash: '', state: null };
  routing.navigation = navigation;
}

describe('공개 경로의 이전 스크롤 위치 보존', () => {
  it('새 화면의 높이 축소로 0이 된 좌표가 이전 경로의 기록을 덮어쓰지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 6511; fireEvent.scroll(window); });
    // React가 새 화면을 반영하며 높이를 줄인 뒤 이전 layout effect를 정리하는 상황.
    position = 0;
    navigate('/market/browse', 'market-entry');
    view.rerender(<RouteScrollRestoration />);
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(6511);
  });
  it('복원을 기다리는 짧은 로딩 화면을 떠나도 원래의 목적 좌표를 잃지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 6400; fireEvent.scroll(window); });
    navigate('/market/browse', 'market-entry');
    view.rerender(<RouteScrollRestoration />);
    height = 800;
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    navigate('/about', 'about-entry');
    view.rerender(<RouteScrollRestoration />);
    height = 12000;
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(6400);
  });
  it('같은 페이지의 필터 변경은 사용자의 현재 스크롤을 초기화하지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 2100; fireEvent.scroll(window); });
    vi.mocked(window.scrollTo).mockClear();
    routing.location = { ...routing.location, search: '?level=beginner', key: 'filtered-entry' };
    routing.navigation = 'PUSH';
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(2100);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
