import { describe, expect, it } from 'vitest'
import { createHeuristicStrategy } from '../strategies/heuristicStrategy.js'
import { hexDistanceOffset, hexFacingToward } from '@/domain/engine/hexUtils.js'

function observation(overrides = {}) {
  return {
    perspective: 'player1',
    ownUnits: [
      {
        id: 'p1',
        player: 'player1',
        position: { q: 0, r: 0 },
        attackPower: 30,
        isLoaded: true
      }
    ],
    enemyUnits: [
      {
        id: 'p2',
        player: 'player2',
        position: { q: 2, r: 0 },
        health: 20
      }
    ],
    bases: {
      player1: [{ q: 0, r: 0 }],
      player2: [{ q: 2, r: 0 }]
    },
    objectives: {
      mode: 'primaryBlue',
      primary: {
        id: 'blue_primary',
        type: 'occupyBase',
        player: 'player1',
        targetPlayer: 'player2',
        basePlayer: 'player2'
      }
    },
    ...overrides
  }
}

describe('heuristicStrategy', () => {
  it('chooses a killing fire command when available', () => {
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const fire = { type: 'fire', unitId: 'p1', payload: { target: { q: 2, r: 0, unitId: 'p2' } } }
    const move = { type: 'move', unitId: 'p1', payload: { to: { q: 1, r: 0 } } }

    expect(strategy(observation(), [move, fire, { type: 'endTurn' }])).toBe(fire)
  })

  it('chooses a move onto the target base for occupyBase', () => {
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const baseMove = { type: 'move', unitId: 'p1', payload: { to: { q: 2, r: 0 } } }
    const otherMove = { type: 'move', unitId: 'p1', payload: { to: { q: 0, r: 1 } } }

    expect(strategy(observation(), [otherMove, baseMove, { type: 'endTurn' }])).toBe(baseMove)
  })

  it('chooses a turn that brings an enemy into the unit firing arc', () => {
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const obs = observation({
      ownUnits: [
        {
          id: 'p1',
          player: 'player1',
          position: { q: 0, r: 0 },
          facing: 4,
          attackRange: 3,
          attackAngle: 0,
          attackPower: 30,
          isLoaded: true
        }
      ],
      enemyUnits: [
        {
          id: 'p2',
          player: 'player2',
          position: { q: 2, r: 0 },
          health: 60
        }
      ]
    })
    const turnTowardEnemy = { type: 'turn', unitId: 'p1', payload: { facing: 1 } }
    const turnAway = { type: 'turn', unitId: 'p1', payload: { facing: 3 } }

    expect(strategy(obs, [turnAway, turnTowardEnemy, { type: 'endTurn' }])).toBe(turnTowardEnemy)
  })

  it('does not spend a turn when current facing is already better', () => {
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const obs = observation({
      ownUnits: [
        {
          id: 'p1',
          player: 'player1',
          position: { q: 0, r: 0 },
          facing: 1,
          attackRange: 3,
          attackAngle: 0,
          attackPower: 30,
          isLoaded: true
        }
      ],
      enemyUnits: [
        {
          id: 'p2',
          player: 'player2',
          position: { q: 2, r: 0 },
          health: 60
        }
      ]
    })
    const turnAway = { type: 'turn', unitId: 'p1', payload: { facing: 3 } }

    expect(strategy(obs, [turnAway, { type: 'endTurn' }])).toEqual({ type: 'endTurn' })
  })

  it('chooses an improving turn over endTurn even when the profile has a high pass weight', () => {
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'defensive' })
    const obs = observation({
      objectives: {
        mode: 'primaryBlue',
        primary: {
          id: 'blue_primary',
          type: 'eliminateUnits',
          player: 'player1',
          targetPlayer: 'player2'
        }
      },
      bases: { player1: [], player2: [] },
      ownUnits: [
        {
          id: 'p1',
          player: 'player1',
          position: { q: 0, r: 0 },
          facing: 4,
          attackRange: 0,
          attackAngle: 0,
          attackPower: 30,
          isLoaded: true
        }
      ],
      enemyUnits: [
        {
          id: 'p2',
          player: 'player2',
          position: { q: 2, r: 0 },
          health: 60
        }
      ]
    })
    const turnTowardEnemy = { type: 'turn', unitId: 'p1', payload: { facing: 1 } }

    expect(strategy(obs, [turnTowardEnemy, { type: 'endTurn' }])).toBe(turnTowardEnemy)
  })

  it('makes aggressive move toward enemies while defensive can prefer ending turn', () => {
    const aggressive = createHeuristicStrategy({ playerId: 'player1', profile: 'aggressive' })
    const defensive = createHeuristicStrategy({ playerId: 'player1', profile: 'defensive' })
    const obs = observation({
      objectives: {
        mode: 'primaryBlue',
        primary: {
          id: 'blue_primary',
          type: 'eliminateUnits',
          player: 'player1',
          targetPlayer: 'player2'
        }
      },
      bases: { player1: [], player2: [] }
    })
    const closeEnemy = { type: 'move', unitId: 'p1', payload: { to: { q: 1, r: 0 } } }
    const endTurn = { type: 'endTurn' }

    expect(aggressive(obs, [closeEnemy, endTurn])).toBe(closeEnemy)
    expect(defensive(obs, [closeEnemy, endTurn])).toBe(endTurn)
  })
})

