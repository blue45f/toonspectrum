import {
  applyStudioLayerCompTransaction,
  captureStudioLayerCompTransaction,
  changeStudioLayerCompsTransaction,
  type StudioLayerCompTransactionOptions,
} from "./studio-layer-comps-document";
import { studioPageToCrdtPage } from "../live/studio-crdt-page-payload";

import type { StudioLayerComp } from "./studio-layer-comps";
import type { PageState } from "../studio-page-state";

interface StudioLayerCompHandlerOptions<Ticket> extends Pick<
  StudioLayerCompTransactionOptions,
  "getPage" | "canMutate" | "acquire" | "reportError"
> {
  prepare: () => boolean;
  createSynchronizationBarrier: () => (() => Promise<void>);
  captureLeaseRelease: () => (() => void);
  captureMutationTicket: () => Ticket;
  canApplyMutation: (ticket: Ticket) => boolean;
  commit: (
    elements: PageState["elements"],
    patch: Pick<Partial<PageState>, "groups" | "layerComps">,
    pageId: string,
  ) => boolean;
}

/** Event-time document access keeps capture, metadata edits and leased application consistent. */
export function createStudioLayerCompHandlers<Ticket>(
  options: StudioLayerCompHandlerOptions<Ticket>,
) {
  const runPrepared = (transaction: (
    continuation: Pick<StudioLayerCompTransactionOptions, "canMutate" | "synchronize" | "acquire" | "release">,
  ) => Promise<boolean>) => {
    if (!options.canMutate() || !options.prepare()) return Promise.resolve(false);
    // Retained-stroke commits must finish before capturing the asynchronous mutation boundary.
    const ticket = options.captureMutationTicket();
    const synchronize = options.createSynchronizationBarrier();
    let release: () => void = () => undefined;
    return transaction({
      canMutate: () => options.canMutate() && options.canApplyMutation(ticket), synchronize,
      acquire: async (elementIds) => {
        const acquired = await options.acquire(elementIds);
        if (acquired) release = options.captureLeaseRelease();
        return acquired;
      },
      release: () => release(),
    });
  };
  return {
    onCaptureLayerComp: (name: string, compId?: string): Promise<boolean> =>
      runPrepared((continuation) => captureStudioLayerCompTransaction({
        ...options, ...continuation, name, compId, prepare: () => true, validatePage: studioPageToCrdtPage,
      })),
    onChangeLayerComps: (
      nextComps: readonly StudioLayerComp[], expectedComps?: readonly StudioLayerComp[],
    ): Promise<boolean> => runPrepared((continuation) => changeStudioLayerCompsTransaction({
      ...options, ...continuation, nextComps, expectedComps, prepare: () => true, validatePage: studioPageToCrdtPage,
    })),
    onApplyLayerComp: (comp: StudioLayerComp): Promise<boolean> =>
      runPrepared((continuation) => applyStudioLayerCompTransaction({ ...options, ...continuation, comp })),
  };
}
