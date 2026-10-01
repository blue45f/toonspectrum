import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CharacterLabApp } from "../shell/CharacterLabApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Character Lab root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <CharacterLabApp />
  </StrictMode>,
);
