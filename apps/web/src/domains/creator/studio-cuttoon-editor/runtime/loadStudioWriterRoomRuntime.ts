type StudioWriterRoomRuntime = Pick<
  typeof import("../../studio-writer-room"),
  "createEmptyStudioWriterRoomDocument" | "normalizeStudioWriterRoomDocument" | "replaceStudioWriterRoomStage"
>;

/** 동시 요청은 공유하되 실패한 청크 Promise를 영구 캐시하지 않는다. */
export function createStudioWriterRoomRuntimeLoader(load: () => Promise<StudioWriterRoomRuntime>) {
  let pending: Promise<StudioWriterRoomRuntime> | null = null;
  return (): Promise<StudioWriterRoomRuntime> => {
    pending ??= Promise.resolve().then(load).catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export const loadStudioWriterRoomRuntime = createStudioWriterRoomRuntimeLoader(
  () => import("../../studio-writer-room"),
);
