import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { composeCharacterLab } from "../composition";
import { CharacterLabApp } from "../shell/CharacterLabApp";
import { CompositionFailure } from "../shell/CompositionFailure";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Character Lab root element was not found");
}

// 조립 실패(카탈로그 불변식 등)는 빈 화면이 아니라 원인을 그대로 보여준다.
let app: ReactElement;
try {
  app = <CharacterLabApp runtime={composeCharacterLab()} />;
} catch (error) {
  app = <CompositionFailure error={error} />;
}

createRoot(root).render(<StrictMode>{app}</StrictMode>);
