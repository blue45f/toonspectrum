/** Keep the established viewport API and renderer intact while adding reversible precision tools. */
import { StudioHybridDccPrecisionTools } from "./StudioHybridDccPrecisionTools";
import { StudioHybridDccTransformUtilities } from "./StudioHybridDccTransformUtilities";
import {
  StudioHybridDccViewport as StudioHybridDccViewportCore,
  type StudioHybridDccViewportProps,
} from "./StudioHybridDccViewportCore";

// eslint-disable-next-line react-refresh/only-export-components -- preserve the public viewport projection/test contracts
export * from "./StudioHybridDccViewportCore";

export function StudioHybridDccViewport(props: StudioHybridDccViewportProps) {
  return (
    <>
      <StudioHybridDccViewportCore {...props} />
      <StudioHybridDccPrecisionTools {...props} />
      <StudioHybridDccTransformUtilities {...props} />
    </>
  );
}
