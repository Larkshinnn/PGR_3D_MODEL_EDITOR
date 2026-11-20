/**
 * Global command-pattern undo/redo history for Character Studio.
 * Covers object visibility, part deletion/restoration, rewrite toggles,
 * additions/duplications, transforms, material edits, body patches,
 * Edit Mode face edits, and pose snapshots.
 */

export function createHistoryManager({ limit = 100, onChange = null } = {}) {
  const undoStack = [];
  const redoStack = [];
  let applying = false;

  const notify = () => {
    if (typeof onChange === 'function') onChange();
  };

  function pushInternal(cmd) {
    if (!cmd) return;
    if (cmd.mergeKey && undoStack.length > 0) {
      const top = undoStack[undoStack.length - 1];
      if (top.mergeKey === cmd.mergeKey && typeof top.merge === 'function' && top.merge(cmd)) {
        redoStack.length = 0;
        notify();
        return;
      }
    }
    undoStack.push(cmd);
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
    notify();
  }

  return {
    get isApplying() {
      return applying;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    get undoCount() {
      return undoStack.length;
    },
    get redoCount() {
      return redoStack.length;
    },
    peekUndoLabel: () => undoStack[undoStack.length - 1]?.label ?? null,
    peekRedoLabel: () => redoStack[redoStack.length - 1]?.label ?? null,

    /** Runs `cmd.redo()` and records it onto the undo stack. */
    execute(cmd) {
      if (!cmd || applying) return false;
      applying = true;
      try {
        cmd.redo();
      } finally {
        applying = false;
      }
      pushInternal(cmd);
      return true;
    },

    /** Records a command whose redo state has already been applied live. */
    record(cmd) {
      if (!cmd || applying) return false;
      pushInternal(cmd);
      return true;
    },

    undo() {
      if (undoStack.length === 0 || applying) return false;
      const cmd = undoStack.pop();
      applying = true;
      try {
        cmd.undo();
      } finally {
        applying = false;
      }
      redoStack.push(cmd);
      notify();
      return true;
    },

    redo() {
      if (redoStack.length === 0 || applying) return false;
      const cmd = redoStack.pop();
      applying = true;
      try {
        cmd.redo();
      } finally {
        applying = false;
      }
      undoStack.push(cmd);
      notify();
      return true;
    },

    entries() {
      return [
        ...undoStack.map((c, i) => ({ label: c.label, state: 'done', index: i })),
        ...redoStack
          .slice()
          .reverse()
          .map((c, i) => ({ label: c.label, state: 'undone', index: undoStack.length + i })),
      ];
    },

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      notify();
    },
  };
}
