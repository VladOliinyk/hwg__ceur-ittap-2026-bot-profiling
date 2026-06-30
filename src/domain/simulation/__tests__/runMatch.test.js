import { describe, expect, it } from 'vitest'
import { PER_TURN_COMMAND_LIMIT, runMatch } from '../runMatch.js'
import { randomStrategy } from '../strategies/randomStrategy.js'
import { loadLevelPackage } from '../../level/loadLevelPackage.js'
import { fetchFromPublic, makeMicroLevelPackage } from './fixtures.js'

function deterministicStrategies() {
  return {
    player1: randomStrategy(),
    player2: randomStrategy()
  }
}

function stripVariance(result) {
  return {
    winner: result.winner,
    turns: result.turns,
    seed: result.seed,
    reason: result.reason,
    metrics: result.metrics
  }
}

describe('runMatch — input validation', () => {
  it('throws when levelPackage is missing', () => {
    expect(() => runMatch({ strategies: deterministicStrategies(), seed: 1 })).toThrow()
  })

  it('throws when strategies are missing or wrong shape', () => {
    expect(() => runMatch({ levelPackage: makeMicroLevelPackage() })).toThrow()
    expect(() => runMatch({
      levelPackage: makeMicroLevelPackage(),
      strategies: { player1: 'not a function', player2: () => null }
    })).toThrow()
  })
})

describe('runMatch — determinism', () => {
  it('same seed produces identical results (winner, turns, metrics)', () => {
    const pkg = makeMicroLevelPackage()
    const a = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'level-smoke-1', maxTurns: 30 })
    const b = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'level-smoke-1', maxTurns: 30 })
    expect(stripVariance(a)).toEqual(stripVariance(b))
  })

  it('same numeric seed also produces identical results', () => {
    const pkg = makeMicroLevelPackage()
    const a = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 42, maxTurns: 30 })
    const b = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 42, maxTurns: 30 })
    expect(stripVariance(a)).toEqual(stripVariance(b))
  })

  it('different seeds can produce different histories', () => {
    const pkg = makeMicroLevelPackage()
    const a = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'A', maxTurns: 20, recordHistory: true })
    const b = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'B', maxTurns: 20, recordHistory: true })
    // We don't insist that *every* pair diverges, but for these two
    // distinct seeds the random strategies should not produce identical
    // event streams. If they do, the RNG isn't isolated enough.
    const sigA = JSON.stringify(a.history)
    const sigB = JSON.stringify(b.history)
    expect(sigA).not.toBe(sigB)
  })
})

