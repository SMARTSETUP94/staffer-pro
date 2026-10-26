/** Keep independent cell edits pending until each has been saved. */
export function createTableurSaveQueue<Row, Field extends string>(
  save: (row: Row, field: Field | null) => void,
  delay: number,
) {
  const pending = new Map<string, { row: Row; field: Field | null; timer: ReturnType<typeof setTimeout> }>();
  const key = (id: string, field: Field | null) => JSON.stringify([id, field]);
  function flush(id: string, field: Field | null) {
    const k = key(id, field);
    const entry = pending.get(k);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(k);
    save(entry.row, entry.field);
  }
  return {
    schedule(id: string, row: Row, field: Field | null) {
      const k = key(id, field);
      const previous = pending.get(k);
      if (previous) clearTimeout(previous.timer);
      pending.set(k, { row, field, timer: setTimeout(() => flush(id, field), delay) });
    },
    flush,
    clear() {
      pending.forEach(({ timer }) => clearTimeout(timer));
      pending.clear();
    },
  };
}