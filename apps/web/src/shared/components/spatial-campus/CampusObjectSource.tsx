import { useContext, useEffect, useId } from "react";
import { canonicalCampusObjectCandidate, type CampusObject } from "@/shared/lib/spatial-campus/campus-objects";
import { CampusObjectPublisherContext } from "./campus-object-context";

/** Publish bounded display references only. The frame applies the current district and privacy policy. */
export function CampusObjectSource({ objects }: { readonly objects: readonly CampusObject[] }) {
  const publish = useContext(CampusObjectPublisherContext);
  const sourceId = useId();
  const serialized = JSON.stringify(objects.slice(0, 96).flatMap((item) => {
    const candidate = canonicalCampusObjectCandidate(item);
    return candidate ? [candidate] : [];
  }));
  useEffect(() => {
    if (!publish) return;
    return publish(sourceId, JSON.parse(serialized) as CampusObject[]);
  }, [publish, serialized, sourceId]);
  return null;
}
