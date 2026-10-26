import { afterEach, expect, it, vi } from "vitest";
import { createTableurSaveQueue } from "../tableur-save-queue";

afterEach(() => vi.useRealTimers());

it("saves typology even when another cell is edited before the debounce", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const queue = createTableurSaveQueue(save, 800);
  queue.schedule("9437", { typologie_future: "montage_demontage" }, "typologie_future");
  queue.schedule("9437", { taille: "moyen" }, "taille");
  vi.advanceTimersByTime(800);
  expect(save.mock.calls).toEqual([
    [{ typologie_future: "montage_demontage" }, "typologie_future"],
    [{ taille: "moyen" }, "taille"],
  ]);
});

it("flushes the latest pending value rather than the stale rendered row", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const queue = createTableurSaveQueue(save, 800);
  queue.schedule("9437", { typologie_future: "fabrication" }, "typologie_future");
  queue.schedule("9437", { typologie_future: "stockage" }, "typologie_future");
  queue.flush("9437", "typologie_future");
  vi.advanceTimersByTime(800);
  expect(save.mock.calls).toEqual([[{ typologie_future: "stockage" }, "typologie_future"]]);
});