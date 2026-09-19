import { useEffect, useState } from "react";

/** A failed optional import never reloads the editor or activates another implementation. */
export function useStudioOnDemandModule<T>(load: () => Promise<T>, requested: boolean) {
  const [module, setModule] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!requested || module) return;
    let active = true;
    setFailed(false);
    void Promise.resolve().then(load).then(
      (loaded) => { if (active) setModule(() => loaded); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [load, requested, module, attempt]);
  // Once loaded, retain the original component across close/reopen to preserve its hook state.
  return { module, failed, retry: () => setAttempt((value) => value + 1) };
}

