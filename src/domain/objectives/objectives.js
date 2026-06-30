/**
 * Shared level objective evaluation.
 *
 * This module is intentionally UI-free so the live Playground and the
 * headless simulation runner terminate games from the same rule set.
 */

export const PLAYER_IDS = Object.freeze(['player1', 'player2'])

export const OBJECTIVE_TYPES = Object.freeze({
  ELIMINATE_UNITS: 'eliminateUnits',
  OCCUPY_BASE: 'occupyBase',
  PROTECT_BASE: 'protectBase',
  SURVIVE_TURNS: 'surviveTurns'
})

export const OBJECTIVE_REASONS = Object.freeze({
  UNIT_WIPE: 'unitWipe',
  BASE_CAPTURED: 'baseCaptured',
  BASE_PROTECTED: 'baseProtected',
  SURVIVE_TURNS: 'surviveTurns',
  DEADLINE_MISSED: 'deadlineMissed',
  MAX_TURNS: 'maxTurns',
  // Turn cap reached without a terminal objective: resolve by material so the
  // game still ends with a real winner (or draw), never a hollow "ran out of
  // turns" verdict.
  MATERIAL_DECISION: 'materialDecision',
  PER_TURN_LIMIT: 'perTurnLimit',
  CONFLICTING_OBJECTIVES: 'conflictingObjectives'
})

export const OUTCOME_STATUS = Object.freeze({
  ACTIVE: 'active',
  ENDED: 'ended'
})

const OBJECTIVE_MODES = Object.freeze({
  PRIMARY_BLUE: 'primaryBlue',
  FIRST_SATISFIED: 'firstSatisfied'
})

const DEFAULT_MODE = OBJECTIVE_MODES.PRIMARY_BLUE

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function opponentOf(player) {
  if (player === 'player1') return 'player2'
  if (player === 'player2') return 'player1'
  return null
}

export function createActiveOutcome() {
  return Object.freeze({
    status: OUTCOME_STATUS.ACTIVE,
    winner: null,
    reason: null,
    conditionId: null,
    message: ''
  })
}

export function createEndedOutcome({
  winner = null,
  reason = null,
  conditionId = null,
  message = ''
} = {}) {
  return Object.freeze({
    status: OUTCOME_STATUS.ENDED,
    winner,
    reason,
    conditionId,
    message: typeof message === 'string' ? message : ''
  })
}

export function isTerminalOutcome(outcome) {
  return !!(outcome && outcome.status === OUTCOME_STATUS.ENDED)
}

export function normalizeOutcome(outcome) {
  if (!isPlainObject(outcome)) return createActiveOutcome()
  if (outcome.status !== OUTCOME_STATUS.ENDED) return createActiveOutcome()
  const winner = PLAYER_IDS.includes(outcome.winner) || outcome.winner === 'draw'
    ? outcome.winner
    : null
  return createEndedOutcome({
    winner,
    reason: typeof outcome.reason === 'string' ? outcome.reason : null,
    conditionId: typeof outcome.conditionId === 'string' ? outcome.conditionId : null,
    message: typeof outcome.message === 'string' ? outcome.message : ''
  })
}

function listHexes(source) {
  if (!source) return []
  if (typeof source.getAllHexes === 'function') {
    const hexes = source.getAllHexes()
    return Array.isArray(hexes) ? hexes : []
  }
  if (Array.isArray(source)) return source
  if (source.hexmap && Array.isArray(source.hexmap.map)) return source.hexmap.map
  if (Array.isArray(source.map)) return source.map
  return []
}

export function hasBaseForPlayer(source, player) {
  if (!PLAYER_IDS.includes(player)) return false
  const baseKey = `${player}Base`
  return listHexes(source).some(hex => hex && hex[baseKey] === true)
}

function defaultBluePrimaryObjective() {
  return {
    id: 'blue_primary',
    type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
    player: 'player1',
    targetPlayer: 'player2'
  }
}

export function buildDefaultObjectives() {
  return {
    mode: DEFAULT_MODE,
    primary: defaultBluePrimaryObjective()
  }
}

function configuredUnitEntries(source, player) {
  if (!source || !PLAYER_IDS.includes(player)) return []
  const units = source.units && source.units[player] && source.units[player].units
  return Array.isArray(units) ? units : []
}

