// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import TimelineBlock from '../TimelineBlock.vue'
import { GameState } from '@/domain/engine/gameState.js'
import { createRng } from '../../domain/simulation/rng.js'
import { isGameSnapshotEnvelope, SNAPSHOT_KIND } from '../../domain/snapshot/gameSnapshot.js'

/**
 * Component-level coverage for `TimelineBlock.exportSnapshot()`:
 *
 *   - happy path: with a valid levelPackage + seeded GameState, the
 *     downloaded payload is a v1 GameSnapshot envelope.
 *   - downgrade path: with a legacy (rng-less) GameState, the snapshot
 *     fails its own v1 validator and we fall back to the legacy
 *     history-only payload so the user still gets a file. A $notify
 *     warning surfaces the downgrade.
 *
 * The DOM download (anchor click + URL.createObjectURL) is intercepted
 * so the test can inspect what would have been written without actually
 * downloading anything.
 */

function makeValidPackage(id = 'level_export') {
  return {
    id,
    hexmap: {
      parameters: { width: 2, height: 3 },
      map: [
        { q: 0, r: 0, terrain: 'plains', player1Spawn: true, player1Base: true },
        { q: 1, r: 0, terrain: 'plains', player1Spawn: true },
        { q: 0, r: 1, terrain: 'forest' },
        { q: 1, r: 1, terrain: 'plains' },
        { q: 0, r: 2, terrain: 'plains', player2Spawn: true, player2Base: true },
        { q: 1, r: 2, terrain: 'plains', player2Spawn: true }
      ]
    },
    terrain: {
      terrainTypes: [
        { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
        { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
      ]
    },
    units: {
      player1: { units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ] },
      player2: { units: [
        { type: 'infantry', name: 'Infantry', health: 60, movement: 4, attackRange: 1, attackPower: 30, count: 1 }
      ] }
    },
    turntable: {
      Our_operations: [
        { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [
          ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
        ] }] }
      ],
      Enemy_operations: [
        { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [
          ['move'], ['move'], ['move'], ['move'], ['move'], ['move']
        ] }] }
      ]
    }
  }
}

function makeGameStateFromPackage(pkg, { seeded = true } = {}) {
  // `markRaw` so the test does not pay Vue's reactive Proxy overhead
  // and — more importantly — `structuredClone` inside `GameState.toJSON`
  // does not choke on a reactive proxy of `turnState`.
  return markRaw(new GameState({
    width: pkg.hexmap.parameters.width,
    height: pkg.hexmap.parameters.height,
    mapData: pkg.hexmap,
    terrainTypes: pkg.terrain.terrainTypes,
    unitsData: pkg.units,
    turntableData: pkg.turntable,
    rng: seeded ? createRng('export-seed') : undefined
  }))
}

/**
 * Intercept the anchor-based download so the test can read the payload
 * that would have been written. Returns the captured `{ blob, filename }`.
 */
function interceptDownload() {
  const captured = { blob: null, filename: null }
  // eslint-disable-next-line no-undef
  const originalCreate = URL.createObjectURL
  // eslint-disable-next-line no-undef
  const originalRevoke = URL.revokeObjectURL
  // eslint-disable-next-line no-undef
  URL.createObjectURL = vi.fn((blob) => {
    captured.blob = blob
    return 'blob:mocked'
  })
  // eslint-disable-next-line no-undef
  URL.revokeObjectURL = vi.fn()
  // Patch the click() on anchors so it captures the filename instead of
  // triggering an actual navigation.
  const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    captured.filename = this.download
  })
  return {
    captured,
    restore() {
      // eslint-disable-next-line no-undef
      URL.createObjectURL = originalCreate
      // eslint-disable-next-line no-undef
      URL.revokeObjectURL = originalRevoke
      anchorClickSpy.mockRestore()
    }
  }
}

