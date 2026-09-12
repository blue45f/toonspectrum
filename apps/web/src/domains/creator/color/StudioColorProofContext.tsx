import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from "react";
import type { PageState } from "../studio-page-state";
import type { StudioColorProofDocument } from "./studio-color-proof-document";

const ProofDialog = lazy(() => import("./StudioColorProofDialog"));
const Context = createContext<(() => void) | null>(null);
export interface StudioColorProofHost {
  readonly page: PageState;
  readonly color: string;
  readonly disabled: boolean;
  readonly getCurrentPage: () => PageState | undefined;
  readonly capture: () => Promise<HTMLCanvasElement[]>;
  readonly commitProfile: (source: PageState, profile: StudioColorProofDocument | undefined) => boolean;
}
/** Intent-only loading keeps the ICC parser, transform and binary encoder off the startup graph. */
export function StudioColorProofProvider({ children, ...host }: StudioColorProofHost & { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return <Context value={() => setOpened(true)}>
    {children}
    {opened ? <Suspense fallback={<div role="status" className="fixed bottom-4 right-4 z-[190] rounded bg-panel p-3 text-sm">ICC 도구를 여는 중… <button type="button" className="min-h-11 px-3" onClick={() => setOpened(false)}>취소</button></div>}>
      <ProofDialog key={host.page.id} host={host} onClose={() => setOpened(false)} />
    </Suspense> : null}
  </Context>;
}
export function StudioColorProofLauncher() {
  const open = useContext(Context);
  if (!open) return null;
  return <button type="button" onClick={open} className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" aria-haspopup="dialog">ICC 색상 확인·출력</button>;
}
