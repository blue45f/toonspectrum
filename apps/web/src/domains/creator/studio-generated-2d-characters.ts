/** Generated placeable 2D character vectors. */

import type { StudioElementItem } from "./studio-elements-catalog";
import {
  characterBust,
  generatedElement as element,
} from "./studio-generated-2d-foundation";

export const STUDIO_GENERATED_CHARACTER_ITEMS: readonly StudioElementItem[] = Object.freeze([
  element(
    "character-schoolboy",
    "교복 남학생 캐릭터",
    "decor",
    ["캐릭터", "학생", "남학생", "교복", "소년", "schoolboy", "anime"],
    360,
    480,
    characterBust(
      { hair: "#263149", hairDark: "#161d2c", outfit: "#334c74", accent: "#7bbce8", eye: "#355f93" },
      "boy",
    ),
  ),
  element(
    "character-schoolgirl",
    "교복 여학생 캐릭터",
    "decor",
    ["캐릭터", "학생", "여학생", "교복", "소녀", "schoolgirl", "anime"],
    360,
    480,
    characterBust(
      { hair: "#e99ab2", hairDark: "#b86887", outfit: "#5b6f9b", accent: "#f1b4c8", eye: "#76518e" },
      "girl",
    ),
  ),
  element(
    "character-mage",
    "은발 판타지 마법사",
    "decor",
    ["캐릭터", "판타지", "마법사", "은발", "mage", "fantasy", "anime"],
    360,
    480,
    characterBust(
      { hair: "#e8eef6", hairDark: "#9aa8c3", outfit: "#4d4b89", accent: "#71d9e7", eye: "#4f7cc5" },
      "mage",
    ),
  ),
  element(
    "character-street",
    "스트리트 패션 캐릭터",
    "decor",
    ["캐릭터", "스트리트", "패션", "모자", "street fashion", "anime"],
    360,
    480,
    characterBust(
      { hair: "#72655d", hairDark: "#3e3735", outfit: "#252e3f", accent: "#ef7f74", eye: "#6b8154" },
      "street",
    ),
  ),
  element(
    "character-chibi",
    "SD 치비 마스코트",
    "decor",
    ["캐릭터", "치비", "SD", "마스코트", "chibi", "cute"],
    360,
    480,
    characterBust(
      { hair: "#f3b4c4", hairDark: "#b96c8b", outfit: "#f5e8db", accent: "#6acbd7", eye: "#4e77a7" },
      "chibi",
    ),
  ),
  element(
    "character-office",
    "오피스 드라마 캐릭터",
    "decor",
    ["캐릭터", "직장인", "오피스", "정장", "office worker", "drama"],
    360,
    480,
    characterBust(
      { hair: "#3f332f", hairDark: "#241d1b", outfit: "#394860", accent: "#c65a5f", eye: "#5f493f" },
      "office",
    ),
  ),
]);