function configuredUnitCount(entry) {
  if (!entry || typeof entry !== 'object') return 0
  if (entry.count == null) return 1
  const count = Number(entry.count)
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
}

export function hasConfiguredUnitsForPlayer(source, player) {
  return configuredUnitEntries(source, player)
    .some(entry => configuredUnitCount(entry) > 0)
}

export function buildDefaultObjectivesForLevelPackage(source = null) {
  if (
    !hasConfiguredUnitsForPlayer(source, 'player1') ||
    !hasConfiguredUnitsForPlayer(source, 'player2')
  ) {
    return null
  }
  return buildDefaultObjectives(source)
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

function normalizeDeadlineTurns(value) {
  return normalizePositiveInteger(value)
}

function withDeadline(normalized, raw) {
  const deadlineTurns = normalizeDeadlineTurns(raw && raw.deadlineTurns)
  if (deadlineTurns != null) normalized.deadlineTurns = deadlineTurns
  return normalized
}

function normalizePrimaryObjective(raw) {
  if (!isPlainObject(raw)) return null
  const type = typeof raw.type === 'string' ? raw.type.trim() : ''
  if (!Object.values(OBJECTIVE_TYPES).includes(type)) return null
  const player = PLAYER_IDS.includes(raw.player) ? raw.player : 'player1'
  if (player !== 'player1') return null

  const normalized = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : 'blue_primary',
    type,
    player
  }

  if (type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    const targetPlayer = PLAYER_IDS.includes(raw.targetPlayer) ? raw.targetPlayer : 'player2'
    if (targetPlayer === player) return null
    normalized.targetPlayer = targetPlayer
    return withDeadline(normalized, raw)
  }

  if (type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    const targetPlayer = PLAYER_IDS.includes(raw.targetPlayer) ? raw.targetPlayer : 'player2'
    if (targetPlayer === player) return null
    normalized.targetPlayer = targetPlayer
    normalized.basePlayer = PLAYER_IDS.includes(raw.basePlayer) ? raw.basePlayer : targetPlayer
    return withDeadline(normalized, raw)
  }

  if (type === OBJECTIVE_TYPES.PROTECT_BASE) {
    normalized.basePlayer = PLAYER_IDS.includes(raw.basePlayer) ? raw.basePlayer : player
    return withDeadline(normalized, raw)
  }

  if (type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    return withDeadline(normalized, raw)
  }

  return null
}

function normalizeCondition(raw, index) {
  if (!isPlainObject(raw)) return null
  const type = typeof raw.type === 'string' ? raw.type.trim() : ''
  if (!Object.values(OBJECTIVE_TYPES).includes(type)) return null

  const normalized = {
    id: typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `${type}_${index + 1}`,
    type
  }

  if (PLAYER_IDS.includes(raw.winner) || raw.winner === 'draw') {
    normalized.winner = raw.winner
  }

  if (type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    if (!PLAYER_IDS.includes(raw.targetPlayer)) return null
    normalized.targetPlayer = raw.targetPlayer
    normalized.winner = normalized.winner || opponentOf(raw.targetPlayer)
    return normalized
  }

  if (type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    if (!PLAYER_IDS.includes(raw.actorPlayer)) return null
    if (!PLAYER_IDS.includes(raw.targetPlayer)) return null
    normalized.actorPlayer = raw.actorPlayer
    normalized.targetPlayer = raw.targetPlayer
    normalized.winner = normalized.winner || raw.actorPlayer
    return normalized
  }

  if (type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    const player = PLAYER_IDS.includes(raw.player) ? raw.player : raw.winner
    if (!PLAYER_IDS.includes(player)) return null
    const turns = normalizePositiveInteger(raw.turns)
    if (turns == null) return null
    normalized.player = player
    normalized.turns = turns
    normalized.winner = normalized.winner || player
    return normalized
  }

  return null
}

function isBlueLegacyCondition(condition) {
  if (!condition) return false
  if (condition.winner === 'player1') return true
  if (condition.player === 'player1') return true
  if (condition.actorPlayer === 'player1') return true
  return false
}

