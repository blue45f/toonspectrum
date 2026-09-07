/** Re-arms the current autosave effect after a temporary writer conflict. */
export function createStudioAutosaveBusyRetry(options: {
  readonly isCurrent: () => boolean;
  readonly requestRetry: () => void;
}) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(): void {
      if (disposed || timer !== null || !options.isCurrent()) return;
      timer = setTimeout(() => {
        timer = null;
        if (!disposed && options.isCurrent()) options.requestRetry();
      }, 1000);
    },
    dispose(): void {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