async function blobToText(blob) {
  if (typeof blob.text === 'function') return await blob.text()
  return await new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

let notifySpy
let download
beforeEach(() => {
  notifySpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  // eslint-disable-next-line no-undef
  window.$notify = notifySpy
  download = interceptDownload()
})
afterEach(() => {
  download.restore()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // eslint-disable-next-line no-undef
  delete window.$notify
})

describe('TimelineBlock header controls', () => {
  it('hides turn controls and history menu before a game is initialized', () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: null }
    })

    expect(wrapper.find('.turn-stepper-container').exists()).toBe(false)
    expect(wrapper.find('.header-controls').exists()).toBe(false)
    expect(wrapper.text()).toContain('Game timeline')
    expect(wrapper.text()).toContain('No active game')
    expect(wrapper.text()).not.toContain('End turn')
  })

  it('shows header controls only while an active game exists', async () => {
    const pkg = makeValidPackage()
    const gs = makeGameStateFromPackage(pkg, { seeded: true })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: null }
    })

    await wrapper.setProps({ gameState: gs })

    expect(wrapper.find('.turn-stepper-container').exists()).toBe(true)
    expect(wrapper.find('.header-controls').exists()).toBe(true)
    expect(wrapper.text()).toContain('End turn')

    await wrapper.setData({ showHistoryMenu: true })
    await wrapper.setProps({ gameState: null })

    expect(wrapper.find('.turn-stepper-container').exists()).toBe(false)
    expect(wrapper.find('.header-controls').exists()).toBe(false)
    expect(wrapper.vm.showHistoryMenu).toBe(false)
  })

  it('removes stepper drag listeners when unmounted mid-drag', async () => {
    const add = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    const remove = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {})
    const pkg = makeValidPackage()
    const gs = makeGameStateFromPackage(pkg, { seeded: true })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: gs }
    })
    await wrapper.vm.$nextTick()

    wrapper.vm.onStepperPointerDown({
      pointerType: 'mouse',
      button: 0,
      pointerId: 7,
      clientX: 30,
      preventDefault: vi.fn()
    })

    expect(add.mock.calls.some(call => call[0] === 'pointermove')).toBe(true)
    expect(add.mock.calls.some(call => call[0] === 'pointerup')).toBe(true)
    expect(add.mock.calls.some(call => call[0] === 'pointercancel')).toBe(true)
    expect(wrapper.vm.isStepperDragging).toBe(true)
    expect(wrapper.vm.stepperDragCleanup).toEqual(expect.any(Function))

    wrapper.unmount()

    expect(remove.mock.calls.some(call => call[0] === 'pointermove')).toBe(true)
    expect(remove.mock.calls.some(call => call[0] === 'pointerup')).toBe(true)
    expect(remove.mock.calls.some(call => call[0] === 'pointercancel')).toBe(true)
    expect(wrapper.vm.isStepperDragging).toBe(false)
    expect(wrapper.vm.stepperDragCleanup).toBe(null)
  })
})

