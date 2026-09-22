import { useContext, useEffect, useId } from "react";
import { campusPublicObjects, type CampusObject } from "@/shared/lib/spatial-campus/campus-objects";
import { CampusObjectPublisherContext } from "./campus-object-context";

/** Publish only bounded public display references, never the domain record or a write function. */
export function CampusObjectSource({ objects }: { readonly objects: readonly CampusObject[] }) {
  const publish = useContext(CampusObjectPublisherContext);
  const sourceId = useId();
  const serialized = JSON.stringify(campusPublicObjects(objects));
  useEffect(() => {
    if (!publish) return;
    return publish(sourceId, JSON.parse(serialized) as CampusObject[]);
  }, [publish, serialized, sourceId]);
  return null;
}
