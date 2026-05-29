import { expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";

export function getAtlas(container: HTMLElement): HTMLElement {
  const atlas = container.querySelector(".execution-map-container") as HTMLElement | null;
  expect(atlas).toBeTruthy();
  return atlas!;
}

export function getAtlasNodes(container: HTMLElement): HTMLElement {
  const atlasNodes = container.querySelector(".execution-map-nodes") as HTMLElement | null;
  expect(atlasNodes).toBeTruthy();
  return atlasNodes!;
}

export function getAtlasStage(container: HTMLElement): HTMLElement {
  const stage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
  expect(stage).toBeTruthy();
  return stage!;
}

export function firePointer(
  target: Element,
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
    buttons?: number;
    shiftKey?: boolean;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? 1 },
    shiftKey: { value: init.shiftKey ?? false },
  });
  fireEvent(target, event);
}

export function dragRootNodeToDock(container: HTMLElement, nodeEl: HTMLElement, pointerId = 91) {
  const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
  expect(dockEl).toBeTruthy();
  vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
    x: 200,
    y: 700,
    width: 400,
    height: 60,
    left: 200,
    top: 700,
    right: 600,
    bottom: 760,
    toJSON: () => ({}),
  } as DOMRect);

  const originalLeft = parseFloat(nodeEl.style.left || "0");
  const originalTop = parseFloat(nodeEl.style.top || "0");
  firePointer(nodeEl, "pointerdown", { pointerId, clientX: originalLeft + 50, clientY: originalTop + 30 });
  firePointer(nodeEl, "pointermove", { pointerId, clientX: 300, clientY: 720 });
  firePointer(nodeEl, "pointerup", { pointerId, clientX: 300, clientY: 720, buttons: 0 });
  return dockEl!;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