describe('TimelineBlock.exportSnapshot', () => {
  it('produces a v1 GameSnapshot envelope when given a valid levelPackage + seeded GameState', async () => {
    const pkg = makeValidPackage()
    const gs = makeGameStateFromPackage(pkg, { seeded: true })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: gs, levelPackage: pkg, rngSeed: 'export-seed' }
    })

    wrapper.vm.exportSnapshot()
    await wrapper.vm.$nextTick()

    expect(download.captured.filename).toMatch(/^hexwar-snapshot-/)
    expect(download.captured.blob).toBeTruthy()
    const text = await blobToText(download.captured.blob)
    const parsed = JSON.parse(text)
    expect(isGameSnapshotEnvelope(parsed)).toBe(true)
    expect(parsed.kind).toBe(SNAPSHOT_KIND)
    expect(parsed.levelPackage.id).toBe(pkg.id)
    expect(parsed.rngSeed).toBe('export-seed')
    expect(notifySpy.warning).not.toHaveBeenCalled()
    // The embedded levelPackage must carry the current schemaVersion so
    // the importing side reads a clean envelope without legacy migration warnings.
    expect(parsed.levelPackage.schemaVersion).toBe(2)
  })

  it('strips legacy field-name typos from the embedded levelPackage on export', async () => {
    // Source data carries the legacy typos. The validator-normalized
    // snapshot must land on disk with canonical names only — otherwise a
    // re-export of a re-imported save would silently keep the typo alive.
    const pkg = makeValidPackage('legacy_typo_export')
    pkg.terrain.terrainTypes[0] = {
      id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficuly: 0
    }
    pkg.units.player1.units[0] = {
      type: 'infantry', name: 'Infantry', health: 60, movement: 4,
      attackRange: 1, attackPower: 30, maxTerrainDifficuly: 9, count: 1
    }
    const gs = makeGameStateFromPackage(pkg, { seeded: true })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: gs, levelPackage: pkg, rngSeed: 'export-seed' }
    })

    wrapper.vm.exportSnapshot()
    await wrapper.vm.$nextTick()

    expect(download.captured.filename).toMatch(/^hexwar-snapshot-/)
    const parsed = JSON.parse(await blobToText(download.captured.blob))
    expect(isGameSnapshotEnvelope(parsed)).toBe(true)
    expect(parsed.levelPackage.schemaVersion).toBe(2)
    const plains = parsed.levelPackage.terrain.terrainTypes.find(t => t.id === 'plains')
    expect(plains.terrainDifficulty).toBe(0)
    expect('terrainDifficuly' in plains).toBe(false)
    const infantry = parsed.levelPackage.units.player1.units[0]
    expect(infantry.maxTerrainDifficulty).toBe(9)
    expect('maxTerrainDifficuly' in infantry).toBe(false)
  })

  it('falls back to legacy history-only export when the snapshot fails v1 validation (legacy rng-less GameState)', async () => {
    const pkg = makeValidPackage('legacy_rng_less')
    // Critical: build a GameState WITHOUT a seeded RNG. Its toJSON()
    // omits the `rng` block, so the snapshot we generate will fail the
    // v1 validator's `engine.rng` requirement. Timeline must notice
    // and fall back to legacy history export.
    const gs = makeGameStateFromPackage(pkg, { seeded: false })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: gs, levelPackage: pkg, rngSeed: null }
    })

    wrapper.vm.exportSnapshot()
    await wrapper.vm.$nextTick()

    expect(download.captured.filename).toMatch(/^hexwar-history-/)
    expect(download.captured.blob).toBeTruthy()
    const text = await blobToText(download.captured.blob)
    const parsed = JSON.parse(text)
    // Legacy shape — no kind tag, no levelPackage; just initialState +
    // history + currentTurnActions.
    expect(isGameSnapshotEnvelope(parsed)).toBe(false)
    expect(parsed).toHaveProperty('initialState')
    expect(parsed).toHaveProperty('history')
    expect(notifySpy.warning).toHaveBeenCalledWith(
      'Snapshot export downgraded',
      expect.stringContaining('legacy save without RNG state')
    )
  })

  it('uses legacy export directly when no levelPackage prop is passed (pre-snapshot wiring)', async () => {
    const pkg = makeValidPackage()
    const gs = makeGameStateFromPackage(pkg, { seeded: true })

    const wrapper = mount(TimelineBlock, {
      props: { gameState: gs /* no levelPackage */ }
    })

    wrapper.vm.exportSnapshot()
    await wrapper.vm.$nextTick()

    // Legacy path should not generate a downgrade warning — it's the
    // documented pre-snapshot fallback for partial wiring.
    expect(download.captured.filename).toMatch(/^hexwar-history-/)
    expect(notifySpy.warning).not.toHaveBeenCalled()
  })
})

describe('TimelineBlock outcome card', () => {
  it('renders the final game result as the last card in the current turn action history', async () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 21 },
        {
          type: 'attack',
          unitId: 'p1_Inf1',
          unitName: 'p1_Inf1',
          from: { q: 2, r: 5 },
          to: { q: 2, r: 6 }
        }
      ],
      outcome: {
        status: 'ended',
        winner: 'player1',
        reason: 'unitWipe',
        conditionId: 'player1_eliminate_player2',
        message: 'player2 has no active units.'
      }
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })

    const cards = wrapper.findAll('.actions-list > .action-card')
    expect(cards).toHaveLength(3)
    expect(cards[2].attributes('data-test')).toBe('timeline-outcome-card')
    // Assert the dynamic winner value (stable contract) rather than the full
    // resolved "Game won by {winner}" copy, which breaks when en_US is edited.
    expect(cards[2].text()).toContain('player1')
    expect(cards[2].text()).toContain('player2 has no active units.')

    await cards[2].trigger('click')
    expect(wrapper.emitted('show-outcome-dialog')).toHaveLength(1)
  })
})

