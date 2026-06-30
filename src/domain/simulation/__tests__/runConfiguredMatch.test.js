import { describe, expect, it } from 'vitest'
import { loadLevelPackage } from '../../level/loadLevelPackage.js'
import { runConfiguredMatch, normalizeRunConfig } from '../runConfiguredMatch.js'
import { fetchFromPublic, makeMicroLevelPackage } from './fixtures.js'

function passableConfig(overrides = {}) {
  return {
    seed: 'configured',
    maxTurns: 3,
    players: {
      player1: { profile: 'balanced' },
      player2: { profile: 'defensive' }
    },
    ...overrides
  }
}

describe('runConfiguredMatch', () => {
  it('runs deterministic configured matches', () => {
    const pkg = makeMicroLevelPackage()
    const a = runConfiguredMatch({ levelPackage: pkg, runConfig: passableConfig() })
    const b = runConfiguredMatch({ levelPackage: pkg, runConfig: passableConfig() })

    expect(a.result).toEqual(b.result)
    expect(a.runConfig.players.player1.profile).toBe('balanced')
    expect(a.runConfig.players.player2.profile).toBe('defensive')
  })

  it('rejects unknown profiles', () => {
    const pkg = makeMicroLevelPackage()
    expect(() => runConfiguredMatch({
      levelPackage: pkg,
      runConfig: passableConfig({
        players: {
          player1: { profile: 'unknown' },
          player2: { profile: 'balanced' }
        }
      })
    })).toThrow(/Unknown strategy profile/)
  })

  it('raises maxTurns to objective deadline', () => {
    const pkg = makeMicroLevelPackage()
    pkg.objectives = {
      mode: 'primaryBlue',
      primary: {
        id: 'survive',
        type: 'surviveTurns',
        player: 'player1',
        deadlineTurns: 5
      }
    }

    const config = normalizeRunConfig(passableConfig({ maxTurns: 2 }), pkg)

    expect(config.maxTurns).toBe(5)
  })

  it('returns a compact simulation trace when requested', () => {
    const pkg = makeMicroLevelPackage()
    const output = runConfiguredMatch({
      levelPackage: pkg,
      runConfig: passableConfig({ trace: true })
    })

    expect(output.trace.kind).toBe('hwg/simulation-trace')
    expect(output.trace.schemaVersion).toBe(2)
    expect(output.trace.runConfig).toEqual(output.runConfig)
    expect(output.trace.result).toEqual(output.result)
    expect(output.trace.frames.length).toBeGreaterThan(0)
    const frame = output.trace.frames[0]
    expect(frame.event).toBe('initial')
    expect(frame.engine.history).toBeUndefined()
    expect(frame.engine.currentTurnActions.map(action => action.type)).toContain('startTurn')
    expect(frame.engine.currentTurnActions.map(action => action.type)).not.toContain('dice_roll')
    expect(frame.engine.initialState).toBeUndefined()
    expect(frame.engine.turntable).toBeUndefined()
    expect(frame.engine.objectives).toBeUndefined()
    expect(frame.engine.turnState).toBeDefined()
    expect(Object.values(frame.engine.turnState)[0]).toMatchObject({
      actionsRemaining: 4,
      isLoaded: true
    })
    expect(frame.engine.rng).toBeUndefined()
    // Static board geometry lives ONCE at the trace level (levelPackage), never
    // per frame. Each frame carries only dynamic state, so engine.hexes is gone.
    expect(frame.engine.hexes).toBeUndefined()
    expect(Array.isArray(output.trace.levelPackage.hexmap.map)).toBe(true)
    expect(output.trace.levelPackage.hexmap.map.length).toBeGreaterThan(0)
    expect(frame.engine.units[0][1]).toMatchObject({
      movement: 4,
      attackRange: 1,
      attackPower: 30,
      attackAngle: 1,
      maxTerrainDifficulty: 10,
      isLoaded: true
    })
    expect(frame.engine.units[0][1]).not.toHaveProperty('metadata')
    const diceFrame = output.trace.frames[1]
    expect(diceFrame.event).toBe('diceRoll')
    expect(diceFrame.diceResult).toBeGreaterThanOrEqual(1)
    expect(diceFrame.diceResult).toBeLessThanOrEqual(6)
    expect(diceFrame.engine.currentTurnActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'dice_roll',
          result: diceFrame.diceResult
        })
      ])
    )
  })

  it('keeps real level_000 playback traces below session storage scale', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(loaded.ok).toBe(true)

    const output = runConfiguredMatch({
      levelPackage: loaded.package,
      runConfig: {
        seed: 'level_000-trace-size',
        maxTurns: 100,
        trace: true
      }
    })

    const serialized = JSON.stringify(output.trace)

    expect(output.trace.frames.length).toBeGreaterThan(1)
    // Static board geometry (hexmap + terrain) is now stored ONCE at the trace
    // root instead of being duplicated into every frame (schemaVersion 2). That
    // dropped a real 100-turn level_000 trace from ~2.8MB to ~0.68MB. This 1MB
    // bound is a tight regression guard: if per-frame payloads start carrying
    // static or otherwise redundant data again, this test fails long before the
    // ~5MB sessionStorage quota becomes a concern.
    expect(serialized.length).toBeLessThan(1_000_000)
  })
})