describe('runMatch — trace frames', () => {
  it('does not add trace data when onFrame is absent', () => {
    const pkg = makeMicroLevelPackage()
    const result = runMatch({
      levelPackage: pkg,
      strategies: deterministicStrategies(),
      seed: 'no-frame',
      maxTurns: 2
    })

    expect(Object.prototype.hasOwnProperty.call(result, 'frames')).toBe(false)
  })

  it('emits ordered compact frames when onFrame is provided', () => {
    const pkg = makeMicroLevelPackage()
    const frames = []
    const result = runMatch({
      levelPackage: pkg,
      strategies: {
        player1: () => ({ type: 'endTurn' }),
        player2: () => ({ type: 'endTurn' })
      },
      seed: 'frames',
      maxTurns: 2,
      onFrame: frame => frames.push(frame)
    })

    expect(frames.length).toBeGreaterThan(1)
    frames.forEach((frame, index) => {
      expect(frame.index).toBe(index)
      expect(Number.isInteger(frame.tick)).toBe(true)
      expect(frame.engine).toBeDefined()
      expect(frame.engine.history).toBeUndefined()
      expect(Array.isArray(frame.engine.currentTurnActions)).toBe(true)
      expect(frame.engine.initialState).toBeUndefined()
    })
    expect(() => JSON.stringify(frames)).not.toThrow()
    expect(frames[0]).toMatchObject({
      event: 'initial',
      command: null,
      diceResult: null
    })
    expect(frames[1]).toMatchObject({
      event: 'diceRoll',
      actingPlayer: 'player1',
      command: null
    })
    expect(frames[1].diceResult).toBeGreaterThanOrEqual(1)
    expect(frames[1].diceResult).toBeLessThanOrEqual(6)
    expect(frames[1].engine.currentTurnActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'dice_roll',
          result: frames[1].diceResult
        })
      ])
    )
    const final = frames[frames.length - 1]
    expect(final.event).toBe('terminal')
    expect(final.outcome).toMatchObject({
      winner: result.winner,
      reason: result.reason
    })
    const endTurnFrames = frames.filter(frame =>
      frame.event !== 'terminal' && frame.command && frame.command.type === 'endTurn'
    )
    expect(endTurnFrames.length).toBeGreaterThan(0)
    endTurnFrames.forEach(frame => {
      expect(frame.diceResult).toBeGreaterThanOrEqual(1)
      expect(frame.diceResult).toBeLessThanOrEqual(6)
    })
    const diceRollFrames = frames.filter(frame => frame.event === 'diceRoll')
    expect(diceRollFrames.length).toBeGreaterThanOrEqual(2)
    expect(diceRollFrames.map(frame => frame.actingPlayer)).toEqual(['player1', 'player2'])
  })

  it('emits sanitized forcedEnd frames for illegal strategy commands', () => {
    const pkg = makeMicroLevelPackage()
    const frames = []
    const illegal = () => ({
      type: 'teleport',
      get poison() { throw new Error('poison getter') }
    })

    runMatch({
      levelPackage: pkg,
      strategies: { player1: illegal, player2: () => ({ type: 'endTurn' }) },
      seed: 'forced-frame',
      maxTurns: 2,
      onFrame: frame => frames.push(frame)
    })

    const forced = frames.find(frame => frame.forcedEnd === true && frame.ok === false)
    expect(forced).toBeTruthy()
    expect(forced.command).toMatchObject({ type: 'teleport' })
    expect(forced.diceResult).toBeGreaterThanOrEqual(1)
    expect(forced.diceResult).toBeLessThanOrEqual(6)
    expect(Object.prototype.hasOwnProperty.call(forced.command, 'poison')).toBe(false)
    expect(() => JSON.stringify(forced)).not.toThrow()
  })

  it('emits canonical action records and turn budgets in each frame snapshot', () => {
    const turnEveryDice = {
      Our_operations: [{ title: 'MANOEUVRE', moves: [{ dice: Array.from({ length: 6 }, () => ['turn']) }] }],
      Enemy_operations: [{ title: 'MANOEUVRE', moves: [{ dice: Array.from({ length: 6 }, () => ['turn']) }] }]
    }
    const pkg = makeMicroLevelPackage({ turntable: turnEveryDice })
    const frames = []
    runMatch({
      levelPackage: pkg,
      strategies: {
        player1: (_observation, legalCommands) =>
          legalCommands.find(command => command.type === 'turn') || { type: 'endTurn' },
        player2: () => ({ type: 'endTurn' })
      },
      seed: 'trace-actions',
      maxTurns: 1,
      onFrame: frame => frames.push(frame)
    })

    const turnFrame = frames.find(frame => frame.command && frame.command.type === 'turn')
    expect(turnFrame).toBeTruthy()
    const { unitId, facing } = turnFrame.command
    const unitEntry = turnFrame.engine.units.find(([id]) => id === unitId)
    expect(unitEntry).toBeTruthy()
    expect(unitEntry[1].facing).toBe(facing)
    expect(turnFrame.engine.turnState[unitId].actionsRemaining).toBeLessThan(unitEntry[1].movement)
    expect(turnFrame.engine.currentTurnActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'rotate',
          unitId,
          to: expect.objectContaining({ facing })
        })
      ])
    )
  })
})