describe('heuristicStrategy scoreTurn redesign', () => {
  const ORIGIN = { q: 0, r: 0 }

  function baseUnit(overrides = {}) {
    return {
      id: 'p1',
      player: 'player1',
      position: { q: 0, r: 0 },
      facing: 0,
      attackRange: 0,
      attackAngle: 0,
      attackPower: 30,
      isLoaded: true,
      ...overrides
    }
  }

  function obsWith(unit, enemyUnits) {
    return {
      perspective: 'player1',
      ownUnits: [unit],
      enemyUnits,
      bases: { player1: [], player2: [] },
      objectives: {
        mode: 'primaryBlue',
        primary: { id: 'x', type: 'eliminateUnits', player: 'player1', targetPlayer: 'player2' }
      }
    }
  }

  it('rotates toward the nearest enemy even when current facing already maxes alignment to a farther one (stall fix)', () => {
    const far = { id: 'far', player: 'player2', position: { q: 0, r: 3 }, health: 60 }
    const near = { id: 'near', player: 'player2', position: { q: 2, r: 0 }, health: 60 }
    const facingToFar = hexFacingToward(ORIGIN, far.position)
    const facingToNear = hexFacingToward(ORIGIN, near.position)
    const unit = baseUnit({ facing: facingToFar })
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const turnToNear = { type: 'turn', unitId: 'p1', payload: { facing: facingToNear } }
    expect(strategy(obsWith(unit, [far, near]), [turnToNear, { type: 'endTurn' }])).toBe(turnToNear)
  })

  it('prefers the turn aimed at the closer enemy over one aimed at the farther', () => {
    const far = { id: 'far', player: 'player2', position: { q: 0, r: 3 }, health: 60 }
    const near = { id: 'near', player: 'player2', position: { q: 2, r: 0 }, health: 60 }
    const facingToFar = hexFacingToward(ORIGIN, far.position)
    const facingToNear = hexFacingToward(ORIGIN, near.position)
    const unit = baseUnit({ facing: 3 })
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const aimNear = { type: 'turn', unitId: 'p1', payload: { facing: facingToNear } }
    const aimFar = { type: 'turn', unitId: 'p1', payload: { facing: facingToFar } }
    expect(strategy(obsWith(unit, [far, near]), [aimFar, aimNear, { type: 'endTurn' }])).toBe(aimNear)
  })

  it('does not churn: passes when no available turn improves heading to the nearest enemy', () => {
    const near = { id: 'near', player: 'player2', position: { q: 2, r: 0 }, health: 60 }
    const facingToNear = hexFacingToward(ORIGIN, near.position)
    const unit = baseUnit({ facing: facingToNear })
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const worse = { type: 'turn', unitId: 'p1', payload: { facing: (facingToNear + 2) % 6 } }
    expect(strategy(obsWith(unit, [near]), [worse, { type: 'endTurn' }])).toEqual({ type: 'endTurn' })
  })

  it('breaks equal-distance enemy ties by ascending id when picking the heading target', () => {
    // Two enemies equidistant from the unit but in different directions, listed
    // with the higher id ('b') BEFORE the lower id ('a') so array order can't
    // explain the result. Self-validate the equidistance precondition in-test.
    const enemyA = { id: 'a', player: 'player2', position: { q: 1, r: 1 }, health: 60 }
    const enemyB = { id: 'b', player: 'player2', position: { q: 0, r: 2 }, health: 60 }
    const distA = hexDistanceOffset(ORIGIN, enemyA.position)
    const distB = hexDistanceOffset(ORIGIN, enemyB.position)
    expect(distA).toBe(distB)

    const facingToA = hexFacingToward(ORIGIN, enemyA.position)
    const facingToB = hexFacingToward(ORIGIN, enemyB.position)
    expect(facingToA).not.toBe(facingToB)

    // Unit currently faces the HIGHER-id enemy 'b'; the only aiming turn points
    // at the LOWER-id enemy 'a'. scoreTurn scores against whichever enemy the id
    // tie-break selects. Correct (pick 'a') -> turn yields a positive gain and
    // beats endTurn. Wrong (pick 'b') -> facing already aligned -> endTurn wins.
    const unit = baseUnit({ facing: facingToB })
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const turnTowardA = { type: 'turn', unitId: 'p1', payload: { facing: facingToA } }
    expect(strategy(obsWith(unit, [enemyB, enemyA]), [turnTowardA, { type: 'endTurn' }])).toBe(turnTowardA)
  })

  it('a real fire outranks a maximally-aligning turn', () => {
    const near = { id: 'p2', player: 'player2', position: { q: 2, r: 0 }, health: 60 }
    const facingToNear = hexFacingToward(ORIGIN, near.position)
    const unit = baseUnit({ facing: 3, attackRange: 3 })
    const strategy = createHeuristicStrategy({ playerId: 'player1', profile: 'balanced' })
    const fire = { type: 'fire', unitId: 'p1', payload: { target: { q: 2, r: 0, unitId: 'p2' } } }
    const turnToNear = { type: 'turn', unitId: 'p1', payload: { facing: facingToNear } }
    expect(strategy(obsWith(unit, [near]), [turnToNear, fire, { type: 'endTurn' }])).toBe(fire)
  })
})

