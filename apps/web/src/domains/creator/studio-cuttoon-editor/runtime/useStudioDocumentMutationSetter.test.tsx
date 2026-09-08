// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioDocumentMutationSetter } from "./useStudioDocumentMutationSetter";

afterEach(cleanup);

describe("accepted local document metadata mutations", () => {
  function fixture() {
    const markStudioDocumentChanged = vi.fn(() => true);
    const onAcceptedMutation = vi.fn();
    const hook = renderHook(() => {
      const [value, restore] = useState("original");
      const edit = useStudioDocumentMutationSetter(value, restore, { markStudioDocumentChanged, onAcceptedMutation });
      return { value, restore, edit };
    });
    return { ...hook, markStudioDocumentChanged, onAcceptedMutation };
  }

  it("branches once for each accepted edit and composes changes before a render", () => {
    const editor = fixture();
    act(() => {
      expect(editor.result.current.edit(value => `${value} A`)).toBe(true);
      expect(editor.result.current.edit(value => `${value} B`)).toBe(true);
    });
    expect(editor.result.current.value).toBe("original A B");
    expect(editor.onAcceptedMutation).toHaveBeenCalledTimes(2);
  });

  it("preserves redo and state for rejected changes and identical values", () => {
    const editor = fixture();
    editor.markStudioDocumentChanged.mockReturnValue(false);
    act(() => expect(editor.result.current.edit("rejected")).toBe(false));
    act(() => expect(editor.result.current.edit(value => value)).toBe(true));
    expect(editor.result.current.value).toBe("original");
    expect(editor.markStudioDocumentChanged).toHaveBeenCalledOnce();
    expect(editor.onAcceptedMutation).not.toHaveBeenCalled();
  });

  it("keeps raw Undo/Redo or source restoration outside the edit branch", () => {
    const editor = fixture();
    act(() => editor.result.current.restore("restored"));
    expect(editor.onAcceptedMutation).not.toHaveBeenCalled();
    act(() => editor.result.current.edit(value => `${value} edited`));
    expect(editor.result.current.value).toBe("restored edited");
    expect(editor.onAcceptedMutation).toHaveBeenCalledOnce();
  });

  it("does not discard redo if evaluating a proposed edit fails", () => {
    const editor = fixture();
    expect(() => editor.result.current.edit(() => { throw new Error("invalid proposal"); })).toThrow("invalid proposal");
    expect(editor.markStudioDocumentChanged).not.toHaveBeenCalled();
    expect(editor.onAcceptedMutation).not.toHaveBeenCalled();
  });
});