function legacyConditionToPrimary(raw, index) {
  const condition = normalizeCondition(raw, index)
  if (!condition || !isBlueLegacyCondition(condition)) return null

  if (condition.type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    return normalizePrimaryObjective({
      id: condition.id,
      type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
      player: 'player1',
      targetPlayer: condition.targetPlayer,
      deadlineTurns: condition.deadlineTurns || condition.turns
    })
  }

  if (condition.type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    return normalizePrimaryObjective({
      id: condition.id,
      type: OBJECTIVE_TYPES.OCCUPY_BASE,
      player: 'player1',
      targetPlayer: condition.targetPlayer,
      basePlayer: condition.targetPlayer,
      deadlineTurns: condition.deadlineTurns || condition.turns
    })
  }

  if (condition.type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    return normalizePrimaryObjective({
      id: condition.id,
      type: OBJECTIVE_TYPES.SURVIVE_TURNS,
      player: 'player1',
      deadlineTurns: condition.turns
    })
  }

  return null
}

export function normalizeObjectives(objectives, source = null) {
  if (!isPlainObject(objectives)) return buildDefaultObjectives(source)

  if (objectives.mode === OBJECTIVE_MODES.PRIMARY_BLUE || isPlainObject(objectives.primary)) {
    const primary = normalizePrimaryObjective(objectives.primary)
    if (primary) {
      return {
        mode: OBJECTIVE_MODES.PRIMARY_BLUE,
        primary
      }
    }
    return buildDefaultObjectives(source)
  }

  const conditions = Array.isArray(objectives.conditions)
    ? objectives.conditions.map(legacyConditionToPrimary).filter(Boolean)
    : []
  if (conditions.length === 0) return buildDefaultObjectives(source)
  return {
    mode: OBJECTIVE_MODES.PRIMARY_BLUE,
    primary: conditions[0]
  }
}

function livingUnitsForPlayer(gameState, player) {
  if (!gameState || !PLAYER_IDS.includes(player)) return []
  if (typeof gameState.getActivePlayerUnits === 'function') {
    const units = gameState.getActivePlayerUnits(player)
    return Array.isArray(units) ? units : []
  }
  if (typeof gameState.getAllUnits !== 'function') return []
  return gameState.getAllUnits().filter(unit => {
    if (!unit || unit.player !== player) return false
    if (typeof unit.isAlive === 'function') return unit.isAlive()
    return unit.health > 0 && unit.isActive !== false
  })
}

function completedTurnCount(gameState) {
  return Array.isArray(gameState && gameState.history) ? gameState.history.length : 0
}

function baseHexesForPlayer(gameState, basePlayer) {
  if (!gameState || !PLAYER_IDS.includes(basePlayer)) return []
  const baseKey = `${basePlayer}Base`
  return listHexes(gameState).filter(hex => hex && hex[baseKey] === true)
}

function isBaseSetOccupiedBy(gameState, actorPlayer, basePlayer) {
  if (!gameState || !PLAYER_IDS.includes(actorPlayer) || !PLAYER_IDS.includes(basePlayer)) {
    return false
  }
  const baseHexes = baseHexesForPlayer(gameState, basePlayer)
  if (baseHexes.length === 0) return false
  const units = livingUnitsForPlayer(gameState, actorPlayer)
  const occupied = new Set()
  for (const unit of units) {
    const pos = unit && unit.position
    if (!pos || !Number.isInteger(pos.q) || !Number.isInteger(pos.r)) continue
    occupied.add(`${pos.q},${pos.r}`)
  }
  return baseHexes.every(hex => occupied.has(`${hex.q},${hex.r}`))
}

function wipeOutcome(gameState) {
  const p1Alive = livingUnitsForPlayer(gameState, 'player1').length
  const p2Alive = livingUnitsForPlayer(gameState, 'player2').length
  if (p1Alive > 0 && p2Alive > 0) return null
  if (p1Alive === 0 && p2Alive === 0) {
    return createEndedOutcome({
      winner: 'draw',
      reason: OBJECTIVE_REASONS.UNIT_WIPE,
      conditionId: null,
      message: 'Both sides have no active units.'
    })
  }
  if (p1Alive === 0) {
    return createEndedOutcome({
      winner: 'player2',
      reason: OBJECTIVE_REASONS.UNIT_WIPE,
      conditionId: null,
      message: 'player1 has no active units.'
    })
  }
  return createEndedOutcome({
    winner: 'player1',
    reason: OBJECTIVE_REASONS.UNIT_WIPE,
    conditionId: null,
    message: 'player2 has no active units.'
  })
}