describe('heuristicStrategy unbounded-game anti-stall (Playground auto-play regression)', () => {
  // Reproduces the live bug: in the Playground "auto-play turn" feature no
  // maxTurns is threaded, so the strategy's horizon is Infinity. A balanced
  // bot (bias 0.5) advances only to the midpoint between its own units' centroid
  // and the nearest enemy, then holds. Two own units make the centroid lag
  // behind the lead unit, so the lead sits exactly on the midpoint and every
  // forward move is non-positive at bias 0.5 -> the bot freezes for the rest of
  // the game even though the dice allow movement. With anti-stall drift working
  // on an unbounded horizon, a long quiet streak must re-commit it to advance.
  function obs(idle) {
    return {
      perspective: 'player2',
      ownUnits: [
        { id: 'lead', player: 'player2', position: { q: 0, r: 3 }, facing: 0, attackRange: 0, attackPower: 30, isLoaded: true },
        { id: 'rear', player: 'player2', position: { q: 0, r: 7 }, facing: 0, attackRange: 0, attackPower: 30, isLoaded: true }
      ],
      enemyUnits: [{ id: 'e', player: 'player1', position: { q: 0, r: 0 }, health: 60 }],
      bases: { player1: [], player2: [] },
      objectives: {
        mode: 'primaryBlue',
        primary: { id: 'x', type: 'eliminateUnits', player: 'player2', targetPlayer: 'player1' }
      },
      turnsSinceLastDamage: idle
    }
  }
  // maxTurns omitted -> horizon is Infinity, exactly like the Playground path.
  const strategy = createHeuristicStrategy({ playerId: 'player2', profile: 'balanced' })
  const advance = { type: 'move', unitId: 'lead', payload: { to: { q: 0, r: 2 } } }
  const endTurn = { type: 'endTurn' }

  it('holds the midpoint when freshly engaged (no idle drift yet)', () => {
    expect(strategy(obs(0), [advance, endTurn])).toEqual(endTurn)
  })

  it('re-commits to advance after a long quiet streak instead of freezing forever', () => {
    expect(strategy(obs(50), [advance, endTurn])).toBe(advance)
  })
})

