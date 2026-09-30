"use client";

import { useCallback, useRef, useState } from "react";

type UndoEntry = { label: string; undo: () => PromiseLike<unknown> };

/**
 * A small undo history: each action records how to reverse itself. The last 20 are kept, and the
 * most recent one is shown as a notice with an Undo button for a few seconds.
 */
export function useUndo(afterUndo: () => void) {
  const stack = useRef<UndoEntry[]>([]);
  const nextId = useRef(0);
  const [notice, setNotice] = useState<{ label: string; id: number } | null>(null);

  const pushUndo = useCallback((label: string, undo: () => PromiseLike<unknown>) => {
    stack.current = [...stack.current.slice(-19), { label, undo }];
    const id = ++nextId.current;
    setNotice({ label, id });
    setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 6000);
  }, []);

  const undoLast = useCallback(async () => {
    const entry = stack.current.pop();
    setNotice(null);
    if (!entry) return;
    await entry.undo();
    afterUndo();
  }, [afterUndo]);

  return { pushUndo, undoLast, undoNotice: notice };
}