describe('runMatch — termination', () => {
  it('resolves the turn cap as a material decision (not a hollow maxTurns) when no wipe occurs', () => {
    const pkg = makeMicroLevelPackage()
    // 5 turns is tiny — random strategies on a 5x3 map will not wipe
    // each other that fast (infantry has 1-range attacks and 60 HP vs 30 power).
    const r = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'cap', maxTurns: 5 })
    expect(r.turns).toBe(5)
    expect(r.reason).toBe('materialDecision')
  })

  it('terminates with reason="unitWipe" deterministically when one side dies', () => {
    // One-shot kill scenario: two adjacent infantry, HP=20, fire=30.
    // A deterministic "fire when possible" strategy wins on first shot
    // for the side that gets the first valid ATTACK dice.
    const adjacent = {
      id: 'wipe',
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        player1: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 2, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 2, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    // Aggressive strategy: fire first if possible, then reload, else endTurn.
    const fireFirst = () => (obs, legal /*, rng */) => {
      const fire = legal.find(c => c.type === 'fire')
      if (fire) return fire
      const reload = legal.find(c => c.type === 'reload')
      if (reload) return reload
      return { type: 'endTurn' }
    }
    const r = runMatch({
      levelPackage: adjacent,
      strategies: { player1: fireFirst(), player2: fireFirst() },
      seed: 'wipe-det',
      maxTurns: 20
    })
    expect(r.reason).toBe('unitWipe')
    expect(['player1', 'player2']).toContain(r.winner)
    const final = r.metrics.finalUnitCount
    expect(final[r.winner === 'player1' ? 'player2' : 'player1']).toBe(0)
    // killsByPlayer should reflect the actual kill.
    expect(r.metrics.killsByPlayer[r.winner]).toBeGreaterThanOrEqual(1)
  })

  it('terminates with reason="baseCaptured" when an objective base is occupied', () => {
    const moveOnlyTurntable = {
      Our_operations: [
        { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
        { title: 'ATTACK', moves: [{ dice: [['-'], ['-'], ['-'], ['-'], ['-'], ['-']] }] }
      ],
      Enemy_operations: [
        { title: 'MANOEUVRE', moves: [{ dice: [['move'], ['move'], ['move'], ['move'], ['move'], ['move']] }] },
        { title: 'ATTACK', moves: [{ dice: [['-'], ['-'], ['-'], ['-'], ['-'], ['-']] }] }
      ]
    }
    const pkg = {
      id: 'base_capture',
      hexmap: {
        parameters: { width: 3, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Base: true },
          { q: 2, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        player1: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 2, attackRange: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 60, movement: 2, attackRange: 1, attackPower: 30, count: 1 }] }
      },
      turntable: moveOnlyTurntable,
      objectives: {
        mode: 'primaryBlue',
        primary: {
          id: 'capture_p2_base',
          type: 'occupyBase',
          player: 'player1',
          targetPlayer: 'player2',
          basePlayer: 'player2'
        }
      }
    }
    const captureBase = () => (_obs, legal) => {
      return legal.find(c => c.type === 'move' && c.payload?.to?.q === 1 && c.payload?.to?.r === 0) ||
        { type: 'endTurn' }
    }
    const pass = () => () => ({ type: 'endTurn' })

    const r = runMatch({
      levelPackage: pkg,
      strategies: { player1: captureBase(), player2: pass() },
      seed: 'base',
      maxTurns: 10
    })

    expect(r.reason).toBe('baseCaptured')
    expect(r.winner).toBe('player1')
    expect(r.turns).toBe(1)
  })

  it('terminates with reason="surviveTurns" after the configured completed turns', () => {
    const pkg = makeMicroLevelPackage()
    pkg.objectives = {
      mode: 'primaryBlue',
      primary: {
        id: 'p1_hold_2',
        type: 'surviveTurns',
        player: 'player1',
        deadlineTurns: 2
      }
    }
    const pass = () => () => ({ type: 'endTurn' })

    const r = runMatch({
      levelPackage: pkg,
      strategies: { player1: pass(), player2: pass() },
      seed: 'survive',
      maxTurns: 10
    })

    expect(r.reason).toBe('surviveTurns')
    expect(r.winner).toBe('player1')
    expect(r.turns).toBe(2)
  })

  it('terminates immediately after a mid-turn killing command, no extra actions counted (round 2 fix)', () => {
    // Setup: 2x1 adjacent, HP=20 (one shot kills), AP=4, both
    // `move` and `fire` allowed on the same turn. A "fire-then-move"
    // strategy would otherwise issue a `move` after the kill, polluting
    // metrics/history. With the post-command wipe check, the match
    // ends after `fire`; no `move` is ever attempted.
    const pkg = {
      id: 'midwipe',
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        player1: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 4, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 4, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable: {
        // Every dice row admits both `move` (MANOEUVRE) and `fire` (ATTACK)
        // so a single turn can execute one of each.
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }

    const fireThenSpam = () => (obs, legal /*, rng */) => {
      const fire = legal.find(c => c.type === 'fire')
      if (fire) return fire
      // After fire, with the bug present, the strategy would issue
      // an arbitrary move command. With the fix, this code path is
      // never reached on the killing turn.
      const move = legal.find(c => c.type === 'move')
      if (move) return move
      return { type: 'endTurn' }
    }

    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: fireThenSpam(), player2: fireThenSpam() },
      seed: 'midwipe',
      maxTurns: 20
    })

    expect(result.reason).toBe('unitWipe')
    expect(result.winner).toBe('player1') // p1 moves first; first fire kills.
    expect(result.metrics.killsByPlayer.player1).toBe(1)
    // The post-command wipe check ends the match immediately after the
    // killing `fire`. No move/turn/reload should have been recorded.
    expect(result.metrics.actionsByType.fire).toBe(1)
    expect(result.metrics.actionsByType.move).toBe(0)
    expect(result.metrics.actionsByType.turn).toBe(0)
    expect(result.metrics.actionsByType.reload).toBe(0)
    // And no extra endTurn — the match ends mid-turn, before any pass.
    expect(result.metrics.actionsByType.endTurn).toBe(0)
    expect(result.turns).toBe(0)
  })

  it('wipe takes precedence over maxTurns when both trigger on the same endTurn', () => {
    // If a kill happens on the final allowed turn, the result must
    // report `unitWipe`, not be masked by the maxTurns cap.
    const adjacent = {
      id: 'precedence',
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      terrain: { terrainTypes: [{ id: 'plains', name: 'P', color: '#fff', terrainDifficulty: 0 }] },
      units: {
        player1: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 2, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] },
        player2: { units: [{ type: 'infantry', name: 'I', health: 20, movement: 2, attackRange: 1, attackAngle: 1, attackPower: 30, count: 1 }] }
      },
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    const fireFirst = () => (obs, legal /*, rng */) => {
      const fire = legal.find(c => c.type === 'fire')
      if (fire) return fire
      const reload = legal.find(c => c.type === 'reload')
      if (reload) return reload
      return { type: 'endTurn' }
    }
    // maxTurns=2 is enough for player1 to kill player2 in turn 1; the wipe
    // is detected when endTurn fires, *before* the maxTurns check.
    const r = runMatch({
      levelPackage: adjacent,
      strategies: { player1: fireFirst(), player2: fireFirst() },
      seed: 'precedence',
      maxTurns: 2
    })
    expect(r.reason).toBe('unitWipe')
  })

  // Shared setup for the per-turn command limit boundary tests: every dice
  // face allows `turn` — turn is legal on all 6 dice faces — a unit always
  // has 5 valid facings to spin to. Player1's AP budget (= movement) exceeds
  // the limit so the engine never gates the spin — only the runner's per-turn
  // step counter can stop it.
  function makeSpinLevelPackage() {
    const turnEveryDice = {
      Our_operations: [{ title: 'MANOEUVRE', moves: [{ dice: Array.from({ length: 6 }, () => ['turn']) }] }],
      Enemy_operations: [{ title: 'MANOEUVRE', moves: [{ dice: Array.from({ length: 6 }, () => ['turn']) }] }]
    }
    const spinUnit = movement => ({
      type: 'infantry', name: 'I', health: 60, movement, attackRange: 1, attackAngle: 1, attackPower: 30, maxTerrainDifficulty: 10, count: 1
    })
    return makeMicroLevelPackage({
      turntable: turnEveryDice,
      units: {
        player1: { units: [spinUnit(PER_TURN_COMMAND_LIMIT + 100)] },
        player2: { units: [spinUnit(4)] }
      }
    })
  }

  it('endTurn landing exactly on the last allowed per-turn step completes the turn — not perTurnLimit (off-by-one fix)', () => {
    // Pre-fix: the runner's post-loop check was `perTurnSteps >= limit`,
    // so a turn whose endTurn was applied on exactly step 500 — a fully
    // legitimate completion (turnsCompleted advanced, dice re-rolled) —
    // was misreported as a perTurnLimit bail-out. Post-fix the loop
    // tracks `turnEnded` explicitly and only bails when the budget ran
    // out *without* the turn completing.
    const pkg = makeSpinLevelPackage()
    let p1Calls = 0
    const spinThenEnd = () => (obs, legal) => {
      p1Calls += 1
      if (p1Calls < PER_TURN_COMMAND_LIMIT) {
        return legal.find(c => c.type === 'turn') || { type: 'endTurn' }
      }
      return { type: 'endTurn' }
    }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: spinThenEnd(), player2: () => ({ type: 'endTurn' }) },
      seed: 'limit-edge',
      maxTurns: 2
    })
    // Sanity: the scenario really exercised the boundary — endTurn was
    // the limit-th command of player1's single turn.
    expect(p1Calls).toBe(PER_TURN_COMMAND_LIMIT)
    expect(result.metrics.actionsByType.turn).toBe(PER_TURN_COMMAND_LIMIT - 1)
    // The turn completed normally; the match plays out to the cap.
    expect(result.reason).toBe('materialDecision')
    expect(result.turns).toBe(2)
    expect(result.metrics.actionsByType.endTurn).toBe(2)
  })

  it('a turn that exhausts the per-turn budget without endTurn still bails out with perTurnLimit', () => {
    // Control for the off-by-one fix: the safety valve must keep firing
    // when the strategy genuinely never ends its turn.
    const pkg = makeSpinLevelPackage()
    const spinForever = () => (obs, legal) =>
      legal.find(c => c.type === 'turn') || { type: 'endTurn' }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: spinForever(), player2: () => ({ type: 'endTurn' }) },
      seed: 'limit-spin',
      maxTurns: 2
    })
    expect(result.reason).toBe('perTurnLimit')
    // player2 ends immediately each turn; only player1 can hit the limit.
    // The spinning turn never completed.
    expect(result.turns).toBe(0)
  })
})

