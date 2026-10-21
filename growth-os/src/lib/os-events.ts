export const OPEN_QUEUE = "wexon:open-queue";
export const STATS_DIRTY = "wexon:stats-dirty";

export function openQueue() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_QUEUE));
}

export function markStatsDirty() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STATS_DIRTY));
}
