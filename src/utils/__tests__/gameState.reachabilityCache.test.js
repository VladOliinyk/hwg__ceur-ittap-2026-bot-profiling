import { describe, it, expect, beforeEach } from 'vitest'
import { GameState } from '@/domain/engine/gameState.js'
import { createUnit } from '@/domain/engine/gameUnits.js'
import { getHexDirections, normalizeHexFacing } from '@/domain/engine/hexUtils.js'
import { applyCommand } from '../../domain/simulation/applyCommand.js'
import { runMatch } from '../../domain/simulation/runMatch.js'
import { randomStrategy } from '../../domain/simulation/strategies/randomStrategy.js'
import { createRng } from '../../domain/simulation/rng.js'
import { makeMicroLevelPackage } from '../../domain/simulation/__tests__/fixtures.js'

/** Гекс попереду юніта (фіксований facing), тим самим шляхом, що й legalCommands. */
function hexAhead(unit) {
  const dirs = getHexDirections(unit.position.r)
  const delta = dirs[normalizeHexFacing(unit.facing)]
  return { q: unit.position.q + delta.q, r: unit.position.r + delta.r }
}

function hexBehind(unit) {
  const dirs = getHexDirections(unit.position.r)
  const delta = dirs[normalizeHexFacing(unit.facing + 3)]
  return { q: unit.position.q + delta.q, r: unit.position.r + delta.r }
}

describe('GameState getDirectionalReachableCosts — кеш за reachabilityVersion (#64)', () => {
  let gs

  beforeEach(() => {
    gs = new GameState({ width: 5, height: 3 })
    const u = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      facing: 1,
      movement: 4,
      maxTerrainDifficulty: 10
    })
    gs.addUnit(u, 2, 1)
    gs.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    gs.touchReachabilityState()
  })

  it('повторний виклик — той самий Map-інстанс (cache hit), вміст коректний', () => {
    const unit = gs.units.get('u1')
    const aheadKey = gs.getHexKey(hexAhead(unit).q, hexAhead(unit).r)
    const behindKey = gs.getHexKey(hexBehind(unit).q, hexBehind(unit).r)

    const first = gs.getDirectionalReachableCosts('u1', 'forward')
    // Власний гекс завжди у мапі з вартістю 0; крок по plains коштує 1.
    expect(first.get('2,1')).toBe(0)
    expect(first.get(aheadKey)).toBe(1)
    // forward-режим не містить гекса позаду (він досяжний лише реверсом).
    expect(first.has(behindKey)).toBe(false)

    const second = gs.getDirectionalReachableCosts('u1', 'forward')
    expect(second).toBe(first)

    // Інший motionMode — окремий запис кешу з дзеркальним вмістом.
    const reverse = gs.getDirectionalReachableCosts('u1', 'reverse')
    expect(reverse).not.toBe(first)
    expect(reverse.get('2,1')).toBe(0)
    expect(reverse.get(behindKey)).toBe(1)
    expect(reverse.has(aheadKey)).toBe(false)
    expect(gs.getDirectionalReachableCosts('u1', 'reverse')).toBe(reverse)
  })

  it('touchReachabilityState інвалідовує: нова інстанція, той самий вміст на незмінній дошці', () => {
    const before = gs.getDirectionalReachableCosts('u1', 'forward')
    gs.touchReachabilityState()
    const after = gs.getDirectionalReachableCosts('u1', 'forward')
    expect(after).not.toBe(before)
    expect(after).toEqual(before)
  })

  it('відсутній юніт — порожня мапа, без записів у кеші', () => {
    const a = gs.getDirectionalReachableCosts('ghost', 'forward')
    const b = gs.getDirectionalReachableCosts('ghost', 'forward')
    expect(a.size).toBe(0)
    expect(b).not.toBe(a)
  })

  it('invalidateReachabilityCache скидає attack-range, directional і snapshot кеші (#38)', () => {
    const atk = createUnit('infantry', {
      id: 'atk',
      player: 'player1',
      facing: 1,
      attackAngle: 0,
      attackRange: 3,
      movement: 3,
      maxTerrainDifficulty: 10
    })
    gs.addUnit(atk, 2, 0)

    const rangeBefore = gs.getFireRangeHexesCached('atk')
    expect(rangeBefore.length).toBeGreaterThan(1)
    const dirBefore = gs.getDirectionalReachableCosts('atk', 'forward')
    expect(dirBefore.has('3,0')).toBe(true)

    // Пряма мутація дошки БЕЗ touchReachabilityState (версія не змінюється):
    // якщо invalidateReachabilityCache не чистить відповідний кеш, наступне
    // читання поверне застарілий результат.
    gs.getHex(3, 0).passable = false
    gs.invalidateReachabilityCache()

    // #38: attack-range перераховано — промінь обривається на стіні.
    const rangeAfter = gs.getFireRangeHexesCached('atk')
    expect(rangeAfter.length).toBeLessThan(rangeBefore.length)

    // #64: directional-кеш І снапшот дошки перераховані — гекс зі стіною
    // більше не досяжний (якби снапшот лишився кешованим, terrainByHex
    // досі мав би passable: true).
    const dirAfter = gs.getDirectionalReachableCosts('atk', 'forward')
    expect(dirAfter.has('3,0')).toBe(false)
  })
})