describe('runMatch — strategy contract', () => {
  it('rejects illegal commands and forces the offending player to end the turn', () => {
    const pkg = makeMicroLevelPackage()
    let invocations = 0
    const cheater = () => {
      invocations += 1
      // Always issues an unsupported command. Each turn this should be
      // caught once, the player should be force-ended, and the next turn
      // belongs to player2 (deterministic).
      return { type: 'teleport', unitId: 'p1_inf1', payload: {} }
    }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: cheater, player2: randomStrategy() },
      seed: 'cheater',
      maxTurns: 4
    })
    expect(invocations).toBeGreaterThan(0)
    // player1 attempted illegal commands → metric must reflect that.
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
    // player2 should not be marked as illegal-attempting.
    expect(result.metrics.illegalAttemptsByPlayer.player2).toBe(0)
  })

  it('a strategy that throws is treated as illegal and turn-ended', () => {
    const pkg = makeMicroLevelPackage()
    const thrower = () => { throw new Error('bad agent') }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: thrower, player2: randomStrategy() },
      seed: 'throw',
      maxTurns: 3
    })
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
    expect(result.turns).toBe(3)
  })

  it('whitespace-padded command type is treated as illegal — no metric/turn desync (round 3 fix)', () => {
    // Repro from review: strategy returns `{ type: ' endTurn ' }`.
    // With pre-round-3 trim semantics, `applyCommand` accepted it,
    // mutated `gameState.currentPlayer`, but `runMatch` checked raw
    // `command.type === 'endTurn'` and never advanced `turnsCompleted`
    // nor recorded a metric. Result was `reason: 'perTurnLimit'`,
    // `turns: 0`, `actionsByType.endTurn: 0`.
    //
    // Post-fix: `applyCommand` strictly rejects untrimmed types, so the
    // command becomes an illegal attempt → force-endTurn → metrics
    // recorded → turnsCompleted advances normally.
    const pkg = makeMicroLevelPackage()
    const whitespaceEndTurn = () => () => ({ type: ' endTurn ' })
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: whitespaceEndTurn(), player2: whitespaceEndTurn() },
      seed: 'whitespace',
      maxTurns: 4
    })
    expect(result.reason).toBe('materialDecision')
    expect(result.turns).toBe(4)
    // Each turn: illegal attempt by current player + forced endTurn.
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
    expect(result.metrics.illegalAttemptsByPlayer.player2).toBeGreaterThan(0)
    expect(result.metrics.actionsByType.endTurn).toBe(4)
  })

  it('strategy returning a Symbol-type command does not crash runMatch (round 4 fix)', () => {
    // Pre-round-4: applyCommand interpolated raw `command.type` into
    // its rejection message; for `Symbol('bad')` this threw TypeError,
    // and runMatch had no try/catch around the dispatcher call, so
    // the entire match propagated the throw.
    //
    // Post-fix: applyCommand coerces the type safely and runMatch
    // wraps the call in try/catch as defense-in-depth. The bad
    // command becomes an illegal attempt → force-endTurn → metric
    // recorded → next turn proceeds normally.
    const pkg = makeMicroLevelPackage()
    const symbolStrategy = () => () => ({ type: Symbol('bad') })
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: symbolStrategy(), player2: randomStrategy() },
        seed: 'symbol',
        maxTurns: 3
      })
    }).not.toThrow()
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
    // The match still progresses turn-by-turn rather than infinite-looping.
    expect(result.turns).toBe(3)
    expect(result.reason).toBe('materialDecision')
  })

  it('throwing strategy is recorded as ok:false strategyThrow event, not a silent endTurn (round 8 fix)', () => {
    // Pre-round-8: a throwing strategy was downgraded to
    // `{type:'endTurn'}` and flowed through the success path, so
    // `history` showed `{command:{type:'endTurn'}, ok:true}` — visually
    // indistinguishable from a deliberate pass — while metrics
    // counted an illegal attempt. Consumers couldn't tell the two apart.
    //
    // Post-fix: strategy throws synthesize an `applyResult.ok === false`
    // and flow through the same illegal-attempt branch as a rejected
    // command, so history records `ok:false`, `error:"strategy threw: ..."`,
    // `forcedEnd:true`, and `command:{type:'strategyThrow'}`.
    const pkg = makeMicroLevelPackage()
    const thrower = () => () => { throw new Error('bad agent') }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: thrower(), player2: randomStrategy() },
      seed: 'throw-history',
      maxTurns: 3,
      recordHistory: true
    })

    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
    expect(result.turns).toBe(3)

    // Every player1 history entry should be the strategyThrow shape —
    // never a plain ok:true endTurn coming from the thrower.
    const p1Events = (result.history || []).filter(e => e.player === 'player1')
    expect(p1Events.length).toBeGreaterThan(0)
    for (const ev of p1Events) {
      expect(ev.ok).toBe(false)
      expect(ev.forcedEnd).toBe(true)
      expect(ev.command.type).toBe('strategyThrow')
      expect(ev.error).toMatch(/strategy threw: bad agent/)
    }
  })

  it('throwing strategy with hostile error value is described safely (round 8 + 5 fix)', () => {
    // The error formatter must tolerate throwing `.message` getters
    // even on the strategy-throw path (the same describeThrown helper
    // already used for applyCommand throws).
    const pkg = makeMicroLevelPackage()
    const hostileThrow = () => () => {
      throw {
        get message() { throw new Error('message getter blew') },
        toString() { return 'hostile-throwable' }
      }
    }
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: hostileThrow(), player2: randomStrategy() },
        seed: 'hostile-throw-history',
        maxTurns: 2,
        recordHistory: true
      })
    }).not.toThrow()
    const p1Events = (result.history || []).filter(e => e.player === 'player1' && e.ok === false)
    expect(p1Events.length).toBeGreaterThan(0)
    for (const ev of p1Events) {
      // describeThrown falls back to safe stringification when
      // `.message` access throws, then yields the hostile object's
      // toString.
      expect(ev.error).toMatch(/strategy threw:/)
      expect(ev.error).toContain('hostile-throwable')
    }
  })

  it('null-returning strategy stays on the success path (regression for round 8)', () => {
    // Documented contract: a strategy returning null/undefined is a
    // legitimate "pass" and is treated as a normal endTurn — NOT an
    // illegal attempt. Round 8 must not accidentally promote that to
    // the illegal-attempt branch.
    const pkg = makeMicroLevelPackage()
    const passer = () => () => null
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: passer(), player2: passer() },
      seed: 'pass-history',
      maxTurns: 3,
      recordHistory: true
    })
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBe(0)
    expect(result.metrics.illegalAttemptsByPlayer.player2).toBe(0)
    // History entries are all ok:true endTurn events — no strategyThrow
    // marker leaked from the round-8 unified path.
    for (const ev of result.history || []) {
      expect(ev.ok).toBe(true)
      expect(ev.command.type).toBe('endTurn')
    }
  })

  it('illegal command in recorded history is JSON-safe even with throwing getters (round 7 fix)', () => {
    // Pre-round-7: the illegal branch pushed the raw strategy command
    // reference into history. `JSON.stringify(result.history)` then
    // invoked every enumerable getter, including a poison getter, and
    // threw. Post-fix: history stores a `summarizeCommand` snapshot
    // (frozen, whitelisted fields), so JSON serialization is safe.
    const pkg = makeMicroLevelPackage()
    const poisonIllegal = () => () => ({
      type: 'teleport', // unsupported → illegal path
      get poison() { throw new Error('poison getter') }
    })
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: poisonIllegal(), player2: randomStrategy() },
        seed: 'illegal-poison',
        maxTurns: 3,
        recordHistory: true
      })
    }).not.toThrow()
    expect(() => JSON.stringify(result.history)).not.toThrow()
    const illegalEvents = (result.history || []).filter(e => e.ok === false)
    expect(illegalEvents.length).toBeGreaterThan(0)
    for (const ev of illegalEvents) {
      // Sanitized snapshot has the type but not the poison field.
      expect(ev.command.type).toBe('teleport')
      expect(Object.prototype.hasOwnProperty.call(ev.command, 'poison')).toBe(false)
    }
  })

  it('illegal history is reference-stable when strategy mutates the same command (round 7 fix)', () => {
    // Pre-round-7: storing the raw strategy command reference meant a
    // later mutation by the strategy (or its owner) retroactively
    // changed history events that had already been recorded. Post-fix:
    // each illegal entry is a frozen snapshot owning no reference to
    // the strategy's object.
    const pkg = makeMicroLevelPackage()
    const sharedCommand = { type: 'teleport', unitId: 'shared', counter: 1 }
    const mutator = () => () => {
      sharedCommand.counter += 1
      return sharedCommand
    }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: mutator(), player2: randomStrategy() },
      seed: 'mutate-shared',
      maxTurns: 3,
      recordHistory: true
    })
    // Strategy mutates the shared object AFTER the match has finished.
    sharedCommand.type = 'tampered'
    sharedCommand.counter = 999

    const illegalEvents = (result.history || []).filter(e => e.ok === false)
    expect(illegalEvents.length).toBeGreaterThan(0)
    for (const ev of illegalEvents) {
      // The snapshot is a distinct object — no aliasing.
      expect(ev.command).not.toBe(sharedCommand)
      // Type captured at record time, not the later mutation.
      expect(ev.command.type).toBe('teleport')
      // Snapshot is frozen, cannot be tampered with.
      expect(Object.isFrozen(ev.command)).toBe(true)
      // `counter` was never part of the whitelist.
      expect(ev.command.counter).toBeUndefined()
    }
  })

  it('legal command with an extra throwing getter survives — runner uses trusted result (round 6 fix)', () => {
    // Pre-round-6: after a successful command, runMatch did
    //   `appliedRecord = { ...command, type: appliedType }`
    // which spread *every* enumerable property of the strategy-supplied
    // command. A legal command with an extra throwing getter survived
    // applyCommand (its `type` is canonical), but the spread then read
    // the poisoned getter and crashed the runner OUTSIDE the
    // applyCommand try/catch — engine had already mutated (endTurn,
    // player switched) but the result was never finalized.
    //
    // Post-fix: appliedRecord is the canonical `applyResult.result`,
    // never the raw strategy object, so poison getters are never read.
    const pkg = makeMicroLevelPackage()
    const poisonEndTurn = () => () => ({
      type: 'endTurn',
      get poison() { throw new Error('poison getter') }
    })
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: poisonEndTurn(), player2: poisonEndTurn() },
        seed: 'poison-endTurn',
        maxTurns: 4,
        recordHistory: true
      })
    }).not.toThrow()
    // Match finalized normally — turns ran, metrics recorded, no
    // illegal-attempt counter (the command itself was legal).
    expect(result.reason).toBe('materialDecision')
    expect(result.turns).toBe(4)
    expect(result.metrics.actionsByType.endTurn).toBe(4)
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBe(0)
    expect(result.metrics.illegalAttemptsByPlayer.player2).toBe(0)
    // History records contain only the canonical fields from
    // applyResult.result; the poisoned `poison` getter on the raw
    // strategy command was never copied in. Reading the history must
    // not trigger the getter.
    for (const ev of result.history || []) {
      expect(ev.command).toBeDefined()
      expect(ev.command.type).toBe('endTurn')
      // `poison` must not be a present property of the recorded command.
      expect(Object.prototype.hasOwnProperty.call(ev.command, 'poison')).toBe(false)
    }
  })

  it('legal fire command with extra throwing getter is recorded canonically (round 6 fix)', () => {
    // Same defense applied to a non-endTurn command: the recorded
    // history reflects applyResult.result (canonical) only, even when
    // the strategy attaches extra throwing getters.
    const pkg = makeMicroLevelPackage()
    const adjacent = {
      ...pkg,
      hexmap: {
        parameters: { width: 2, height: 1 },
        map: [
          { q: 0, r: 0, terrain: 'plains', player1Spawn: true },
          { q: 1, r: 0, terrain: 'plains', player2Spawn: true }
        ]
      },
      turntable: {
        Our_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ],
        Enemy_operations: [
          { title: 'MANOEUVRE', moves: [{ dice: [['move'],['move'],['move'],['move'],['move'],['move']] }] },
          { title: 'ATTACK', moves: [{ dice: [['fire'],['fire'],['fire'],['fire'],['fire'],['fire']] }] }
        ]
      }
    }
    const poisonFire = () => (obs, legal) => {
      const fire = legal.find(c => c.type === 'fire')
      if (!fire) return { type: 'endTurn' }
      // Hand back a fire command with the canonical payload but an
      // extra throwing getter alongside it.
      return {
        type: fire.type,
        unitId: fire.unitId,
        payload: fire.payload,
        get poison() { throw new Error('poison getter') }
      }
    }
    let result
    expect(() => {
      result = runMatch({
        levelPackage: adjacent,
        strategies: { player1: poisonFire(), player2: poisonFire() },
        seed: 'poison-fire',
        maxTurns: 6,
        recordHistory: true
      })
    }).not.toThrow()
    // Even with poisoned commands, the match plays out and metrics
    // record canonical action types.
    expect(['unitWipe', 'materialDecision']).toContain(result.reason)
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBe(0)
    for (const ev of result.history || []) {
      expect(Object.prototype.hasOwnProperty.call(ev.command, 'poison')).toBe(false)
    }
  })

  it('caught throwable with a throwing .message getter does not re-crash runMatch (round 5 fix)', () => {
    // Reviewer's repro: a strategy supplies a command whose payload
    // getter throws a hostile value whose `.message` accessor *also*
    // throws. Pre-round-5 the catch block read `err.message` directly
    // and the formatter itself crashed → match propagated. Post-fix the
    // diagnostic goes through `describeThrown`, which tolerates both
    // throwing message getters and throwing toString.
    const pkg = makeMicroLevelPackage()
    const hostileStrategy = () => () => ({
      type: 'fire',
      unitId: 'whatever',
      payload: {
        get target() {
          // Throw a value where the very act of reading `.message`
          // re-throws, exercising the catch-block formatter.
          throw {
            get message() { throw new Error('message getter blew') },
            toString() { return 'hostile-throwable' }
          }
        }
      }
    })
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: hostileStrategy(), player2: randomStrategy() },
        seed: 'hostile-message',
        maxTurns: 2
      })
    }).not.toThrow()
    // Match completed; the illegal attempt was counted, the runner
    // didn't propagate the throw.
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBeGreaterThan(0)
  })

  it('applyCommand throwing for any reason is caught and treated as illegal (defense-in-depth)', () => {
    // Even if a future code path throws inside applyCommand for an
    // unrelated reason, the runner must not propagate the throw.
    // Simulate by handing back a command whose `payload.target` has a
    // throwing getter (only reached via a `fire` command). The strategy
    // never produces this in normal flow; the test demonstrates the
    // guarantee that runMatch contains the failure.
    const pkg = makeMicroLevelPackage()
    const evilTargetStrategy = () => (obs, legal) => {
      // First, send a normal command to make sure runMatch advances;
      // then emit the booby-trapped command.
      const move = legal.find(c => c.type === 'move')
      if (move) return move
      return {
        type: 'fire',
        unitId: 'whatever',
        payload: { get target() { throw new Error('boom') } }
      }
    }
    let result
    expect(() => {
      result = runMatch({
        levelPackage: pkg,
        strategies: { player1: evilTargetStrategy(), player2: randomStrategy() },
        seed: 'evil',
        maxTurns: 2
      })
    }).not.toThrow()
    // Match completed; nothing crashed the runner.
    expect(['materialDecision', 'unitWipe']).toContain(result.reason)
  })

  it('runMatch records metrics using the applied (canonical) type, not the raw input shape', () => {
    // Even when the strategy returns a perfectly-canonical command,
    // metrics must come from `applyResult.result.type`. Strategy
    // returns commands with a stray `metaTag` to demonstrate that
    // metrics record the `type` consistently and don't accidentally
    // pick up extra fields.
    const pkg = makeMicroLevelPackage()
    const sneaky = () => (obs, legal) => {
      const move = legal.find(c => c.type === 'move')
      if (move) return { ...move, metaTag: 'observability-noise' }
      return { type: 'endTurn' }
    }
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: sneaky(), player2: sneaky() },
      seed: 'sneaky',
      maxTurns: 3,
      recordHistory: true
    })
    // Every recorded event's command.type should be one of the
    // canonical action-type strings.
    const allowed = new Set(['move','reverse','turn','fire','reload','endTurn'])
    for (const ev of result.history || []) {
      expect(allowed.has(ev.command && ev.command.type)).toBe(true)
    }
  })

  it('a strategy returning null is treated as endTurn (allowed)', () => {
    const pkg = makeMicroLevelPackage()
    const passer = () => null
    const result = runMatch({
      levelPackage: pkg,
      strategies: { player1: passer, player2: passer },
      seed: 'pass',
      maxTurns: 4
    })
    // Null is not illegal; passers just end their turn each time.
    expect(result.metrics.illegalAttemptsByPlayer.player1).toBe(0)
    expect(result.metrics.illegalAttemptsByPlayer.player2).toBe(0)
    expect(result.turns).toBe(4)
  })
})

