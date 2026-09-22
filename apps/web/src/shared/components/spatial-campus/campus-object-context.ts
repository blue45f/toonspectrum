import { createContext } from "react";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";

export type CampusObjectPublisher = (sourceId: string, objects: readonly CampusObject[]) => () => void;
export const CampusObjectPublisherContext = createContext<CampusObjectPublisher | null>(null);
