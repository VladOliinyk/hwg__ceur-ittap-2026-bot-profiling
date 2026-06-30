/**
 * Headless observation snapshot — what a strategy "sees" when deciding
 * the next command.
 *
 * The shape is intentionally plain (no GameState references, no Vue
 * reactivity) so strategies can be serialized, logged, or shipped to
 * an LLM without dragging engine internals along.
 *
 * Note: this is a full-information observation. The board game has no
 * fog of war, so both players see the same state aside from the
 * `currentPlayer` perspective. If/when partial observability is added,
 * this is the seam to filter the opponent's fields.
 *
 * @module domain/simulation/observation
 */

function unitView(gameState, unit) {
  const row = gameState.turnState[unit.id] || null
  return {
    id: unit.id,
    type: unit.type,
    name: unit.name,
    losMode: unit.losMode,
    iconKey: unit.iconKey,
    player: unit.player,
    position: { q: unit.position.q, r: unit.position.r },
    facing: unit.facing,
    health: unit.health,
    maxHealth: unit.maxHealth,
    isLoaded: row ? row.isLoaded === true : unit.isLoaded === true,
    isAlive: typeof unit.isAlive === 'function' ? unit.isAlive() : unit.health > 0,
    actionsRemaining: row
      ? gameState.normalizeActionBudget(row.actionsRemaining, 0)
      : 0,
    attackRange: unit.attackRange,
    attackPower: unit.attackPower,
    attackAngle: unit.attackAngle,
    movement: unit.movement,
    maxTerrainDifficulty: unit.maxTerrainDifficulty
  }
}

/**
 * Strategies (including LLM agents) receive the observation object directly,
 * so `objectives` must be a copy: handing out the engine's own normalized
 * objectives object would let a strategy rewrite match-termination rules
 * (e.g. `primary.deadlineTurns`). The object is plain and small, so a JSON
 * deep copy is sufficient and cheap.
 */
function cloneObjectives(objectives) {
  return objectives ? JSON.parse(JSON.stringify(objectives)) : null
}

function hexView(hex) {
  if (!hex) return null
  const terrain = hex.terrain && typeof hex.terrain === 'object'
    ? hex.terrain.id
    : hex.terrain
  return {
    q: hex.q,
    r: hex.r,
    terrain: terrain || null
  }
}

function baseCells(gameState, player) {
  const key = `${player}Base`
  const hexes = typeof gameState.getAllHexes === 'function'
    ? gameState.getAllHexes()
    : Array.from(gameState.hexes?.values?.() || [])
  return hexes
    .filter(hex => hex && hex[key] === true)
    .map(hexView)
}

/**
 * Build an observation for the perspective of `player`.
 *
 * @param {import('@/domain/engine/gameState.js').GameState} gameState
 * @param {string} player canonical player id, e.g. `'player1'`
 * @returns {{
 *   turnNumber: number,
 *   currentPlayer: string,
 *   perspective: string,
 *   gamePhase: string,
 *   diceResult: number|null,
 *   board: { width: number, height: number },
 *   ownUnits: object[],
 *   enemyUnits: object[],
 *   bases: { player1: object[], player2: object[] },
 *   objectives: object|null,
 *   outcome: object|null
 * }}
 */
export function getObservation(gameState, player) {
  if (!gameState || typeof gameState !== 'object') {
    throw new Error('getObservation: gameState is required')
  }
  if (typeof player !== 'string' || !player.trim()) {
    throw new Error('getObservation: player must be a non-empty string')
  }

  const allUnits = gameState.getAllUnits()
  const ownUnits = []
  const enemyUnits = []
  for (const unit of allUnits) {
    if (!unit) continue
    const view = unitView(gameState, unit)
    if (unit.player === player) ownUnits.push(view)
    else enemyUnits.push(view)
  }

  return {
    turnNumber: gameState.turnNumber,
    currentPlayer: gameState.currentPlayer,
    perspective: player,
    gamePhase: gameState.gamePhase,
    diceResult: gameState.getCurrentDiceResult(),
    turnsSinceLastDamage: Number.isInteger(gameState.turnsSinceLastDamage)
      ? gameState.turnsSinceLastDamage
      : 0,
    board: { width: gameState.width, height: gameState.height },
    ownUnits,
    enemyUnits,
    bases: {
      player1: baseCells(gameState, 'player1'),
      player2: baseCells(gameState, 'player2')
    },
    objectives: cloneObjectives(gameState.objectives),
    outcome: gameState.outcome || null
  }
}