describe('TimelineBlock turn boundary cards', () => {
  it('shows Player/Enemy side labels for start and end turn cards', () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 },
        { type: 'dice_roll', player: 'player1', turnNumber: 1, result: 3 },
        { type: 'endTurn', player: 'player2', turnNumber: 1 }
      ]
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })

    const cards = wrapper.findAll('.actions-list > .action-card')
    expect(cards[0].classes()).toContain('action-turn-boundary')
    expect(cards[0].classes()).toContain('action-turn-boundary--player1')
    expect(cards[0].find('.turn-side-label').text()).toBe('Player')
    expect(cards[0].text()).toContain('T1')
    expect(cards[0].text()).not.toContain('player1')
    expect(cards[2].classes()).toContain('action-turn-boundary')
    expect(cards[2].classes()).toContain('action-turn-boundary--player2')
    expect(cards[2].find('.turn-side-label').text()).toBe('Enemy')
    expect(cards[2].text()).toContain('T1')
    expect(cards[2].text()).not.toContain('player2')
  })
})

describe('TimelineBlock action labels', () => {
  it('renders semantic turntable action labels instead of technical mutation types', () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player2', turnNumber: 4 },
        { type: 'dice_roll', player: 'player2', turnNumber: 4, result: 3 },
        {
          type: 'move',
          actionType: 'reverse',
          unitId: 'p2_inf2',
          unitName: 'p2_inf2',
          from: { q: 3, r: 4 },
          to: { q: 2, r: 5 }
        },
        {
          type: 'rotate',
          actionType: 'turn',
          unitId: 'p2_inf2',
          unitName: 'p2_inf2',
          from: { q: 2, r: 5 },
          to: { q: 2, r: 5 }
        },
        {
          type: 'attack',
          actionType: 'fire',
          unitId: 'p2_inf2',
          unitName: 'p2_inf2',
          from: { q: 2, r: 5 },
          to: { q: 2, r: 4 }
        },
        {
          type: 'reload',
          actionType: 'reload',
          unitId: 'p2_inf2',
          unitName: 'p2_inf2',
          from: { q: 2, r: 5 },
          to: { q: 2, r: 5 }
        },
        {
          type: 'rotate',
          unitId: 'legacy_turn',
          unitName: 'legacy_turn',
          from: { q: 1, r: 1 },
          to: { q: 1, r: 1 }
        },
        {
          type: 'attack',
          unitId: 'legacy_fire',
          unitName: 'legacy_fire',
          from: { q: 1, r: 1 },
          to: { q: 1, r: 2 }
        }
      ]
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })
    const cards = wrapper.findAll('.actions-list > .action-card')

    expect(cards[2].find('.action-type').text()).toBe('reverse')
    expect(cards[3].find('.action-type').text()).toBe('turn')
    expect(cards[4].find('.action-type').text()).toBe('fire')
    expect(cards[5].find('.action-type').text()).toBe('reload')
    expect(cards[6].find('.action-type').text()).toBe('turn')
    expect(cards[7].find('.action-type').text()).toBe('fire')
  })
})

