/**
 * LOS / attack-arc rejection — same string for GameState and UI.
 * Change only here (and tests that assert the message).
 */
export const INVALID_LINE_OF_FIRE_MESSAGE = 'Target is not a valid line-of-fire target'

/** Clamp selected fire-target index to [0, len-1]; len ≤ 0 → 0. */
export function clampTargetIndex(index, len) {
  if (len <= 0) return 0
  let idx = Number(index)
  if (!Number.isFinite(idx)) return 0
  idx = Math.floor(idx)
  return Math.max(0, Math.min(idx, len - 1))
}