describe('runMatch — metrics shape', () => {
  it('returns a frozen metrics object with stable keys', () => {
    const pkg = makeMicroLevelPackage()
    const r = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'metrics', maxTurns: 5 })
    expect(Object.isFrozen(r.metrics)).toBe(true)
    expect(r.metrics.actionsByType).toBeDefined()
    expect(r.metrics.actionsByPlayerType).toBeDefined()
    expect(r.metrics.damageByPlayer).toBeDefined()
    expect(r.metrics.killsByPlayer).toBeDefined()
    expect(r.metrics.illegalAttemptsByPlayer).toBeDefined()
    expect(r.metrics.initialUnitCount).toBeDefined()
    expect(r.metrics.finalUnitCount).toBeDefined()
    for (const k of ['move', 'reverse', 'turn', 'fire', 'reload', 'endTurn']) {
      expect(typeof r.metrics.actionsByType[k]).toBe('number')
      expect(typeof r.metrics.actionsByPlayerType.player1[k]).toBe('number')
      expect(typeof r.metrics.actionsByPlayerType.player2[k]).toBe('number')
    }
  })

  it('endTurn counts ≥ turns completed (one endTurn per completed turn)', () => {
    const pkg = makeMicroLevelPackage()
    const r = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'endturn', maxTurns: 8 })
    expect(r.metrics.actionsByType.endTurn).toBeGreaterThanOrEqual(r.turns)
  })

  it('initialUnitCount matches the package roster', () => {
    const pkg = makeMicroLevelPackage()
    const r = runMatch({ levelPackage: pkg, strategies: deterministicStrategies(), seed: 'init', maxTurns: 1 })
    expect(r.metrics.initialUnitCount.player1).toBe(1)
    expect(r.metrics.initialUnitCount.player2).toBe(1)
  })
})

describe('runMatch — integration with real level_000', () => {
  it('runs a deterministic headless match without Vue/DOM', async () => {
    const loaded = await loadLevelPackage('level_000', { fetch: fetchFromPublic })
    expect(loaded.ok).toBe(true)
    const a = runMatch({
      levelPackage: loaded.package,
      strategies: deterministicStrategies(),
      seed: 'level_000-headless-001',
      maxTurns: 20
    })
    const b = runMatch({
      levelPackage: loaded.package,
      strategies: deterministicStrategies(),
      seed: 'level_000-headless-001',
      maxTurns: 20
    })
    expect(stripVariance(a)).toEqual(stripVariance(b))
    expect(['player1', 'player2', 'draw']).toContain(a.winner)
    // Sanity: the run did *something*; at least one action besides endTurn.
    const totalNonEnd = (
      a.metrics.actionsByType.move +
      a.metrics.actionsByType.reverse +
      a.metrics.actionsByType.turn +
      a.metrics.actionsByType.fire +
      a.metrics.actionsByType.reload
    )
    expect(totalNonEnd).toBeGreaterThan(0)
  })
})