describe('GameState getManeuverReachableCosts — rotation-inclusive highlight set', () => {
  let gs

  beforeEach(() => {
    gs = new GameState({ width: 5, height: 3 })
    const u = createUnit('infantry', {
      id: 'u1',
      player: 'player1',
      facing: 1,
      movement: 4,
      maxTerrainDifficulty: 10
    })
    gs.addUnit(u, 2, 1)
    gs.turnState.u1 = { actionsRemaining: 2, isLoaded: true }
    gs.touchReachabilityState()
  })

  it('повертає надмножину directional both-набору (turn-досяжні гекси включені)', () => {
    const both = gs.getDirectionalReachableCosts('u1', 'both')
    const maneuver = gs.getManeuverReachableCosts('u1')

    // Кожен гекс із both-набору присутній у maneuver із не більшою вартістю.
    for (const [key, cost] of both) {
      expect(maneuver.has(key)).toBe(true)
      expect(maneuver.get(key)).toBeLessThanOrEqual(cost)
    }
    // Maneuver додає принаймні один гекс поза forward/backward віссю, який
    // both-набір не містить (turn(1)+move(1) у межах бюджету 2).
    const extra = [...maneuver.keys()].filter(key => !both.has(key))
    expect(extra.length).toBeGreaterThan(0)
  })

  it('кешується під ключем "unitId:maneuver" (cache hit — той самий інстанс)', () => {
    const first = gs.getManeuverReachableCosts('u1')
    const second = gs.getManeuverReachableCosts('u1')
    expect(second).toBe(first)
    // Окремий запис від directional both — не той самий інстанс.
    expect(gs.getDirectionalReachableCosts('u1', 'both')).not.toBe(first)
  })

  it('інвалідовується на bump reachabilityVersion (нова інстанція, той самий вміст)', () => {
    const before = gs.getManeuverReachableCosts('u1')
    gs.touchReachabilityState()
    const after = gs.getManeuverReachableCosts('u1')
    expect(after).not.toBe(before)
    expect(after).toEqual(before)
  })
})

describe('getDirectionalReachableCosts — інвалідація після руху (повний шлях симуляції)', () => {
  function buildMoveState() {
    const pkg = makeMicroLevelPackage()
    const state = new GameState({
      width: pkg.hexmap.parameters.width,
      height: pkg.hexmap.parameters.height,
      currentPlayer: 'player1',
      mapData: pkg.hexmap,
      terrainTypes: pkg.terrain.terrainTypes,
      unitsData: pkg.units,
      turntableData: pkg.turntable,
      rng: createRng('dir-cache')
    })
    const p1 = state.getActivePlayerUnits('player1')[0]
    p1.facing = 1 // схід: уперед по рядку, незалежно від парності
    state.touchReachabilityState()
    return { state, p1 }
  }

  it('після applyCommand(move) мапа перерахована від нової позиції і меншого бюджету', () => {
    const { state, p1 } = buildMoveState()
    state.rollDice(1)

    const startKey = state.getHexKey(p1.position.q, p1.position.r)
    const ahead = hexAhead(p1)
    const aheadKey = state.getHexKey(ahead.q, ahead.r)

    const before = state.getDirectionalReachableCosts(p1.id, 'forward')
    expect(before.get(startKey)).toBe(0)
    expect(before.get(aheadKey)).toBe(1)
    // Кеш-хіт усередині однієї версії — той самий інстанс і для гейта
    // applyCommand, і для повторного читання.
    expect(state.getDirectionalReachableCosts(p1.id, 'forward')).toBe(before)

    const r = applyCommand(state, { type: 'move', unitId: p1.id, payload: { to: ahead } })
    expect(r.ok).toBe(true)

    const after = state.getDirectionalReachableCosts(p1.id, 'forward')
    expect(after).not.toBe(before)
    expect(after.get(aheadKey)).toBe(0) // нова власна позиція
    expect(after.has(startKey)).toBe(false) // стара позиція тепер позаду — у forward-мапі її немає
  })
})

