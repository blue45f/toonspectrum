// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useI18n } from '@/shared/lib/i18n';
import { CreatorHomeExperience } from './CreatorHomeExperience';

const previous = useI18n.getState().lang;
afterEach(() => { cleanup(); useI18n.setState({ lang: previous }); });
const actions = ['/story-lab', '/studio/new', '/studio', '/production', '/production/projects/sample-project/review', '/studio/publish'];
const visuals = ['plan', 'storyboard', 'create', 'collaborate', 'review', 'publish'];

describe('제작 흐름의 시각적 안내와 다음 작업', () => {
  it('공개 홈(/)은 참조 대시보드에 집중하고 제작 흐름 설명은 작업실 소개로 보낸다', async () => {
    useI18n.setState({ lang: 'ko' });
    await act(async () => { render(<MemoryRouter initialEntries={['/']}><CreatorHomeExperience /></MemoryRouter>); });
    expect(document.querySelector('#creator-flow')).toBeNull();
    expect(document.querySelector('[data-reference-dashboard]')).not.toBeNull();
  });
  it.each(['/about/studio'])('%s의 여섯 단계가 서로 다른 이미지·산출물·실제 다음 동선을 갖는다', async (path) => {
    useI18n.setState({ lang: 'ko' });
    await act(async () => { render(<MemoryRouter initialEntries={[path]}><CreatorHomeExperience /></MemoryRouter>); });
    const cards = [...document.querySelectorAll('#creator-flow .cf-flow-grid > li')];
    expect(cards).toHaveLength(6);
    cards.forEach((card, index) => {
      const image = card.querySelector('img');
      expect(image?.getAttribute('src')).toBe(`/brand/workflow-20260928/${visuals[index]}-640.webp`);
      expect(image?.getAttribute('loading')).toBe('lazy');
      expect(image?.getAttribute('alt')).toBeTruthy();
      expect(card.querySelector('.cf-step-image-link')?.getAttribute('href')).toBe(actions[index]);
      expect(card.querySelector('.cf-step-image-link')?.getAttribute('aria-label')).toBeTruthy();
      expect(card.querySelector('.cf-step-output strong')?.textContent).toBeTruthy();
      const links = [...card.querySelectorAll('.cf-step-actions > a')];
      expect(links.map((link) => link.getAttribute('href'))).toEqual([actions[index], actions[index + 1] ?? '/studio']);
    });
    expect(document.querySelectorAll('.cf-principle-art')).toHaveLength(4);
    expect(document.querySelectorAll('.cf-support-art')).toHaveLength(3);
    expect(document.querySelectorAll('a a, button a, a button')).toHaveLength(0);
  });
  it('영어 선택 시 그림 설명과 결과·다음 작업 문구도 영어로 제공한다', async () => {
    useI18n.setState({ lang: 'en' });
    await act(async () => { render(<MemoryRouter initialEntries={['/about/studio']}><CreatorHomeExperience /></MemoryRouter>); });
    const section = document.querySelector('#creator-flow');
    expect(section?.textContent).toContain('Every stage leads naturally');
    expect(section?.textContent).toContain('You create');
    expect(section?.textContent).toContain('Next');
    expect(section?.querySelector('[data-workflow-step] img')?.getAttribute('alt')).toBe('A script and character map establish the story');
  });
});
