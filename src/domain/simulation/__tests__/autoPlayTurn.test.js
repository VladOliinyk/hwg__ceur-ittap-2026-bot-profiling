import { describe, it, expect } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../rng.js'
import { autoPlayTurn } from '../autoPlayTurn.js'
import { createStrategyFromConfig, STRATEGY_PROFILES } from '../strategyProfiles.js'
import { buildDefaultObjectivesForLevelPackage } from '../../objectives/objectives.js'
import { makeMicroLevelPackage } from './fixtures.js'

function buildLiveGame(seed = 'autoplay-seed-1') {
  const pkg = makeMicroLevelPackage()
  const gameState = new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    currentPlayer: 'player1',
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    objectivesData: buildDefaultObjectivesForLevelPackage(pkg),
    rng: createRng(seed)
  })
  return gameState
}

function balancedStrategy(playerId) {
  return createStrategyFromConfig(
    { profile: STRATEGY_PROFILES.BALANCED },
    { playerId }
  )
}

describe('autoPlayTurn', () => {
  it('rolls dice and spends the active side actions without ending the turn', () => {
    const gameState = buildLiveGame()
    const turnNumberBefore = gameState.turnNumber
    const playerBefore = gameState.currentPlayer

    const summary = autoPlayTurn({
      gameState,
      strategy: balancedStrategy('player1')
    })

    expect(summary.ok).toBe(true)
    expect(summary.player).toBe('player1')
    expect(summary.diceResult).toBeGreaterThanOrEqual(1)
    expect(summary.diceResult).toBeLessThanOrEqual(6)
    // It must NOT have ended the turn itself (that stays a human/UI action).
    expect(gameState.currentPlayer).toBe(playerBefore)
    expect(gameState.turnNumber).toBe(turnNumberBefore)
    // The doctrine should have done something real on an open plains strip.
    expect(summary.steps).toBeGreaterThan(0)
    expect(['endTurn', 'rejected', 'gameEnded', 'limit']).toContain(summary.ended)
  })

  it('is idempotent: a second run on the same turn applies no further actions', () => {
    const gameState = buildLiveGame()
    autoPlayTurn({ gameState, strategy: balancedStrategy('player1') })
    const actionsAfterFirst = gameState.currentTurnActions.length

    const second = autoPlayTurn({ gameState, strategy: balancedStrategy('player1') })
    expect(second.ok).toBe(true)
    // No new die roll, no new actions — the side already spent its budget.
    expect(gameState.currentTurnActions.length).toBe(actionsAfterFirst)
  })

  it('reports gameEnded and refuses to play a finished game', () => {
    const gameState = buildLiveGame()
    gameState.outcome = { status: 'ended', winner: 'player1' }

    const summary = autoPlayTurn({ gameState, strategy: balancedStrategy('player1') })
    expect(summary.ok).toBe(false)
    expect(summary.ended).toBe('gameEnded')
    expect(summary.steps).toBe(0)
  })

  it('guards invalid inputs', () => {
    expect(autoPlayTurn({ gameState: null, strategy: balancedStrategy('player1') }).ended).toBe('noGameState')
    const gameState = buildLiveGame()
    expect(autoPlayTurn({ gameState, strategy: null }).ended).toBe('rejected')
  })
})
