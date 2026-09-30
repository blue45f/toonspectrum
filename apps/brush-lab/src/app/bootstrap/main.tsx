import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BrushLabApp } from "../shell/BrushLabApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Brush Lab root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <BrushLabApp />
  </StrictMode>,
);