describe('invalidateReachabilityCache — reflection guard: всі _*CacheVersion поля = -1', () => {
  it('після виклику invalidateReachabilityCache кожне власне поле з /_.*CacheVersion$/ дорівнює -1', () => {
    const state = new GameState({ width: 3, height: 3 })
    // Примусово "зігріємо" кожен числовий version-поле до 0, щоб довести,
    // що саме invalidateReachabilityCache скидає їх, а не просто початковий стан.
    state.reachabilityVersion = 1
    state.cacheVersion = 0
    state._attackTargetsCacheVersion = 0
    state._attackRangeHexesCacheVersion = 0
    state._directionalCostsCacheVersion = 0
    state._boardSnapshotCacheVersion = 0

    state.invalidateReachabilityCache()

    const versionFields = Object.getOwnPropertyNames(state).filter(k => /_.*CacheVersion$/.test(k))
    expect(versionFields.length).toBeGreaterThan(0) // якщо 0 — тест сам по собі зламаний
    for (const field of versionFields) {
      expect(state[field], `${field} має бути -1 після invalidateReachabilityCache`).toBe(-1)
    }
  })
})

describe('детермінізм симуляції з кешем — fingerprint проти безкешового базлайну', () => {
  function djb2(str) {
    let h = 5381
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
    }
    return h
  }

  it('runMatch (seed "reachability-cache-baseline") відтворює результат, знятий ДО впровадження кешу', () => {
    // Базлайн знято 2026-06-11 на безкешовій гілці getDirectionalReachableCosts /
    // createBoardSnapshot (той самий seed, той самий фікстурний пакет).
    // Кеш не сміє міняти поведінку: розбіжність тут означає, що кешування
    // змінило хід симуляції, а не лише її вартість.
    //
    // Після merge цей тест є PIN-ом детермінізму: навмисна зміна правил,
    // фікстури або стратегії легітимно змінить fingerprint.
    // Кроки повторного піну: переконайся, що зміна навмисна, потім залоги
    //   console.log(result.metrics)
    //   console.log(result.history.length)
    //   console.log(djb2(JSON.stringify(result.history)))
    // і оновіть ВСІ очікування в цьому тесті разом.
    const result = runMatch({
      levelPackage: makeMicroLevelPackage(),
      strategies: { player1: randomStrategy(), player2: randomStrategy() },
      seed: 'reachability-cache-baseline',
      maxTurns: 12,
      recordHistory: true
    })

    expect(result.winner).toBe('draw')
    expect(result.turns).toBe(12)
    expect(result.reason).toBe('materialDecision')
    expect(result.metrics.actionsByType).toEqual({
      move: 12,
      reverse: 2,
      turn: 11,
      fire: 2,
      reload: 1,
      endTurn: 12
    })
    expect(result.metrics.actionsByPlayerType).toEqual({
      player1: { move: 4, reverse: 2, turn: 6, fire: 1, reload: 0, endTurn: 6 },
      player2: { move: 8, reverse: 0, turn: 5, fire: 1, reload: 1, endTurn: 6 }
    })
    expect(result.metrics.damageByPlayer).toEqual({ player1: 30, player2: 30 })
    expect(result.metrics.killsByPlayer).toEqual({ player1: 0, player2: 0 })
    expect(result.metrics.finalUnitCount).toEqual({ player1: 1, player2: 1 })
    expect(result.history.length).toBe(40)
    expect(djb2(JSON.stringify(result.history))).toBe(3025902417)
  })
})
