function compactUnit(unit) {
  if (!unit || typeof unit !== 'object') return unit
  return {
    id: unit.id,
    type: unit.type,
    name: unit.name,
    player: unit.player,
    position: unit.position,
    facing: unit.facing,
    health: unit.health,
    maxHealth: unit.maxHealth,
    movement: unit.movement,
    attackRange: unit.attackRange,
    attackPower: unit.attackPower,
    attackAngle: unit.attackAngle,
    losMode: unit.losMode,
    iconKey: unit.iconKey,
    maxTerrainDifficulty: unit.maxTerrainDifficulty,
    isLoaded: unit.isLoaded,
    isActive: unit.isActive
  }
}

function clonePlainTraceValue(value, fallback) {
  try {
    if (value === undefined || value === null) return fallback
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function compactEntryList(entries, compactValue) {
  return Array.isArray(entries)
    ? entries.map(([key, value]) => [key, compactValue(value)])
    : []
}

// Static board geometry (hexmap + terrain) is bundled ONCE at the trace root
// via `levelPackage`, so per-frame engine snapshots only carry DYNAMIC state.
// Dropping `hexes` from every frame is the whole point of schemaVersion 2 — it
// removes the immutable map that was previously duplicated across all frames.
export function compactSimulationEngine(engine) {
  if (!engine || typeof engine !== 'object') return {}
  return {
    width: engine.width,
    height: engine.height,
    currentPlayer: engine.currentPlayer,
    turnNumber: engine.turnNumber,
    gamePhase: engine.gamePhase,
    outcome: engine.outcome || null,
    units: compactEntryList(engine.units, compactUnit),
    turnState: clonePlainTraceValue(engine.turnState, {}),
    currentTurnActions: Array.isArray(engine.currentTurnActions)
      ? clonePlainTraceValue(engine.currentTurnActions, [])
      : []
  }
}

export function compactSimulationFrame(frame) {
  if (!frame || typeof frame !== 'object') return frame
  return {
    ...frame,
    engine: compactSimulationEngine(frame.engine)
  }
}

export function compactSimulationFrames(frames) {
  return Array.isArray(frames) ? frames.map(compactSimulationFrame) : []
}

export function createSimulationTrace({
  levelPackage,
  runConfig,
  result,
  frames,
  createdAt = new Date().toISOString()
} = {}) {
  return {
    kind: 'hwg/simulation-trace',
    schemaVersion: 2,
    createdAt,
    levelPackage,
    runConfig,
    result,
    frames: compactSimulationFrames(frames)
  }
}