function objectiveComplete(gameState, objective) {
  if (!objective || !objective.type) return null
  const tick = completedTurnCount(gameState)

  if (objective.type === OBJECTIVE_TYPES.ELIMINATE_UNITS) {
    if (livingUnitsForPlayer(gameState, objective.targetPlayer).length > 0) return null
    return createEndedOutcome({
      winner: objective.player,
      reason: OBJECTIVE_REASONS.UNIT_WIPE,
      conditionId: objective.id,
      message: `${objective.targetPlayer} has no active units.`
    })
  }

  if (objective.type === OBJECTIVE_TYPES.OCCUPY_BASE) {
    if (!isBaseSetOccupiedBy(gameState, objective.player, objective.basePlayer || objective.targetPlayer)) return null
    return createEndedOutcome({
      winner: objective.player,
      reason: OBJECTIVE_REASONS.BASE_CAPTURED,
      conditionId: objective.id,
      message: `${objective.player} occupies ${(objective.basePlayer || objective.targetPlayer)} base.`
    })
  }

  if (objective.type === OBJECTIVE_TYPES.PROTECT_BASE) {
    if (objective.deadlineTurns == null || tick < objective.deadlineTurns) return null
    const redCaptured = isBaseSetOccupiedBy(gameState, opponentOf(objective.player), objective.basePlayer || objective.player)
    if (redCaptured) return null
    return createEndedOutcome({
      winner: objective.player,
      reason: OBJECTIVE_REASONS.BASE_PROTECTED,
      conditionId: objective.id,
      message: `${objective.player} protected ${(objective.basePlayer || objective.player)} base for ${objective.deadlineTurns} completed turns.`
    })
  }

  if (objective.type === OBJECTIVE_TYPES.SURVIVE_TURNS) {
    if (objective.deadlineTurns == null || tick < objective.deadlineTurns) return null
    return createEndedOutcome({
      winner: objective.player,
      reason: OBJECTIVE_REASONS.SURVIVE_TURNS,
      conditionId: objective.id,
      message: `${objective.player} survived ${objective.deadlineTurns} completed turns.`
    })
  }

  return null
}

function objectiveFailed(gameState, objective) {
  if (!objective || !objective.type) return null
  const tick = completedTurnCount(gameState)
  const redPlayer = opponentOf(objective.player)

  if (objective.type === OBJECTIVE_TYPES.PROTECT_BASE) {
    const redCaptured = isBaseSetOccupiedBy(gameState, redPlayer, objective.basePlayer || objective.player)
    if (redCaptured) {
      return createEndedOutcome({
        winner: redPlayer,
        reason: OBJECTIVE_REASONS.BASE_CAPTURED,
        conditionId: objective.id,
        message: `${redPlayer} occupies ${(objective.basePlayer || objective.player)} base.`
      })
    }
  }

  if (objective.deadlineTurns == null || tick < objective.deadlineTurns) return null

  return createEndedOutcome({
    winner: redPlayer,
    reason: OBJECTIVE_REASONS.DEADLINE_MISSED,
    conditionId: objective.id,
    message: `${objective.player} missed the objective deadline at turn ${objective.deadlineTurns}.`
  })
}

export function evaluateObjectives(gameState, objectives = null, options = {}) {
  if (options && options.setupComplete === false) return createActiveOutcome()

  const wipe = wipeOutcome(gameState)
  if (wipe) return wipe

  if (!options || options.phase !== 'endTurn') return createActiveOutcome()

  const normalized = normalizeObjectives(objectives, gameState)
  const objective = normalized.primary
  const success = objectiveComplete(gameState, objective)
  if (success) return success
  const failure = objectiveFailed(gameState, objective)
  if (failure) return failure
  return createActiveOutcome()
}

export function formatOutcomeLabel(outcome) {
  if (!isTerminalOutcome(outcome)) return 'In progress'
  const winner = outcome.winner === 'draw'
    ? 'Draw'
    : outcome.winner
      ? `${outcome.winner} wins`
      : 'Game over'
  const reason = outcome.reason ? ` (${outcome.reason})` : ''
  return `${winner}${reason}`
}
