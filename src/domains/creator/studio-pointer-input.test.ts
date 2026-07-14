import { describe, expect, it, vi } from "vitest";

import {
  beginStudioStrokePointerSession,
  collectStudioStrokePointerBatch,
  isStudioStrokePointerEvent,
  shouldCancelStudioFingerStrokeForAdditionalContact,
  tryCaptureStudioStrokePointer,
  tryReleaseStudioStrokePointer,
  type StudioPointerEventLike,
} from "./studio-pointer-input";

function sample(
  x: number,
  overrides: Partial<StudioPointerEventLike> = {}
): StudioPointerEventLike {
  return {
    pointerId: 7,
    pointerType: "pen",
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: x + 1,
    pressure: 0.5,
    tangentialPressure: 0,
    tiltX: 10,
    tiltY: -5,
    altitudeAngle: 1,
    azimuthAngle: 0.2,
    twist: 20,
    width: 1,
    height: 1,
    timeStamp: x,
    ...overrides,
  };
}

describe("studio pointer input", () => {
  it("opens only a primary left-contact stroke and keeps a legacy Safari pointer fallback", () => {
    expect(beginStudioStrokePointerSession(sample(1, { isPrimary: false }))).toBeNull();
    expect(beginStudioStrokePointerSession(sample(1, { button: 2 }))).toBeNull();

    expect(beginStudioStrokePointerSession(sample(1))).toMatchObject({ pointerId: 7, pointerType: "pen" });
    expect(beginStudioStrokePointerSession(sample(1, { pointerId: undefined }))?.pointerId).toBe(1);
    expect(beginStudioStrokePointerSession(sample(1, { pointerId: Number.NaN }))).toBeNull();
    expect(beginStudioStrokePointerSession(sample(1, { pointerId: -1 }))).toBeNull();
  });

  it("binds every move/up/cancel decision to the pointer that opened the stroke", () => {
    const session = beginStudioStrokePointerSession(sample(1));
    expect(session).not.toBeNull();
    expect(isStudioStrokePointerEvent(session, sample(2))).toBe(true);
    expect(isStudioStrokePointerEvent(session, sample(2, { pointerId: 8 }))).toBe(false);
    expect(isStudioStrokePointerEvent(session, sample(2, { pointerId: Number.NaN }))).toBe(false);

    const wrong = collectStudioStrokePointerBatch(session!, sample(2, { pointerId: 8 }));
    expect(wrong.authoritative).toEqual([]);
    expect(wrong.predicted).toEqual([]);
    expect(wrong.session).toBe(session);
  });

  it("cancels a finger stroke for two-finger navigation but treats touch beside a pen as palm input", () => {
    const finger = beginStudioStrokePointerSession(
      sample(1, { pointerId: 2, pointerType: "touch" })
    )!;
    expect(
      shouldCancelStudioFingerStrokeForAdditionalContact(
        finger,
        sample(2, { pointerId: 3, pointerType: "touch", isPrimary: false })
      )
    ).toBe(true);
    expect(
      shouldCancelStudioFingerStrokeForAdditionalContact(
        finger,
        sample(2, { pointerId: 2, pointerType: "touch" })
      )
    ).toBe(false);

    const pen = beginStudioStrokePointerSession(sample(1, { pointerType: "pen" }))!;
    expect(
      shouldCancelStudioFingerStrokeForAdditionalContact(
        pen,
        sample(2, { pointerId: 8, pointerType: "touch", isPrimary: false })
      )
    ).toBe(false);
  });

  it("preserves coalesced delivery order and appends a missing current event exactly once", () => {
    const down = sample(1);
    const session = beginStudioStrokePointerSession(down)!;
    const a = sample(2);
    const b = sample(3);
    const current = sample(4, { getCoalescedEvents: () => [a, b] });

    const batch = collectStudioStrokePointerBatch(session, current);
    expect(batch.authoritative).toEqual([a, b, current]);

    const includesCurrent = sample(5);
    includesCurrent.getCoalescedEvents = () => [includesCurrent];
    expect(collectStudioStrokePointerBatch(batch.session, includesCurrent).authoritative).toEqual([
      includesCurrent,
    ]);
  });

  it("keeps browser delivery order even when reduced or mixed clocks are not monotonic", () => {
    const session = beginStudioStrokePointerSession(sample(1, { timeStamp: 40 }))!;
    const firstDelivered = sample(2, { timeStamp: 30 });
    const secondDelivered = sample(3, { timeStamp: 10 });
    const current = sample(4, {
      timeStamp: 20,
      getCoalescedEvents: () => [firstDelivered, secondDelivered],
    });
    expect(collectStudioStrokePointerBatch(session, current).authoritative).toEqual([
      firstDelivered,
      secondDelivered,
      current,
    ]);
  });

  it("does not collapse distinct coordinates or professional stylus channels that share a timestamp", () => {
    const session = beginStudioStrokePointerSession(sample(0, { timeStamp: 0 }))!;
    const a = sample(1, { timeStamp: 0 });
    const b = sample(2, { timeStamp: 0 });
    const pressureChange = sample(2, { timeStamp: 0, pressure: 0.8 });
    const barrelChange = sample(2, { timeStamp: 0, pressure: 0.8, tangentialPressure: 0.4 });
    const tiltChange = sample(2, { timeStamp: 0, pressure: 0.8, tangentialPressure: 0.4, tiltX: 30 });
    const angleChange = sample(2, {
      timeStamp: 0,
      pressure: 0.8,
      tangentialPressure: 0.4,
      tiltX: 30,
      altitudeAngle: 0.6,
      azimuthAngle: 1.1,
    });
    const twistChange = sample(2, {
      timeStamp: 0,
      pressure: 0.8,
      tangentialPressure: 0.4,
      tiltX: 30,
      altitudeAngle: 0.6,
      azimuthAngle: 1.1,
      twist: 90,
    });
    const contactChange = sample(2, {
      timeStamp: 0,
      pressure: 0.8,
      tangentialPressure: 0.4,
      tiltX: 30,
      altitudeAngle: 0.6,
      azimuthAngle: 1.1,
      twist: 90,
      width: 3,
      height: 2,
    });
    const current = sample(3, {
      timeStamp: 0,
      getCoalescedEvents: () => [
        a,
        b,
        b,
        pressureChange,
        barrelChange,
        tiltChange,
        angleChange,
        twistChange,
        contactChange,
      ],
    });

    expect(collectStudioStrokePointerBatch(session, current).authoritative).toEqual([
      a,
      b,
      pressureChange,
      barrelChange,
      tiltChange,
      angleChange,
      twistChange,
      contactChange,
      current,
    ]);
  });

  it("deduplicates only an adjacent final sample across batches, not a later loop-back", () => {
    const down = sample(1, { timeStamp: 0 });
    const session = beginStudioStrokePointerSession(down)!;
    const first = collectStudioStrokePointerBatch(session, sample(2, { timeStamp: 0 }));
    const repeated = collectStudioStrokePointerBatch(first.session, sample(2, { timeStamp: 0 }));
    expect(repeated.authoritative).toEqual([]);

    const away = collectStudioStrokePointerBatch(repeated.session, sample(3, { timeStamp: 0 }));
    const loopBack = sample(2, { timeStamp: 0 });
    expect(collectStudioStrokePointerBatch(away.session, loopBack).authoritative).toEqual([loopBack]);
  });

  it("falls back to the current event when coalesced APIs are absent, throw, or return junk", () => {
    const session = beginStudioStrokePointerSession(sample(1))!;
    const absent = sample(2);
    expect(collectStudioStrokePointerBatch(session, absent).authoritative).toEqual([absent]);

    const throwing = sample(3, {
      getCoalescedEvents: () => {
        throw new Error("unsupported");
      },
    });
    expect(collectStudioStrokePointerBatch(session, throwing).authoritative).toEqual([throwing]);

    const junk = sample(4, { getCoalescedEvents: () => ({ length: 1 }) });
    expect(collectStudioStrokePointerBatch(session, junk).authoritative).toEqual([junk]);

    const predictedThrow = sample(5, {
      getPredictedEvents: () => {
        throw new Error("unsupported");
      },
    });
    expect(
      collectStudioStrokePointerBatch(session, predictedThrow, { includePredicted: true }).predicted
    ).toEqual([]);
  });

  it("keeps predictions preview-only so the same later hardware sample remains authoritative", () => {
    const session = beginStudioStrokePointerSession(sample(1))!;
    const prediction = sample(4);
    const current = sample(2, { getPredictedEvents: () => [prediction] });
    const previewBatch = collectStudioStrokePointerBatch(session, current, { includePredicted: true });
    expect(previewBatch.authoritative).toEqual([current]);
    expect(previewBatch.predicted).toEqual([prediction]);

    const actualBatch = collectStudioStrokePointerBatch(previewBatch.session, prediction);
    expect(actualBatch.authoritative).toEqual([prediction]);
  });

  it("filters foreign coalesced/predicted pointers without reordering valid samples", () => {
    const session = beginStudioStrokePointerSession(sample(1))!;
    const a = sample(2);
    const foreign = sample(3, { pointerId: 99 });
    const predicted = sample(5);
    const current = sample(4, {
      getCoalescedEvents: () => [a, foreign],
      getPredictedEvents: () => [foreign, predicted],
    });
    const batch = collectStudioStrokePointerBatch(session, current, { includePredicted: true });
    expect(batch.authoritative).toEqual([a, current]);
    expect(batch.predicted).toEqual([predicted]);
  });

  it("lets exactly one matching release claim a session, preserving one stroke per undo", () => {
    let session = beginStudioStrokePointerSession(sample(1));
    let undoEntries = 0;
    const release = (event: StudioPointerEventLike) => {
      if (!isStudioStrokePointerEvent(session, event)) return;
      undoEntries += 1;
      session = null;
    };

    release(sample(2, { pointerId: 99 }));
    release(sample(3));
    release(sample(4));
    expect(undoEntries).toBe(1);
  });

  it("captures and releases defensively across unsupported and detached DOM targets", () => {
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    expect(tryCaptureStudioStrokePointer({ setPointerCapture }, 7)).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    expect(
      tryReleaseStudioStrokePointer(
        { hasPointerCapture: () => true, releasePointerCapture },
        7
      )
    ).toBe(true);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(
      tryReleaseStudioStrokePointer(
        { hasPointerCapture: () => false, releasePointerCapture },
        7
      )
    ).toBe(false);

    expect(
      tryCaptureStudioStrokePointer(
        {
          setPointerCapture: () => {
            throw new DOMException("detached");
          },
        },
        7
      )
    ).toBe(false);
    expect(
      tryReleaseStudioStrokePointer(
        {
          releasePointerCapture: () => {
            throw new DOMException("detached");
          },
        },
        7
      )
    ).toBe(false);
  });
});