describe('TimelineBlock revert confirmation', () => {
  function makeRevertGameState() {
    return markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player2', turnNumber: 2 },
        { type: 'dice_roll', player: 'player2', turnNumber: 2, result: 2 },
        { type: 'move', unitId: 'p2_inf3', from: { q: 0, r: 7 }, to: { q: 1, r: 6 } }
      ],
      currentPlayer: 'player2'
    })
  }

  it('shows inline confirmation on first click and reverts on second click', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeRevertGameState() },
      // Use key-passthrough so the assertion is decoupled from en_US copy edits.
      global: { mocks: { $t: key => key, $tf: key => key } }
    })
    const moveCard = wrapper.findAll('.actions-list > .action-card')[2]

    await moveCard.trigger('click')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('revert-game')).toBeUndefined()
    expect(moveCard.classes()).toContain('action-card--revert-confirm')
    expect(moveCard.find('[data-test="timeline-revert-confirm"]').exists()).toBe(true)
    expect(moveCard.text()).toContain('gameplay.timeline.clickAgainToRevert')

    await moveCard.trigger('click')

    expect(wrapper.emitted('revert-game')).toEqual([
      [{ turnIndex: 0, actionIndex: 2 }]
    ])
    expect(wrapper.find('[data-test="timeline-revert-confirm"]').exists()).toBe(false)
  })

  it('dims every later action while a revert confirmation is pending', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeRevertGameState() }
    })
    const cards = wrapper.findAll('.actions-list > .action-card')

    await cards[1].trigger('click')

    expect(cards[0].classes()).not.toContain('action-card--will-revert')
    expect(cards[1].classes()).toContain('action-card--revert-confirm')
    expect(cards[1].classes()).not.toContain('action-card--will-revert')
    expect(cards[2].classes()).toContain('action-card--will-revert')
  })

  it('clears inline confirmation if the second click does not happen within three seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeRevertGameState() }
    })
    const moveCard = wrapper.findAll('.actions-list > .action-card')[2]

    await moveCard.trigger('click')
    expect(moveCard.find('[data-test="timeline-revert-confirm"]').exists()).toBe(true)

    vi.advanceTimersByTime(3000)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="timeline-revert-confirm"]').exists()).toBe(false)
    expect(wrapper.emitted('revert-game')).toBeUndefined()

    await moveCard.trigger('click')

    expect(wrapper.find('[data-test="timeline-revert-confirm"]').exists()).toBe(true)
    expect(wrapper.emitted('revert-game')).toBeUndefined()
  })
})

