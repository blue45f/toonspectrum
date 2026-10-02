/**
 * 썸네일 스케줄러: 직렬 큐(동시 1개)로 engine.renderThumbnail을 호출하고 결과를 store에 반영한다.
 * 가시 카드 우선, 같은 cacheKey 중복 제거, 실패는 ThumbnailEntry.failed(reasonKo)로 노출한다.
 * 지오메트리 프리셋은 엔진이 `thumbnailSources`를 지원할 때 프리셋을 적용한 임시 소스(`sourceFor`)와 함께 요청한다.
 */
import { DEFAULT_FRAMING, isLabFailure } from "../../contracts";

import type { ApplyPlan, CameraFraming, CharacterEngine, CharacterSource, PresetId, ThumbnailEntry, ThumbnailSize } from "../../contracts";

export interface ThumbnailSchedulerDeps {
  readonly engine: () => CharacterEngine | null;
  /** 프리셋을 현재 레시피에 임시 적용한 플랜(state/apply-plan + catalog) */
  readonly planForPreset: (presetId: PresetId) => ApplyPlan;
  /** state/thumbnail-cache.ts thumbnailCacheKey */
  readonly cacheKeyFor: (presetId: PresetId) => string;
  readonly framingFor?: (presetId: PresetId) => CameraFraming;
  /**
   * 지오메트리 프리셋(헤어·의상 등)의 임시 미리보기 소스. `engine.thumbnailSources === true`일 때만 호출한다.
   * null·undefined를 돌려주면 현재 로드된 소스를 그린다. 던지면 그 카드만 failed(reasonKo)가 된다.
   */
  readonly sourceFor?: (presetId: PresetId) => CharacterSource | null | undefined | Promise<CharacterSource | null | undefined>;
  /** store의 현재 항목(ready + 같은 cacheKey면 건너뛴다) */
  readonly currentEntry: (presetId: PresetId) => ThumbnailEntry | undefined;
  /** store.applyEvent({ type: "thumbnail/update" }) 연결 */
  readonly onUpdate: (presetId: PresetId, entry: ThumbnailEntry) => void;
  readonly size?: ThumbnailSize;
}

export interface ThumbnailRequestOptions {
  readonly visible?: boolean;
}

export interface ThumbnailScheduler {
  /** 필요하면 큐에 넣는다. 이미 ready이고 cacheKey가 같으면 아무것도 하지 않는다. */
  request(presetId: PresetId, options?: ThumbnailRequestOptions): void;
  /** 가시 카드 집합 갱신(대기 중 우선순위 재정렬) */
  setVisible(presetIds: readonly PresetId[]): void;
  cancel(presetId: PresetId): void;
  pending(): number;
  isRunning(): boolean;
  /** 큐가 비고 실행 중인 작업이 없을 때까지 */
  idle(): Promise<void>;
  clear(): void;
}

interface QueuedJob {
  readonly presetId: PresetId;
  readonly cacheKey: string;
  visible: boolean;
  readonly order: number;
}

export function createThumbnailScheduler(deps: ThumbnailSchedulerDeps): ThumbnailScheduler {
  const size: ThumbnailSize = deps.size ?? 128;
  const queue: QueuedJob[] = [];
  const visibleSet = new Set<PresetId>();
  const idleWaiters: Array<() => void> = [];
  let running: QueuedJob | null = null;
  let order = 0;

  const resolveIdle = (): void => {
    if (running || queue.length > 0) return;
    const waiters = idleWaiters.splice(0);
    for (const waiter of waiters) waiter();
  };

  const nextJob = (): QueuedJob | undefined => {
    if (queue.length === 0) return undefined;
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      const candidate = queue[i] as QueuedJob;
      const best = queue[bestIndex] as QueuedJob;
      if ((candidate.visible && !best.visible) || (candidate.visible === best.visible && candidate.order < best.order)) bestIndex = i;
    }
    return queue.splice(bestIndex, 1)[0];
  };

  const runOne = async (job: QueuedJob): Promise<void> => {
    const engine = deps.engine();
    if (!engine) {
      deps.onUpdate(job.presetId, { status: "failed", cacheKey: job.cacheKey, reasonKo: "엔진이 준비되지 않아 썸네일을 만들 수 없습니다." });
      return;
    }
    try {
      const source = engine.thumbnailSources === true ? await deps.sourceFor?.(job.presetId) : undefined;
      const raster = await engine.renderThumbnail({
        presetId: job.presetId,
        plan: deps.planForPreset(job.presetId),
        size,
        framing: deps.framingFor?.(job.presetId) ?? DEFAULT_FRAMING,
        ...(source ? { source } : {}),
      });
      deps.onUpdate(job.presetId, { status: "ready", cacheKey: job.cacheKey, raster });
    } catch (error) {
      const reasonKo = isLabFailure(error) ? error.reasonKo : `썸네일 렌더 중 오류: ${error instanceof Error ? error.message : String(error)}`;
      deps.onUpdate(job.presetId, { status: "failed", cacheKey: job.cacheKey, reasonKo });
    }
  };

  const pump = (): void => {
    if (running) return;
    const job = nextJob();
    if (!job) {
      resolveIdle();
      return;
    }
    running = job;
    void runOne(job).finally(() => {
      running = null;
      pump();
    });
  };

  return {
    request(presetId, options = {}) {
      const cacheKey = deps.cacheKeyFor(presetId);
      const visible = options.visible ?? visibleSet.has(presetId);
      const current = deps.currentEntry(presetId);
      if (current && current.cacheKey === cacheKey && current.status === "ready") return;
      if (running && running.presetId === presetId && running.cacheKey === cacheKey) return;
      const queued = queue.find((job) => job.presetId === presetId);
      if (queued) {
        if (queued.cacheKey === cacheKey) {
          queued.visible = queued.visible || visible;
          return;
        }
        queue.splice(queue.indexOf(queued), 1);
      }
      order += 1;
      queue.push({ presetId, cacheKey, visible, order });
      deps.onUpdate(presetId, { status: "pending", cacheKey });
      pump();
    },
    setVisible(presetIds) {
      visibleSet.clear();
      for (const id of presetIds) visibleSet.add(id);
      for (const job of queue) job.visible = visibleSet.has(job.presetId);
    },
    cancel(presetId) {
      const index = queue.findIndex((job) => job.presetId === presetId);
      if (index >= 0) queue.splice(index, 1);
      resolveIdle();
    },
    pending: () => queue.length,
    isRunning: () => running !== null,
    idle() {
      if (!running && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },
    clear() {
      queue.length = 0;
      resolveIdle();
    },
  };
}
