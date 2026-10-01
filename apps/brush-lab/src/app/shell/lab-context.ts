import { createContext, useContext } from "react";

import { useLabState } from "../state/lab-store";

import type { LaneDescriptor, LaneEnvironment } from "../../lanes/lane";
import type { GalleryRenderer } from "../../platform/worker-client";
import type { BenchRunner } from "../state/bench-runner";
import type { LabActions, LabState, LabStore } from "../state/lab-store";

/**
 * 뷰·컴포넌트가 공유하는 런타임 의존성. 셸이 한 번 구성하고 테스트는 모의 레지스트리·렌더러·러너를 넣는다.
 */
export interface LabContextValue {
  store: LabStore;
  actions: LabActions;
  registry: readonly LaneDescriptor[];
  env: LaneEnvironment;
  runner: BenchRunner;
  /** 갤러리 렌더러(Worker 클라이언트). 만들 수 없으면 null이며 사유는 `galleryError`에 있다. */
  gallery: GalleryRenderer | null;
  galleryError: string | null;
}

export const LabContext = createContext<LabContextValue | null>(null);

export function useLab(): LabContextValue {
  const value = useContext(LabContext);
  if (!value) {
    throw new Error("useLab은 BrushLabApp 안에서만 쓸 수 있다");
  }
  return value;
}

/** 컨텍스트 저장소에 대한 셀렉터 구독. 셀렉터는 저장된 참조나 원시값을 돌려줘야 한다. */
export function useLabSelector<T>(selector: (s: LabState) => T): T {
  const { store } = useLab();
  return useLabState(selector, store);
}
