// Everything Punto has made in the room, so "clean up" can take it away again.
// Whatever makes something lasting registers how to undo it.
const undos: (() => void)[] = [];

export function remember(undo: () => void): void {
  undos.push(undo);
}

/** Takes away everything made so far, newest first; returns how many things went. */
export function clearAll(): number {
  const count = undos.length;
  for (const undo of undos.splice(0).reverse()) {
    try {
      undo();
    } catch (error) {
      console.warn('[made]', error);
    }
  }
  return count;
}
