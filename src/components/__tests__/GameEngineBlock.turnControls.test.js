// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GameEngineBlock from '../GameEngineBlock.vue'

vi.mock('@/assets/dice_animation/dice0.svg', () => ({ default: 'dice0.svg' }))
vi.mock('@/assets/dice_animation/dice1.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice2.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice3.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice4.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice5.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice6.json', () => ({ default: {} }))

function makeGameState({ dice = null, locked = dice != null, currentPlayer = 'player1', units = [], actions = null } = {}) {
  const turnState = Object.fromEntries(units.map(unit => [
    unit.id,
    { actionsRemaining: unit.actionsRemaining ?? unit.movement ?? 0, isLoaded: unit.isLoaded !== false }
  ]))
  const currentTurnActions = Array.isArray(actions)
    ? actions
    : dice == null ? [] : [{ type: 'dice_roll', result: dice }]
  return {
    currentPlayer,
    turnNumber: 3,
    gamePhase: 'MANOEUVRE',
    currentTurnActions,
    history: [],
    turnState,
    hasRolledDice: vi.fn(() => locked),
    getCurrentDiceResult: vi.fn(() => dice),
    getAllUnits: vi.fn(() => units),
    getActivePlayerUnits: vi.fn(player => units.filter(unit => {
      if (!unit || unit.player !== player) return false
      return typeof unit.isAlive === 'function' ? unit.isAlive() : unit.isActive !== false
    }))
  }
}

const movesDataFixture = {
  Our_operations: [
    {
      title: 'manoeuvre',
      moves: [
        {
          title: '-',
          dice: [
            ['move'],
            ['turn'],
            ['move', 'reverse'],
            ['turn'],
            ['reverse'],
            ['move']
          ]
        }
      ]
    },
    {
      title: 'attack',
      moves: [
        {
          title: '-',
          dice: [
            ['fire'],
            ['reload'],
            [],
            ['fire'],
            [],
            ['fire', 'reload']
          ]
        }
      ]
    }
  ],
  Enemy_operations: [
    {
      title: 'manoeuvre',
      moves: [
        {
          title: '-',
          dice: [
            ['move'],
            ['turn'],
            ['move', 'turn'],
            ['reverse'],
            ['turn'],
            ['reverse']
          ]
        }
      ]
    },
    {
      title: 'attack',
      moves: [
        {
          title: '-',
          dice: [
            ['fire'],
            ['reload'],
            [],
            [],
            ['fire'],
            ['fire', 'reload']
          ]
        }
      ]
    }
  ]
}

function mountEngine(props = {}) {
  return mount(GameEngineBlock, {
    props: {
      gameState: null,
      mapData: null,
      levelOptions: [
        { id: 'level_000', label: 'level_000', source: 'default' }
      ],
      selectedLevelId: 'level_000',
      seed: 'level_000-seed-1',
      loadedPackage: null,
      loadedSource: null,
      loadedWarnings: [],
      isRestoring: false,
      isInitializingGlobal: false,
      isStartingGame: false,
      ...props
    },
    global: {
      stubs: {
        Vue3Lottie: { template: '<div data-test="lottie-stub" />' }
      }
    }
  })
}

