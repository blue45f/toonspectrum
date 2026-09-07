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
  "getPage" | "canMutate" | "acquire" | "release" | "reportError"
> {
  prepare: () => boolean;
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
  return {
    onCaptureLayerComp: (name: string, compId?: string): boolean =>
      captureStudioLayerCompTransaction({ ...options, name, compId, validatePage: studioPageToCrdtPage }),
    onChangeLayerComps: (nextComps: readonly StudioLayerComp[]): boolean =>
      changeStudioLayerCompsTransaction({ ...options, nextComps, validatePage: studioPageToCrdtPage }),
    onApplyLayerComp: (comp: StudioLayerComp): Promise<boolean> => {
      if (!options.prepare()) return Promise.resolve(false);
      // Capture after retained strokes flush so that their commit cannot invalidate this edit.
      const ticket = options.captureMutationTicket();
      return applyStudioLayerCompTransaction({
        ...options,
        comp,
        canMutate: () => options.canMutate() && options.canApplyMutation(ticket),
      });
    },
  };
}
