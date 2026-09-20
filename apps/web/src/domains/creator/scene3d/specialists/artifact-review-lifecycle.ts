/** One active initialization/session and one latest pending request per mounted preview. */
export function createArtifactReviewLifecycle<T extends { dispose(): void }>() {
  interface Job {
    readonly abort: AbortController;
    readonly create: (signal: AbortSignal) => Promise<T>;
    readonly ready: (value: T) => void;
    readonly error: (reason: unknown) => void;
    value?: T;
    initializing: boolean;
  }
  let closed = false;
  let active: Job | undefined;
  let pending: Job | undefined;
  const release = (job: Job) => {
    job.abort.abort();
    if (!job.initializing) {
      try {
        job.value?.dispose();
      } catch {
        /* Continue cleanup and do not revive retired views. */
      }
      job.value = undefined;
      if (active === job) active = undefined;
    }
  };
  const pump = () => {
    if (closed || active || !pending) return;
    const job = pending;
    pending = undefined;
    active = job;
    job.initializing = true;
    void Promise.resolve()
      .then(() => {
        if (job.abort.signal.aborted) return undefined;
        return job.create(job.abort.signal);
      })
      .then(
        (value) => {
          job.initializing = false;
          job.value = value;
          if (closed || job.abort.signal.aborted || active !== job)
            release(job);
          else if (value) {
            try {
              job.ready(value);
            } catch {
              release(job);
            }
          }
        },
        (reason: unknown) => {
          job.initializing = false;
          if (!closed && !job.abort.signal.aborted) {
            try {
              job.error(reason);
            } catch {
              /* UI only. */
            }
          }
          release(job);
        },
      )
      .finally(pump);
  };
  return {
    replace(
      create: Job["create"],
      ready: Job["ready"],
      error: Job["error"],
    ): () => void {
      if (closed) return () => {};
      if (pending) release(pending);
      const job: Job = {
        create,
        ready,
        error,
        abort: new AbortController(),
        initializing: false,
      };
      pending = job;
      if (active) release(active);
      pump();
      return () => {
        if (pending === job) pending = undefined;
        release(job);
        pump();
      };
    },
    dispose() {
      if (closed) return;
      closed = true;
      if (pending) release(pending);
      pending = undefined;
      if (active) release(active);
    },
  };
}