describe('GameEngineBlock turn controls', () => {
  it('renders Setup and Turn controls tabs', () => {
    const wrapper = mountEngine()
    const tabs = wrapper.findAll('.tab-button')

    expect(tabs.map(tab => tab.text())).toEqual(['Setup', 'Turn controls'])
  })

  it('keeps existing level controls on the Setup tab', () => {
    const wrapper = mountEngine()

    expect(wrapper.vm.activeTab).toBe('setup')
    expect(wrapper.find('[data-test="engine-level-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-upload-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-seed-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-load-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-start-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-reset-button"]').exists()).toBe(false)
  })

  it('shows game status in Turn controls when gameState exists', () => {
    const wrapper = mountEngine({ gameState: makeGameState() })
    const status = wrapper.find('[data-test="engine-turn-status"]').text()

    expect(wrapper.vm.activeTab).toBe('turn')
    expect(status).toContain('Current player')
    expect(status).toContain('player1')
    expect(status).toContain('Turn')
    expect(status).toContain('3')
  })

  it('renders the turn controls as phase accordions', () => {
    const wrapper = mountEngine({ gameState: makeGameState() })
    const accordion = wrapper.find('[data-test="engine-phase-accordion"]')
    const titles = accordion.findAll('.engine-section__title').map(node => node.text())

    expect(titles).toEqual([
      'Phase 1: Dice roll',
      'Phase 2: Movement & Attack',
      'End of step'
    ])
    expect(accordion.findAll('.engine-section')).toHaveLength(3)
    expect(wrapper.find('[data-test="engine-turn-status"] .turn-step-metrics').exists()).toBe(true)
    expect(wrapper.find('#engine-section-current-step').exists()).toBe(false)
  })

  it('allows multiple phase accordion rows to stay open independently', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ dice: null, locked: false }) })
    const header = controlsId => wrapper.find(`[aria-controls="${controlsId}"]`)

    expect(header('engine-section-dice-roll').attributes('aria-expanded')).toBe('true')
    expect(header('engine-section-movement').attributes('aria-expanded')).toBe('true')
    expect(header('engine-section-end-step').attributes('aria-expanded')).toBe('true')

    await header('engine-section-movement').trigger('click')

    expect(header('engine-section-dice-roll').attributes('aria-expanded')).toBe('true')
    expect(header('engine-section-movement').attributes('aria-expanded')).toBe('false')
    expect(header('engine-section-end-step').attributes('aria-expanded')).toBe('true')

    await header('engine-section-dice-roll').trigger('click')

    expect(header('engine-section-dice-roll').attributes('aria-expanded')).toBe('false')
    expect(header('engine-section-movement').attributes('aria-expanded')).toBe('false')
    expect(header('engine-section-end-step').attributes('aria-expanded')).toBe('true')
  })

  it('shows sequential phase status subtitles', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ dice: null, locked: false }) })
    const subtitles = () => wrapper.findAll('.engine-turn .engine-section__subtitle').map(node => node.text())

    expect(subtitles()).toEqual([
      'Current phase',
      'Finish previous phase to continue',
      'Finish previous phase to continue'
    ])

    await wrapper.setProps({ gameState: makeGameState({ dice: 4, locked: true }) })
    expect(subtitles()).toEqual([
      'Already finished',
      'Current phase',
      'Finish previous phase to continue'
    ])

    await wrapper.setProps({
      gameState: makeGameState({
        dice: 4,
        locked: true,
        actions: [
          { type: 'dice_roll', result: 4 },
          { type: 'move' }
        ]
      })
    })
    expect(subtitles()).toEqual([
      'Already finished',
      'Already finished',
      'Current phase'
    ])

    await wrapper.setProps({
      gameState: makeGameState({
        dice: 4,
        locked: true,
        actions: [
          { type: 'dice_roll', result: 4 },
          { type: 'move' },
          { type: 'fire' }
        ]
      })
    })
    expect(subtitles()).toEqual([
      'Already finished',
      'Already finished',
      'Current phase'
    ])
  })

  it('uses semantic actionType values when deriving phase status', () => {
    const wrapper = mountEngine({
      gameState: makeGameState({
        dice: 4,
        locked: true,
        actions: [
          { type: 'dice_roll', result: 4 },
          { type: 'attack', actionType: 'fire' }
        ]
      })
    })
    const subtitles = wrapper.findAll('.engine-turn .engine-section__subtitle').map(node => node.text())

    expect(subtitles).toEqual([
      'Already finished',
      'Already finished',
      'Current phase'
    ])
  })

  it('displays the D6 result inside the roll control after a roll exists', () => {
    const gameState = makeGameState({ dice: 4 })
    const wrapper = mountEngine({ gameState })

    expect(wrapper.find('[data-test="engine-d6-result"]').text()).toBe('D6 = 4')
    expect(wrapper.find('[data-test="engine-available-actions"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-roll-d6-button"]').classes()).toContain('dice-roll-trigger--turn')
  })

  it('shows available actions placeholder before D6 and one turntable row after roll', async () => {
    const wrapper = mountEngine({
      movesData: movesDataFixture,
      gameState: makeGameState({ dice: null, locked: false, currentPlayer: 'player1' })
    })
    const available = () => wrapper.find('[data-test="engine-available-actions"]')

    expect(available().text()).toContain('Available actions')
    expect(available().text()).toContain('Roll dice to see available actions')
    expect(available().find('table').exists()).toBe(false)

    await wrapper.setProps({
      gameState: makeGameState({ dice: 2, locked: true, currentPlayer: 'player1' })
    })

    expect(available().find('table').exists()).toBe(true)
    expect(available().text()).toContain('d2')
    expect(available().text()).toContain('Manoeuvre')
    expect(available().text()).toContain('Attack')
    expect(available().text()).toContain('turn')
    expect(available().text()).toContain('reload')
  })

  it('emits End Turn from Turn Controls', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ dice: 3, locked: true }) })

    await wrapper.find('[data-test="engine-end-turn-button"]').trigger('click')

    expect(wrapper.emitted('end-turn')).toHaveLength(1)
  })

  it('allows End Turn before D6 is rolled', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ dice: null, locked: false }) })
    const button = wrapper.find('[data-test="engine-end-turn-button"]')

    expect(button.element.disabled).toBe(false)
    await button.trigger('click')
    expect(wrapper.emitted('end-turn')).toHaveLength(1)
  })

  it('labels End Turn with the current side', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ currentPlayer: 'player1' }) })

    expect(wrapper.find('[data-test="engine-end-turn-button"]').attributes('aria-label')).toBe('End turn: Player')

    await wrapper.setProps({ gameState: makeGameState({ currentPlayer: 'player2' }) })

    expect(wrapper.find('[data-test="engine-end-turn-button"]').attributes('aria-label')).toBe('End turn: Enemy')
  })

  it('marks the waiting D6 roll control with the current player color state', async () => {
    const wrapper = mountEngine({
      gameState: makeGameState({ currentPlayer: 'player1', dice: null, locked: false })
    })
    const button = () => wrapper.find('[data-test="engine-roll-d6-button"]')

    expect(button().attributes('data-current-player')).toBe('player1')
    expect(button().attributes('data-roll-state')).toBe('waiting')

    await wrapper.setProps({
      gameState: makeGameState({ currentPlayer: 'player2', dice: null, locked: false })
    })

    expect(button().attributes('data-current-player')).toBe('player2')
    expect(button().attributes('data-roll-state')).toBe('waiting')

    await wrapper.setProps({
      gameState: makeGameState({ currentPlayer: 'player2', dice: 4, locked: true })
    })

    expect(button().attributes('data-current-player')).toBe('player2')
    expect(button().attributes('data-roll-state')).toBe('rolled')
  })

  it('emits Restart Game from Setup controls', async () => {
    const wrapper = mountEngine({ gameState: makeGameState({ dice: null, locked: false }) })
    expect(wrapper.find('[data-test="engine-turn-tab"] [data-test="engine-restart-game-button"]').exists()).toBe(false)

    await wrapper.find('[data-test="engine-setup-tab"] [data-test="engine-restart-game-button"]').trigger('click')

    expect(wrapper.emitted('restart-game')).toHaveLength(1)
  })

  it('shows only active-player units in the movement phase and emits preview intents', async () => {
    const units = [
      {
        id: 'p1a',
        type: 'infantry',
        player: 'player1',
        movement: 4,
        actionsRemaining: 2,
        facing: 0,
        position: { q: 0, r: 0 },
        isAlive: () => true
      },
      {
        id: 'p2a',
        type: 'armored',
        player: 'player2',
        movement: 3,
        actionsRemaining: 3,
        facing: 1,
        position: { q: 1, r: 0 },
        isAlive: () => true
      }
    ]
    const wrapper = mountEngine({
      gameState: makeGameState({ units, currentPlayer: 'player1' }),
      selectionInspectorBridge: { selectedUnitId: null }
    })
    const cards = wrapper.findAll('[data-test="engine-active-unit-grid"] .engine-unit-card')

    expect(cards).toHaveLength(1)
    expect(cards[0].attributes('aria-label')).toContain('p1a')
    expect(cards[0].find('.engine-unit-card__hp').text()).toBe('100/100')

    await cards[0].trigger('mouseenter')
    const blurSpy = vi.spyOn(cards[0].element, 'blur')
    await cards[0].trigger('click')
    await cards[0].trigger('mouseleave')

    expect(blurSpy).toHaveBeenCalled()
    expect(wrapper.emitted('unit-preview-hover')).toEqual([['p1a'], [null]])
    expect(wrapper.emitted('unit-preview-select')).toEqual([['p1a']])
  })

  it('deselects the selected unit card on repeated click or right click', async () => {
    const units = [
      {
        id: 'p1a',
        type: 'infantry',
        player: 'player1',
        movement: 4,
        actionsRemaining: 2,
        facing: 0,
        position: { q: 0, r: 0 },
        isAlive: () => true
      }
    ]
    const wrapper = mountEngine({
      gameState: makeGameState({ units, currentPlayer: 'player1' }),
      selectionInspectorBridge: { selectedUnitId: 'p1a' }
    })
    const card = wrapper.find('[data-test="engine-active-unit-grid"] .engine-unit-card')

    await card.trigger('click')
    await card.trigger('contextmenu')

    expect(wrapper.emitted('unit-preview-select')).toEqual([[null], [null]])
  })

  it('keeps dead active-player units at the end and disables their cards', () => {
    const units = [
      {
        id: 'p1dead',
        type: 'infantry',
        player: 'player1',
        movement: 4,
        actionsRemaining: 0,
        health: 0,
        maxHealth: 60,
        facing: 0,
        position: { q: 0, r: 0 },
        isAlive: () => false
      },
      {
        id: 'p1alive',
        type: 'armored',
        player: 'player1',
        movement: 3,
        actionsRemaining: 3,
        health: 80,
        maxHealth: 100,
        facing: 1,
        position: { q: 1, r: 0 },
        isAlive: () => true
      }
    ]
    const wrapper = mountEngine({
      gameState: makeGameState({ units, currentPlayer: 'player1' })
    })
    const cards = wrapper.findAll('[data-test="engine-active-unit-grid"] .engine-unit-card')

    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('aria-label')).toContain('p1alive')
    expect(cards[0].element.disabled).toBe(false)
    expect(cards[1].attributes('aria-label')).toContain('p1dead')
    expect(cards[1].classes()).toContain('is-dead')
    expect(cards[1].element.disabled).toBe(true)
  })

  it('keeps the D6 result visible in the full-width roll control once locked', () => {
    const wrapper = mountEngine({
      gameState: makeGameState({ dice: 5, locked: true, currentPlayer: 'player2' })
    })
    const button = wrapper.find('[data-test="engine-roll-d6-button"]')

    expect(button.element.disabled).toBe(true)
    expect(button.attributes('data-current-player')).toBe('player2')
    expect(button.attributes('data-roll-state')).toBe('rolled')
    expect(wrapper.find('[data-test="engine-d6-result"]').text()).toBe('D6 = 5')
    expect(wrapper.find('.dice-roll-caption').text()).toBe('Right click to instant roll')
    expect(wrapper.find('[data-test="engine-end-turn-button"]').element.disabled).toBe(false)
    expect(wrapper.find('[data-test="engine-turn-tab"] [data-test="engine-restart-game-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="engine-setup-tab"] [data-test="engine-restart-game-button"]').element.disabled).toBe(false)
  })
})