describe('TimelineBlock dice placeholder card', () => {
  it('renders after Turn Start and emits roll-dice when clicked', async () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 }
      ]
    })

    // Use key-passthrough so assertions are decoupled from en_US copy edits.
    const wrapper = mount(TimelineBlock, {
      props: { gameState },
      global: { mocks: { $t: key => key, $tf: key => key } }
    })

    const cards = wrapper.findAll('.actions-list > .action-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('gameplay.timeline.turnStart')
    expect(cards[1].attributes('data-test')).toBe('timeline-dice-placeholder-card')
    expect(cards[1].text()).toContain('gameplay.timeline.clickToRollDice')
    expect(cards[1].text()).toContain('gameplay.timeline.instantRollHint')
    expect(cards[1].classes()).toContain('action-dice-placeholder')
    expect(cards[1].classes()).not.toContain('action-dice--pending')
    expect(cards[1].classes()).not.toContain('action-dice--player1')
    expect(cards[1].find('.action-header').exists()).toBe(false)
    expect(cards[1].find('.action-details').exists()).toBe(false)
    expect(wrapper.find('.end-turn-btn').attributes('disabled')).toBeUndefined()

    await cards[1].trigger('click')

    expect(wrapper.emitted('roll-dice')).toHaveLength(1)
  })

  it('emits instant-roll-dice from RMB on the dice placeholder', async () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 }
      ]
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })
    const placeholder = wrapper.find('[data-test="timeline-dice-placeholder-card"]')

    await placeholder.trigger('contextmenu')

    expect(wrapper.emitted('instant-roll-dice')).toHaveLength(1)
    expect(wrapper.emitted('roll-dice')).toBeUndefined()
  })

  it('shows Rolling while the dice is pending and disappears once D6 is recorded', async () => {
    const startAction = { type: 'startTurn', player: 'player1', turnNumber: 1 }
    const gameState = markRaw({
      history: [],
      currentTurnActions: [startAction]
    })

    // Use key-passthrough for $t so the assertion is decoupled from en_US copy
    // edits. $tf falls back to its second arg so "Result: 4" assertions still hold.
    const wrapper = mount(TimelineBlock, {
      props: { gameState, isDiceRolling: true },
      global: { mocks: { $t: key => key, $tf: (key, fallback) => fallback } }
    })

    const placeholder = wrapper.find('[data-test="timeline-dice-placeholder-card"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('gameplay.timeline.rolling')

    await placeholder.trigger('click')
    expect(wrapper.emitted('roll-dice')).toBeUndefined()

    await wrapper.setProps({
      isDiceRolling: false,
      gameState: markRaw({
        history: [],
        currentTurnActions: [
          startAction,
          { type: 'dice_roll', player: 'player1', turnNumber: 1, result: 4 }
        ]
      })
    })

    expect(wrapper.find('[data-test="timeline-dice-placeholder-card"]').exists()).toBe(false)
    const cards = wrapper.findAll('.actions-list > .action-card')
    expect(cards[1].text()).toContain('D6')
    expect(cards[1].text()).toContain('Result: 4')
    expect(cards[1].classes()).toContain('action-dice--rolled')
    expect(cards[1].classes()).not.toContain('action-dice--player1')
    expect(cards[1].classes()).not.toContain('action-dice--player2')
    expect(cards[1].classes()).not.toContain('action-dice--pending')
  })

  it('keeps player2 recorded D6 cards neutral instead of player-colored', () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player2', turnNumber: 2 },
        { type: 'dice_roll', player: 'player2', turnNumber: 2, result: 5 }
      ],
      currentPlayer: 'player2'
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })

    expect(wrapper.find('[data-test="timeline-dice-placeholder-card"]').exists()).toBe(false)
    const diceCard = wrapper.findAll('.actions-list > .action-card')[1]
    expect(diceCard.text()).toContain('Result: 5')
    expect(diceCard.classes()).toContain('action-dice--rolled')
    expect(diceCard.classes()).not.toContain('action-dice--player1')
    expect(diceCard.classes()).not.toContain('action-dice--player2')
  })

  it('does not instant-roll from RMB on a recorded D6 card', async () => {
    const gameState = markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player2', turnNumber: 2 },
        { type: 'dice_roll', player: 'player2', turnNumber: 2, result: 5 }
      ],
      currentPlayer: 'player2'
    })

    const wrapper = mount(TimelineBlock, {
      props: { gameState }
    })
    const diceCard = wrapper.findAll('.actions-list > .action-card')[1]

    await diceCard.trigger('contextmenu')

    expect(wrapper.emitted('instant-roll-dice')).toBeUndefined()
    expect(wrapper.emitted('revert-game')).toBeUndefined()
  })
})

describe('TimelineBlock End Turn dice guard (Finding #3)', () => {
  function makeActiveGameState() {
    return markRaw({
      history: [],
      currentTurnActions: [
        { type: 'startTurn', player: 'player1', turnNumber: 1 },
        { type: 'dice_roll', player: 'player1', turnNumber: 1, result: 4 }
      ]
    })
  }

  it('disables the End Turn button when isDiceRolling is true', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeActiveGameState(), isDiceRolling: true }
    })

    const btn = wrapper.find('.end-turn-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.classes()).toContain('disabled')
  })

  it('enables the End Turn button when isDiceRolling is false', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeActiveGameState(), isDiceRolling: false }
    })

    const btn = wrapper.find('.end-turn-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(btn.classes()).not.toContain('disabled')
  })

  it('does NOT emit end-turn when isDiceRolling is true and button is clicked', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeActiveGameState(), isDiceRolling: true }
    })

    await wrapper.find('.end-turn-btn').trigger('click')

    expect(wrapper.emitted('end-turn')).toBeUndefined()
  })

  it('does NOT emit end-turn when endTurn() is called directly while isDiceRolling', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeActiveGameState(), isDiceRolling: true }
    })

    wrapper.vm.endTurn()

    expect(wrapper.emitted('end-turn')).toBeUndefined()
  })

  it('emits end-turn when isDiceRolling is false', async () => {
    const wrapper = mount(TimelineBlock, {
      props: { gameState: makeActiveGameState(), isDiceRolling: false }
    })

    await wrapper.find('.end-turn-btn').trigger('click')

    expect(wrapper.emitted('end-turn')).toHaveLength(1)
  })
})
