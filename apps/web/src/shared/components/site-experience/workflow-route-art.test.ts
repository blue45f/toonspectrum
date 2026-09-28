import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_VISUALS } from './workflow-illustration';
import { workflowVisualForPath } from './workflow-route-art';

describe('하위 작업 경로에 맞는 설명 이미지', () => {
  it.each([
    ['/story-lab', 'plan'], ['/studio/p/demo/story', 'plan'],
    ['/production/projects/demo/review', 'review'], ['/studio/p/demo/export', 'publish'],
    ['/market/browse', 'assets'], ['/studio/p/demo/assets', 'assets'],
    ['/studio/ai-lab', 'ai'], ['/settings/ai', 'ai'],
    ['/studio/import', 'recovery'], ['/studio/trash', 'recovery'],
    ['/learn/lessons/camera-perspective', 'learn'], ['/community/post/demo', 'community'],
    ['/collaborate/workspace', 'collaborate'], ['/privacy', 'rights'],
  ])('%s에 %s 역할을 표시한다', (route, expected) => {
    expect(workflowVisualForPath(route)).toBe(expected);
  });
  it('기존 전수 원장의 336경로를 빠짐없이 지원한다', () => {
    const audit = JSON.parse(readFileSync('docs/design/illustrated-ui-route-coverage-20260928.json', 'utf8'));
    expect(audit.routes).toHaveLength(336);
    for (const entry of audit.routes) expect(WORKFLOW_VISUALS).toContain(workflowVisualForPath(entry.route));
  });
});
