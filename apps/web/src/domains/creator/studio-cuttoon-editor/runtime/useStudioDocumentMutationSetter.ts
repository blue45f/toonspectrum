import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react";

interface StudioDocumentMutationCallbacks {
  readonly markStudioDocumentChanged: () => boolean;
  readonly onAcceptedMutation: () => void;
}

/** Local document edits branch history; raw hydration and history restoration do not. */
export function useStudioDocumentMutationSetter<T>(
  value: T,
  setValue: Dispatch<SetStateAction<T>>,
  { markStudioDocumentChanged, onAcceptedMutation }: StudioDocumentMutationCallbacks,
): (next: SetStateAction<T>) => boolean {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);

  return (next) => {
    const before = latest.current;
    const after = typeof next === "function" ? (next as (current: T) => T)(before) : next;
    if (Object.is(before, after)) return true;
    if (!markStudioDocumentChanged()) return false;
    latest.current = after;
    setValue(after);
    onAcceptedMutation();
    return true;
  };
}
