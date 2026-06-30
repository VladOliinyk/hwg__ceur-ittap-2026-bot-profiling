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

function makePackage({ id = 'level_000', width = 5, height = 8 } = {}) {
  return {
    id,
    hexmap: {
      parameters: { width, height },
      map: Array.from({ length: width * height }, (_, index) => ({
        q: index % width,
        r: Math.floor(index / width),
        terrain: 'plains'
      }))
    }
  }
}

function mountEngine(props = {}) {
  return mount(GameEngineBlock, {
    props: {
      gameState: null,
      mapData: null,
      levelOptions: [
        { id: 'level_000', label: 'level_000', source: 'default' },
        { id: 'level_zip', label: 'level_zip', source: 'zip' }
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
        Vue3Lottie: { template: '<div />' },
        SelectionInspectorPanel: { template: '<div />' }
      }
    }
  })
}

describe('GameEngineBlock Level setup', () => {
  it('renders level selection controls and emits setup events', async () => {
    const wrapper = mountEngine()

    await wrapper.find('[data-test="engine-level-select"]').setValue('level_zip')
    await wrapper.find('[data-test="engine-seed-input"]').setValue('zip-seed')
    await wrapper.find('[data-test="engine-load-button"]').trigger('click')

    expect(wrapper.emitted('level-selected')).toEqual([['level_zip']])
    expect(wrapper.emitted('seed-updated')).toEqual([['zip-seed']])
    expect(wrapper.emitted('load-selected-level')).toHaveLength(1)

    await wrapper.setProps({
      selectedLevelId: 'level_zip',
      loadedPackage: makePackage({ id: 'level_zip' }),
      loadedSource: 'zip'
    })
    const loadButton = wrapper.find('[data-test="engine-load-button"]')
    expect(loadButton.element.disabled).toBe(true)
    expect(loadButton.text()).toBe('Loaded')
    expect(wrapper.find('[data-test="engine-reset-button"]').exists()).toBe(false)

    await wrapper.find('[data-test="engine-start-button"]').trigger('click')
    expect(wrapper.emitted('start-game')).toHaveLength(1)
  })

  it('accepts ZIP files and disables Start until a level package is loaded', async () => {
    const wrapper = mountEngine()
    const startButton = wrapper.find('[data-test="engine-start-button"]').element
    expect(startButton.disabled).toBe(true)
    const uploadButton = wrapper.find('[data-test="engine-upload-button"]')
    expect(uploadButton.attributes('title')).toBe('Browse level ZIP')
    expect(uploadButton.text()).toContain('Browse level ZIP')

    const input = wrapper.find('[data-test="engine-archive-input"]')
    const file = new File(['zip-bytes'], 'level_zip.zip', { type: 'application/zip' })
    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true
    })

    await input.trigger('change')

    expect(input.attributes('accept')).toBe('.zip')
    expect(wrapper.emitted('upload-archive')).toEqual([[file]])

    await wrapper.setProps({ loadedPackage: makePackage({ id: 'level_zip' }) })
    expect(wrapper.find('[data-test="engine-start-button"]').element.disabled).toBe(false)
  })

  it('swaps Start game for Reset only after the game starts', async () => {
    const wrapper = mountEngine()

    expect(wrapper.find('[data-test="engine-load-button"]').element.disabled).toBe(false)
    expect(wrapper.find('[data-test="engine-start-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-start-button"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-test="engine-reset-button"]').exists()).toBe(false)

    await wrapper.setProps({
      loadedPackage: makePackage({ id: 'level_000' }),
      loadedSource: 'default'
    })

    expect(wrapper.find('[data-test="engine-load-button"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-test="engine-start-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-start-button"]').element.disabled).toBe(false)
    expect(wrapper.find('[data-test="engine-reset-button"]').exists()).toBe(false)

    await wrapper.setProps({ gameState: { currentTurnActions: [] } })

    expect(wrapper.find('[data-test="engine-start-button"]').exists()).toBe(false)
    const resetButton = wrapper.find('[data-test="engine-reset-button"]')
    expect(resetButton.exists()).toBe(true)
    expect(resetButton.element.disabled).toBe(false)
    expect(resetButton.text()).toContain('Reset level')
    expect(wrapper.find('.engine-setup-divider').exists()).toBe(true)
    expect(wrapper.find('[data-test="engine-restart-game-button"]').exists()).toBe(true)

    await resetButton.trigger('click')
    expect(wrapper.emitted('reset-game')).toHaveLength(1)
  })

  it('shows loaded level summary details', () => {
    const wrapper = mountEngine({
      loadedPackage: makePackage({ id: 'level_zip', width: 3, height: 4 }),
      loadedSource: 'zip',
      loadedWarnings: [{ message: 'legacy schema' }]
    })

    const summary = wrapper.find('.engine-level-summary').text()
    expect(summary).toContain('level_zip')
    expect(summary).toContain('3 x 4')
    expect(summary).toContain('12 hexes')
    expect(summary).toContain('Source: zip')
    expect(summary).toContain('1 warning')
  })

  it('resolves terrain legend labels from loaded package labels', () => {
    const loadedPackage = {
      ...makePackage({ id: 'level_zip', width: 1, height: 1 }),
      terrain: {
        terrainTypes: [
          {
            id: 'plains',
            name: 'Plains',
            labels: { en_US: 'Open Plains' },
            color: '#4CAF50'
          }
        ]
      }
    }
    const wrapper = mountEngine({ loadedPackage })

    expect(wrapper.vm.formatTerrainName('plains')).toBe('Open Plains')
  })

  it('collapses level setup when a game starts and expands it after reset', async () => {
    const wrapper = mountEngine()

    expect(wrapper.vm.collapsedSections.level).toBe(false)

    await wrapper.setProps({ gameState: { currentTurnActions: [] } })
    expect(wrapper.vm.collapsedSections.level).toBe(true)

    await wrapper.setProps({ gameState: null })
    expect(wrapper.vm.collapsedSections.level).toBe(false)
  })
})
