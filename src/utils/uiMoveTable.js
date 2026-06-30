export function normalizeActionList(actionList) {
  if (!Array.isArray(actionList)) return []
  const seen = new Set()
  return actionList
    .filter(action => typeof action === 'string')
    .map(action => action.trim())
    .filter(action => action && action !== '-')
    .filter(action => {
      const key = action.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function normalizeOperations(operations, scope = 'scope') {
  const source = Array.isArray(operations) ? operations : []
  return source.map((operation, opIndex) => {
    const moves = Array.isArray(operation && operation.moves) ? operation.moves : []
    return {
      id: `${scope}-op-${opIndex}`,
      title: operation && typeof operation.title === 'string' && operation.title.trim()
        ? operation.title.trim()
        : 'UNNAMED',
      moves: moves.map((move, moveIndex) => ({
        id: `${scope}-op-${opIndex}-move-${moveIndex}`,
        title: move && typeof move.title === 'string' && move.title.trim() ? move.title.trim() : '-',
        dice: Array.isArray(move && move.dice)
          ? move.dice.map(actionList => normalizeActionList(actionList))
          : []
      }))
    }
  })
}

export function getMaxDiceRows(operations) {
  const ops = Array.isArray(operations) ? operations : []
  let maxRows = 0
  ops.forEach(operation => {
    const moves = Array.isArray(operation && operation.moves) ? operation.moves : []
    moves.forEach(move => {
      const rows = Array.isArray(move && move.dice) ? move.dice.length : 0
      if (rows > maxRows) maxRows = rows
    })
  })
  return maxRows
}

export function isSameActionList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
