/** 보드 테스트 전용 도구: jsdom에는 레이아웃이 없으므로 포인터 끌기와 요소 위치를 흉내 낸다. */
import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";

import type { ProductionClientCommand } from "../production-api";
import { ProductionWorkBoard } from "../ProductionWorkBoard";

import { smallBoardFixture } from "./board-fixtures";

interface PointerDragOptions {
  /** false면 놓지 않고 끄는 중에서 멈춘다(반환값의 `drop()`으로 나중에 놓는다). */
  readonly drop?: boolean;
  readonly pointerId?: number;
  /** 놓는 세로 위치. 카드 위치를 `stubRect`로 정해 두었을 때 앞뒤를 고르는 데 쓴다. */
  readonly y?: number;
  readonly pointerType?: "mouse" | "touch" | "pen";
}

/** 손잡이(또는 카드)를 잡아 `target` 안으로 끌어 놓는다. */
export function pointerDrag(handle: Element, target: Element, options: PointerDragOptions = {}) {
  const pointerId = options.pointerId ?? 1;
  const y = options.y ?? 40;
  const base = { pointerId, pointerType: options.pointerType ?? "mouse", isPrimary: true };
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
  fireEvent.pointerDown(handle, { ...base, button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { ...base, clientX: 60, clientY: y });
  const drop = () => fireEvent.pointerUp(window, { ...base, clientX: 60, clientY: y });
  if (options.drop !== false) drop();
  return { drop };
}

/**
 * 끌기를 끝낸 직후의 click 차단은 `setTimeout(0)`으로 풀린다. 동기 테스트가 이어지면 그 타이머가 돌기 전에 다음 테스트가 시작되어
 * 다음 테스트의 click이 모두 막히므로, 끌기를 쓰는 테스트 파일은 `afterEach`에서 한 틱 비운다.
 */
export function flushBoardGestureTimers(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** 요소의 화면 위치를 정한다(카드 사이 어디에 놓이는지 시험할 때 쓴다). */
export function stubRect(element: Element, rect: { readonly top: number; readonly height: number; readonly left?: number; readonly width?: number }): void {
  const left = rect.left ?? 0;
  const width = rect.width ?? 240;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left,
      right: left + width,
      width,
      x: left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

export interface MountBoardOptions {
  readonly canEdit?: boolean;
  readonly canManage?: boolean;
  readonly aggregate?: ProductionProjectAggregate;
  readonly execute?: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly initialEntry?: string;
  readonly roleLens?: CreatorRoleLens;
  readonly viewerAssignmentIds?: readonly string[];
  readonly persistOrder?: boolean;
}

/** 라우터 안에 보드를 그린다. 저장 함수를 따로 주지 않으면 항상 성공하는 모의 함수를 쓰고 돌려준다. */
export function mountBoard(options: MountBoardOptions = {}) {
  const execute = options.execute ?? vi.fn(async () => undefined);
  render(
    createElement(
      MemoryRouter,
      { initialEntries: [options.initialEntry ?? "/"] },
      createElement(ProductionWorkBoard, {
        aggregate: options.aggregate ?? smallBoardFixture(),
        canEdit: options.canEdit ?? true,
        canManage: options.canManage ?? true,
        execute,
        roleLens: options.roleLens,
        viewerAssignmentIds: options.viewerAssignmentIds,
        persistOrder: options.persistOrder,
      }),
    ),
  );
  return execute;
}

/** 화면에 있는 카드 id를 읽는 순서대로 돌려준다. */
export function renderedCardIds(root: ParentNode = document): readonly string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-production-task]")).map((card) => card.dataset.productionTask ?? "");
}
