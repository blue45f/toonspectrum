import { createContext, type ReactNode } from "react";

/** The app supplies account UI; shared workspace chrome does not import the auth domain. */
export const WorkspaceAccountContext = createContext<ReactNode>(null);
