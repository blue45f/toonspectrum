import type { CreatorSeriesSort } from "./community-contract";
import { listSeries as listPublicationSeries } from "./publication";
import type { CreatorSeriesSummary } from "./series";

export interface CreatorPublicationSeriesListOptions {
  userId?: string;
  sort?: CreatorSeriesSort;
  viewerId?: string;
}

/**
 * Keep the public creator barrel's sort contract explicit. TypeScript includes `undefined` in the
 * parameter tuple of a defaulted function, which otherwise collapses an inferred conditional sort
 * type to `never` even though the runtime implementation accepts the same options object.
 */
export function listSeries(
  options: CreatorPublicationSeriesListOptions = {},
): Promise<CreatorSeriesSummary[]> {
  const invoke = listPublicationSeries as unknown as (
    input: CreatorPublicationSeriesListOptions,
  ) => Promise<CreatorSeriesSummary[]>;
  return invoke(options);
}
