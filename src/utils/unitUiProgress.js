export function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

export function computeProgressSegments(movement, actionsRemaining, maxSegments = 16) {
  const normalizedMovement = clampInt(movement, 0, Number.MAX_SAFE_INTEGER)
  const normalizedActions = clampInt(actionsRemaining, 0, normalizedMovement)
  const segmentCap = clampInt(maxSegments, 1, 128)
  const segmentCount = Math.min(normalizedMovement, segmentCap)
  const ratio = normalizedMovement > 0 ? normalizedActions / normalizedMovement : 0
  const filledCount = Math.max(0, Math.min(segmentCount, Math.round(ratio * segmentCount)))
  return {
    normalizedMovement,
    normalizedActions,
    segmentCount,
    filledCount
  }
}
