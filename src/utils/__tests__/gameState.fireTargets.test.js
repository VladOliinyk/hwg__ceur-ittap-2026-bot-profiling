import { describe, it, expect, beforeEach } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createUnit, createUnitFromDefinition } from '@/domain/engine/gameUnits.js'

const turntableAttackOnly = {
  Our_operations: [
    {
      title: 'ATTACK',
      moves: [
        {
          dice: [['fire', 'reload'], ['fire'], ['fire'], ['fire'], ['fire'], ['fire']]
        }
      ]
    }
  ],
  Enemy_operations: []
}

describe('GameState getValidFireTargets / cache', () => {
  let gs

  beforeEach(() => {
    gs = new GameState({ width: 8, height: 8 })
  })

  it('direct_fire: стіна зупиняє промінь, ворог за нею не у списку', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    const wall = gs.getHex(3, 2)
    wall.passable = false
    gs.addUnit(createUnit('infantry', { id: 'behind', player: 'player2' }), 4, 2)
    expect(gs.getValidFireTargets('atk')).toEqual([])
  })

  it('level terrain with passable false blocks placement and direct_fire LOS', () => {
    const mapData = {
      parameters: { width: 5, height: 1 },
      map: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 1, r: 0, terrain: 'plains' },
        { q: 2, r: 0, terrain: 'wall' },
        { q: 3, r: 0, terrain: 'plains' },
        { q: 4, r: 0, terrain: 'plains' }
      ]
    }
    const terrainTypes = [
      { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
      { id: 'wall', name: 'Wall', color: '#666666', terrainDifficulty: 0, passable: false }
    ]
    const levelState = new GameState({ mapData, terrainTypes })

    const wall = levelState.getHex(2, 0)
    expect(wall.passable).toBe(false)
    expect(wall.canPlaceUnit()).toBe(false)
    expect(() => levelState.addUnit(createUnit('infantry', { id: 'blocked', player: 'player1' }), 2, 0))
      .toThrow(/Cannot place unit/)

    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 4
    })
    levelState.addUnit(atk, 0, 0)
    expect(levelState.getReachableHexes('atk').map(h => `${h.q},${h.r}`)).toContain('1,0')
    expect(levelState.getReachableHexes('atk').map(h => `${h.q},${h.r}`)).not.toContain('2,0')

    levelState.addUnit(createUnit('infantry', { id: 'behind', player: 'player2' }), 3, 0)

    expect(levelState.getValidFireTargets('atk')).toEqual([])
    expect(levelState.getFireRangeHexes('atk')).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 }
    ])
  })

  it('level terrain without passable field stays passable (no name-based defaults; existing packages unchanged)', () => {
    // Includes terrain ids that the legacy name-based GameHex.getDefaultPassable()
    // would have treated as impassable ("water", "mountain"). With Option A the
    // engine derives passability ONLY from an explicit `passable: false` on the
    // terrain type, so a type without the field is passable regardless of name —
    // proving every existing level package is behaviourally unchanged.
    const mapData = {
      parameters: { width: 4, height: 1 },
      map: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 1, r: 0, terrain: 'water' },
        { q: 2, r: 0, terrain: 'mountain' },
        { q: 3, r: 0, terrain: 'forest' }
      ]
    }
    const terrainTypes = [
      { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
      { id: 'water', name: 'Water', color: '#2196F3', terrainDifficulty: 1 },
      { id: 'mountain', name: 'Mountain', color: '#795548', terrainDifficulty: 2 },
      { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
    ]
    const levelState = new GameState({ mapData, terrainTypes })

    for (const { q } of mapData.map.map(c => ({ q: c.q }))) {
      expect(levelState.getHex(q, 0).passable).toBe(true)
      expect(levelState.getHex(q, 0).canPlaceUnit()).toBe(true)
    }

    // A direct_fire ray crosses water/mountain unobstructed and reaches the enemy.
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 4
    })
    levelState.addUnit(atk, 0, 0)
    levelState.addUnit(createUnit('infantry', { id: 'enemy', player: 'player2' }), 3, 0)
    expect(levelState.getValidFireTargets('atk')).toEqual([
      { q: 3, r: 0, unitId: 'enemy' }
    ])
  })

  it('direct_fire: дружній на шляху — ворог за ним не видно', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'ally', player: 'player1' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'foe', player: 'player2' }), 4, 2)
    expect(gs.getValidFireTargets('atk')).toEqual([])
  })

  it('direct_fire: лише перший ворог на промені', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_first', player: 'player2' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_second', player: 'player2' }), 4, 2)
    expect(gs.getValidFireTargets('atk')).toEqual([{ q: 3, r: 2, unitId: 'e_first' }])
  })

  it('direct_fire: attackAngle 2 covers two hex directions on both sides of facing', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 2,
      attackRange: 1
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_dir5', player: 'player2' }), 1, 1)
    gs.addUnit(createUnit('infantry', { id: 'e_dir0', player: 'player2' }), 2, 1)
    gs.addUnit(createUnit('infantry', { id: 'e_dir1', player: 'player2' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_dir2', player: 'player2' }), 2, 3)
    gs.addUnit(createUnit('infantry', { id: 'e_dir3', player: 'player2' }), 1, 3)
    gs.addUnit(createUnit('infantry', { id: 'e_dir4', player: 'player2' }), 1, 2)

    const targets = gs.getValidFireTargets('atk')
    expect(targets).toHaveLength(5)
    expect(targets).toEqual(expect.arrayContaining([
      { q: 1, r: 1, unitId: 'e_dir5' },
      { q: 2, r: 1, unitId: 'e_dir0' },
      { q: 3, r: 2, unitId: 'e_dir1' },
      { q: 2, r: 3, unitId: 'e_dir2' },
      { q: 1, r: 3, unitId: 'e_dir3' }
    ]))
    expect(targets).not.toEqual(expect.arrayContaining([
      { q: 1, r: 2, unitId: 'e_dir4' }
    ]))
  })

  it('direct_fire: attackAngle 3 can target every adjacent direction', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 3,
      attackRange: 1
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_dir0', player: 'player2' }), 2, 1)
    gs.addUnit(createUnit('infantry', { id: 'e_dir1', player: 'player2' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_dir2', player: 'player2' }), 2, 3)
    gs.addUnit(createUnit('infantry', { id: 'e_dir3', player: 'player2' }), 1, 3)
    gs.addUnit(createUnit('infantry', { id: 'e_dir4', player: 'player2' }), 1, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_dir5', player: 'player2' }), 1, 1)

    const targets = gs.getValidFireTargets('atk')
    expect(targets).toHaveLength(6)
    expect(targets).toEqual(expect.arrayContaining([
      { q: 2, r: 1, unitId: 'e_dir0' },
      { q: 3, r: 2, unitId: 'e_dir1' },
      { q: 2, r: 3, unitId: 'e_dir2' },
      { q: 1, r: 3, unitId: 'e_dir3' },
      { q: 1, r: 2, unitId: 'e_dir4' },
      { q: 1, r: 1, unitId: 'e_dir5' }
    ]))
  })

  it('getFireRangeHexes: direct_fire returns traversed ray cells and stops at first enemy', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_first', player: 'player2' }), 4, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_second', player: 'player2' }), 5, 2)

    expect(gs.getFireRangeHexes('atk')).toEqual([
      { q: 3, r: 2 },
      { q: 4, r: 2 }
    ])
  })

  it('artillery: непрохідний терен не блокує; кілька ворогів на лінії', () => {
    const atk = createUnit('artillery', {
      id: 'arty',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.getHex(3, 2).passable = false
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 4, 2)
    gs.addUnit(createUnit('infantry', { id: 'e2', player: 'player2' }), 5, 2)
    expect(gs.getValidFireTargets('arty')).toEqual([
      { q: 4, r: 2, unitId: 'e1' },
      { q: 5, r: 2, unitId: 'e2' }
    ])
  })

  it('artillery: дружній на лінії не зупиняє промінь', () => {
    const atk = createUnit('artillery', {
      id: 'arty',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'ally', player: 'player1' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 4, 2)
    expect(gs.getValidFireTargets('arty')).toEqual([{ q: 4, r: 2, unitId: 'e1' }])
  })

  it('losMode artillery gives indirect fire to a custom type not named artillery', () => {
    const atk = createUnitFromDefinition({
      id: 'rocket_team',
      name: 'Rocket Team',
      health: 45,
      movement: 2,
      attackRange: 5,
      attackAngle: 0,
      attackPower: 80,
      losMode: 'artillery'
    }, {
      id: 'rocket',
      player: 'player1',
      facing: 1
    })
    gs.addUnit(atk, 2, 2)
    gs.getHex(3, 2).passable = false
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 4, 2)
    gs.addUnit(createUnit('infantry', { id: 'e2', player: 'player2' }), 5, 2)
    expect(gs.getValidFireTargets('rocket')).toEqual([
      { q: 4, r: 2, unitId: 'e1' },
      { q: 5, r: 2, unitId: 'e2' }
    ])
  })

  it('type artillery with losMode direct_fire behaves as direct fire', () => {
    const atk = createUnit('artillery', {
      id: 'direct_arty',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5,
      losMode: 'direct_fire'
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_first', player: 'player2' }), 3, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_second', player: 'player2' }), 4, 2)
    expect(gs.getValidFireTargets('direct_arty')).toEqual([
      { q: 3, r: 2, unitId: 'e_first' }
    ])
  })

  it('getValidFireTargetsCached повертає копії масиву (захист від мутації кешу)', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 2
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 3, 2)
    const a = gs.getValidFireTargetsCached('atk')
    const b = gs.getValidFireTargetsCached('atk')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('getFireRangeHexesCached returns copies of cached range cells', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 2
    })
    gs.addUnit(atk, 2, 2)
    const a = gs.getFireRangeHexesCached('atk')
    const b = gs.getFireRangeHexesCached('atk')
    a[0].q = 99

    expect(b).toEqual([
      { q: 3, r: 2 },
      { q: 4, r: 2 }
    ])
  })

  it('performAttack приймає рядкові q,r якщо ціль у LOS', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 2
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 3, 2)
    gs.turnState.atk = { actionsRemaining: 3, isLoaded: true }
    gs.currentPlayer = 'player1'
    gs.turntable = turntableAttackOnly
    gs.performAttack('atk', '3', '2', { diceResult: 1 })
    expect(gs.units.get('e1').health).toBeLessThan(100)
  })

  it('performAttack відхиляє ціль за стіною (direct_fire)', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.getHex(3, 2).passable = false
    gs.addUnit(createUnit('infantry', { id: 'foe', player: 'player2' }), 4, 2)
    gs.turnState.atk = { actionsRemaining: 3, isLoaded: true }
    gs.currentPlayer = 'player1'
    gs.turntable = turntableAttackOnly
    expect(() => gs.performAttack('atk', 4, 2, { diceResult: 1 })).toThrow(/line-of-fire/i)
  })

  it('після touchReachabilityState кеш атаки скидається', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 2
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e1', player: 'player2' }), 3, 2)
    const before = gs.getValidFireTargetsCached('atk')
    gs.touchReachabilityState()
    gs.removeUnit('e1')
    const after = gs.getValidFireTargetsCached('atk')
    expect(after).not.toBe(before)
    expect(after).toEqual([])
  })

  it('fail-fast: ворог з порожнім id на лінії вогню — getValidFireTargets кидає, не частковий список', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 5
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_bad', player: 'player2' }), 3, 2)
    const foeHex = gs.getHex(3, 2)
    foeHex.unit.id = ''

    let thrown
    try {
      gs.getValidFireTargets('atk')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeDefined()
    expect(String(thrown.message)).toMatch(/_collectFireRays: ray computation failed/)
    expect(thrown.cause && String(thrown.cause.message)).toMatch(/enemy unit must have a non-empty id/)
  })

  it('fail-fast: при throw getValidFireTargetsCached не оновлює кеш — після виправлення id обчислення проходить', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 3
    })
    gs.addUnit(atk, 2, 2)
    gs.addUnit(createUnit('infantry', { id: 'e_ok', player: 'player2' }), 3, 2)
    gs.touchReachabilityState()
    gs.getHex(3, 2).unit.id = ''

    expect(() => gs.getValidFireTargetsCached('atk')).toThrow()

    gs.getHex(3, 2).unit.id = 'e_ok'
    expect(gs.getValidFireTargetsCached('atk')).toEqual([{ q: 3, r: 2, unitId: 'e_ok' }])
  })
})
