import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { resolveSiteRouteVisualKind, type SiteRouteVisualKind } from '@/shared/lib/site-route-visual';
import type { WorkflowVisual } from './workflow-illustration';

/** 기존 경로 분류의 표시 목적만 투영한다. 라우팅·권한·문서 수명주기는 바꾸지 않는다. */
export const WORKFLOW_BY_ROUTE_KIND: Readonly<Record<SiteRouteVisualKind, WorkflowVisual>> = {
  workflow: 'create', discover: 'community', create: 'create', planning: 'plan',
  spatial: 'create', assets: 'assets', production: 'collaborate', review: 'review',
  publish: 'publish', learn: 'learn', connect: 'collaborate', manage: 'recovery',
  trust: 'rights', play: 'community',
};

export function workflowVisualForPath(pathname: string): WorkflowVisual {
  const path = canonicalSitePath(pathname);
  if (/^\/(?:settings\/ai|studio\/(?:ai-lab|ai-runtime|ai-settings|generate))(?:\/|$)/u.test(path)) return 'ai';
  if (/^\/studio\/(?:import|recovery|trash)(?:\/|$)/u.test(path)) return 'recovery';
  if (/^\/community(?:\/|$)/u.test(path)) return 'community';
  // 공개 작품 갤러리와 홍보 영상 제작은 목적이 다르다.
  if (path === '/showcase' || /^\/showcase\/(?:works|series)(?:\/|$)/u.test(path)) return 'community';
  return WORKFLOW_BY_ROUTE_KIND[resolveSiteRouteVisualKind(path)];
}
