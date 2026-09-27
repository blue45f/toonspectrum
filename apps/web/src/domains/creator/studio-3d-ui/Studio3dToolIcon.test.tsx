/** @vitest-environment jsdom */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { Layers2, Scissors, Shapes, Triangle } from "lucide-react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SLOT_METAS } from "../character-shaper/character-shaper-catalog";
import { CHARACTER_SLOT_KINDS } from "../character-shaper/character-shaper-contract";
import { CHARACTER_SHAPER_ICON_REGISTRY, characterShaperSlotIcon } from "../character-shaper/character-shaper-ui-model";
import { STUDIO_3D_TOOL_ICON_NAMES, STUDIO_3D_TOOL_ICONS } from "./studio-3d-tool-icon-registry";
import { Studio3dToolIcon } from "./Studio3dToolIcon";

import type { LucideIcon } from "lucide-react";

afterEach(cleanup);

describe("3D 도구 벡터 아이콘", () => {
  it("모든 캐릭터 슬롯을 서로 다른 벡터로 표시한다", () => {
    const marks = CHARACTER_SLOT_KINDS.map((name) => {
      const { container, unmount } = render(<Studio3dToolIcon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      const markup = svg?.innerHTML;
      unmount();
      return markup;
    });
    expect(new Set(marks).size).toBe(CHARACTER_SLOT_KINDS.length);
  });
  it.each(STUDIO_3D_TOOL_ICON_NAMES)("%s 아이콘은 조작 이름을 중복 낭독하지 않는다", (name) => {
    const { container } = render(<Studio3dToolIcon name={name} size={18} className="text-accent" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.querySelector("path")).not.toBeNull();
    expect(svg?.querySelector("image, foreignObject")).toBeNull();
    expect(svg?.querySelector("[opacity]")).toBeNull();
  });

  it.each([18, 20, 24, 48, "1.5em"])("모든 아이콘을 %s 크기에서도 같은 벡터 좌표로 확대한다", (size) => {
    for (const name of STUDIO_3D_TOOL_ICON_NAMES) {
      const Icon: LucideIcon = STUDIO_3D_TOOL_ICONS[name];
      const { container, unmount } = render(<Icon size={size} />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.getAttribute("width")).toBe(String(size));
      expect(svg?.getAttribute("height")).toBe(String(size));
      expect(svg?.getAttribute("stroke-width")).toBe("2");
      expect(svg?.getAttribute("data-studio-3d-tool-icon")).toBe(name);
      unmount();
    }
  });

  it("크기를 생략하면 20px와 장식용 SVG 기본값을 사용한다", () => {
    const Icon = STUDIO_3D_TOOL_ICONS.hair;
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });

  it("SVG name prop이 등록된 슬롯의 아이콘 이름을 덮어쓰지 않는다", () => {
    const Icon: LucideIcon = STUDIO_3D_TOOL_ICONS.hair;
    const { container } = render(<Icon name="external-svg-name" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-studio-3d-tool-icon")).toBe("hair");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });

  it("Lucide 호환 컴포넌트가 SVG ref와 사용자 props를 전달한다", () => {
    const ref = createRef<SVGSVGElement>();
    const onClick = vi.fn();
    const Icon: LucideIcon = STUDIO_3D_TOOL_ICONS.nose;
    const { container } = render(
      <Icon ref={ref} className="text-accent" style={{ color: "rebeccapurple" }}
        strokeWidth={3} data-testid="nose-icon" onClick={onClick} />,
    );
    const svg = container.querySelector("svg");
    expect(ref.current).toBe(svg);
    expect(svg?.classList.contains("text-accent")).toBe(true);
    expect(svg?.classList.contains("studio-3d-tool-icon")).toBe(true);
    expect(svg?.style.color).toBe("rebeccapurple");
    expect(svg?.getAttribute("stroke-width")).toBe("3");
    expect(svg?.getAttribute("data-testid")).toBe("nose-icon");
    if (!svg) throw new Error("아이콘 SVG가 없습니다.");
    fireEvent.click(svg);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("직접 컴포넌트도 SVG ref와 명시적 접근성 props를 전달한다", () => {
    const ref = createRef<SVGSVGElement>();
    const { getByRole } = render(
      <Studio3dToolIcon ref={ref} name="camera" aria-hidden={false} aria-label="촬영 안내" role="img">
        <title>촬영 안내</title>
      </Studio3dToolIcon>,
    );
    expect(getByRole("img", { name: "촬영 안내" })).toBe(ref.current);
    expect(ref.current?.querySelector("title")?.textContent).toBe("촬영 안내");
  });

  it.each([18, 20, 24, 48])("%spx에서 absoluteStrokeWidth 선 굵기 계약을 보존한다", (size) => {
    const Icon = STUDIO_3D_TOOL_ICONS.bottom;
    const { container } = render(<Icon size={size} strokeWidth={2} absoluteStrokeWidth />);
    const strokeWidth = Number(container.querySelector("svg")?.getAttribute("stroke-width"));
    expect(strokeWidth * size / 24).toBeCloseTo(2);
  });
});

describe("캐릭터 슬롯 아이콘 registry 연결", () => {
  it.each(Object.entries(CHARACTER_SHAPER_ICON_REGISTRY))("%s 등록 이름은 해당 SVG를 표시한다", (name, ExpectedIcon) => {
    const Icon = characterShaperSlotIcon(name);
    expect(Icon).toBe(ExpectedIcon);
    const { container } = render(<Icon size={20} aria-hidden focusable="false" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.querySelector("path, circle, ellipse, rect, line, polygon, polyline")).not.toBeNull();
    expect(svg?.querySelector("image, foreignObject")).toBeNull();
  });

  it("기본 메타는 전체 15개 슬롯을 빠짐없이 포함한다", () => {
    expect(CHARACTER_SLOT_METAS).toHaveLength(15);
    expect(CHARACTER_SLOT_METAS.map((meta) => meta.id)).toEqual(CHARACTER_SLOT_KINDS);
  });

  it.each(CHARACTER_SLOT_METAS)("$id 기본 메타는 대응하는 전용 아이콘을 표시한다", (meta) => {
    const Icon = characterShaperSlotIcon(meta.icon, meta.id);
    expect(meta.icon).toMatch(/^Studio3d/u);
    expect(Icon).toBe(STUDIO_3D_TOOL_ICONS[meta.id]);
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")?.getAttribute("data-studio-3d-tool-icon")).toBe(meta.id);
  });

  it.each(STUDIO_3D_TOOL_ICON_NAMES)("%s의 명시적 이름 표기를 정규화한다", (name) => {
    const words = name.split("-");
    const suffix = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
    const expected = STUDIO_3D_TOOL_ICONS[name];
    for (const spelling of [`Studio3d${suffix}`, `studio3d${suffix}`, `studio-3d-${name}`, `STUDIO_3D_${words.join("_")}`]) {
      expect(characterShaperSlotIcon(spelling, "eyes")).toBe(expected);
    }
  });

  it.each([
    ["Scissors", "hair", Scissors],
    ["Triangle", "nose", Triangle],
    ["Layers2", "bottom", Layers2],
  ] as const)("명시적 %s는 %s 기본 아이콘보다 우선한다", (name, slot, expected) => {
    expect(characterShaperSlotIcon(name, slot)).toBe(expected);
    expect(characterShaperSlotIcon(name, slot)).not.toBe(STUDIO_3D_TOOL_ICONS[slot]);
  });

  it.each(CHARACTER_SLOT_KINDS)("%s에서 잘못된 이름과 빈 값은 슬롯 기본값을 사용한다", (slot) => {
    for (const name of [undefined, null, "", "  ", "NoSuchIcon", "constructor", "__proto__"]) {
      expect(characterShaperSlotIcon(name, slot)).toBe(STUDIO_3D_TOOL_ICONS[slot]);
    }
  });

  it("슬롯도 없으면 기존 Shapes 기본값을 유지한다", () => {
    for (const name of [undefined, null, "", "NoSuchIcon", "constructor"]) {
      expect(characterShaperSlotIcon(name)).toBe(Shapes);
    }
  });
});
