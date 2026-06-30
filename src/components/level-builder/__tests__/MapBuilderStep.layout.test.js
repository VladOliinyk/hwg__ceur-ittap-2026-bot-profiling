// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../HexMapEditorCanvas.vue', () => ({
  default: { name: 'HexMapEditorCanvas', render: () => null }
}))

import MapBuilderStep from '../MapBuilderStep.vue'

const terrainTypes = [
  { id: 'plains', name: 'Plains', color: '#4CAF50', terrainDifficulty: 0 },
  { id: 'forest', name: 'Forest', color: '#2E7D32', terrainDifficulty: 1 }
]

const overlayTypes = [
  {
    id: 'player1-spawn',
    name: 'Player 1 Spawn',
    iconPath: '/icons/p1-spawn.svg',
    property: 'player1Spawn',
    player: 1,
    type: 'spawn'
  },
  {
    id: 'player1-base',
    name: 'Player 1 Base',
    iconPath: '/icons/p1-base.svg',
    property: 'player1Base',
    player: 1,
    type: 'base'
  },
  {
    id: 'player2-spawn',
    name: 'Player 2 Spawn',
    iconPath: '/icons/p2-spawn.svg',
    property: 'player2Spawn',
    player: 2,
    type: 'spawn'
  },
  {
    id: 'player2-base',
    name: 'Player 2 Base',
    iconPath: '/icons/p2-base.svg',
    property: 'player2Base',
    player: 2,
    type: 'base'
  }
]

function mountStep(overrides = {}) {
  const baseProps = {
    hexes: [],
    mapWidth: 4,
    mapHeight: 4,
    hexSize: 24,
    selectedHex: null,
    showCoordinates: false,
    isPaintingMode: false,
    mapParams: { width: 4, height: 4, availableTerrain: ['plains'] },
    terrainTypes,
    terrainSeed: '',
    terrainSeedLocked: false,
    selectedTerrainForPainting: null,
    zoomLevel: 1,
    minZoom: 0.5,
    maxZoom: 3,
    hexCount: 0,
    currentMapWidth: 0,
    currentMapHeight: 0,
    uniqueTerrainTypes: [],
    protectDeploymentTerrain: true,
    overlayTypes,
    selectedOverlay: null,
    activeMapTool: 'select',
    lockBrushMode: 'lock',
    lockedHexCount: 0,
    deploymentAnchorCount: 0,
    clearableDeploymentAnchorCount: 0,
    ...overrides
  }
  return mount(MapBuilderStep, { props: baseProps })
}

describe('MapBuilderStep layout', () => {
  it('renders the two-column root grid with main + tools-area columns', () => {
    const wrapper = mountStep()
    expect(wrapper.find('.map-builder-step').exists()).toBe(true)
    expect(wrapper.find('.map-builder-step > .map-builder-step__main').exists()).toBe(true)
    expect(wrapper.find('.map-builder-step > .map-builder-step__tools-area').exists()).toBe(true)
  })

  it('leaves step heading and hint to the parent step card', () => {
    const wrapper = mountStep()
    expect(wrapper.find('.map-builder-step__step-title').exists()).toBe(false)
    expect(wrapper.find('.map-builder-step__step-hint').exists()).toBe(false)
  })

  it('renders MapControlsPanel inside the right column', () => {
    const wrapper = mountStep()
    expect(wrapper.find('.map-builder-step__tools-area').findComponent({ name: 'MapControlsPanel' }).exists()).toBe(true)
  })

  it('keeps compact view controls on the canvas surface and map stats outside the canvas border', () => {
    const wrapper = mountStep({
      hexCount: 4,
      currentMapWidth: 2,
      currentMapHeight: 2,
      uniqueTerrainTypes: [{ ...terrainTypes[0], count: 4 }]
    })

    const canvasArea = wrapper.find('.map-builder-step__canvas-area')
    expect(canvasArea.find('.map-builder-step__canvas-options').exists()).toBe(false)
    expect(canvasArea.find('.map-builder-step__canvas-quick-controls').exists()).toBe(true)
    expect(canvasArea.find('.map-builder-step__canvas-zoom-controls').exists()).toBe(true)
    expect(canvasArea.find('.map-builder-step__canvas-quick-controls').find('.map-builder-step__zoom-btn').exists()).toBe(false)
    expect(canvasArea.find('.map-builder-step__canvas-zoom-controls').findAll('.map-builder-step__zoom-btn')).toHaveLength(2)
    expect(canvasArea.find('.map-builder-step__show-coordinates-input').exists()).toBe(true)
    expect(canvasArea.text()).toContain('Show coordinates')
    expect(canvasArea.text()).not.toContain('Coords')
    expect(canvasArea.text()).not.toContain('Map Zoom')
    expect(canvasArea.text()).not.toContain('Map stats')
    expect(canvasArea.text()).not.toContain('Terrain legend')

    const legend = wrapper.find('.map-builder-step__canvas-legend')
    expect(legend.exists()).toBe(true)
    expect(legend.text()).toContain('Map stats')
    expect(legend.text()).toContain('Terrain legend')
    expect(legend.text()).toContain('Plains')
    expect(legend.text()).toContain('(Count: 4, terrain difficulty: 0)')
    expect(legend.find('.map-builder-step__legend-meta').exists()).toBe(true)
  })

  it('does not render the map information block before a map exists', () => {
    const wrapper = mountStep({ hexCount: 0 })
    expect(wrapper.find('.map-builder-step__canvas-legend').exists()).toBe(false)
    expect(wrapper.find('.map-builder-step__canvas-quick-controls').exists()).toBe(true)
  })

  it('toggling Show Coordinates emits update:show-coordinates', async () => {
    const wrapper = mountStep()
    await wrapper.find('.map-builder-step__show-coordinates-input').setValue(true)
    expect(wrapper.emitted('update:show-coordinates')[0]).toEqual([true])
  })

  it('zoom buttons emit zoom-in / zoom-out', async () => {
    const wrapper = mountStep()
    const zoomButtons = wrapper.findAll('.map-builder-step__zoom-btn')
    await zoomButtons[0].trigger('click')
    await zoomButtons[1].trigger('click')
    expect(wrapper.emitted('zoom-out')).toBeTruthy()
    expect(wrapper.emitted('zoom-in')).toBeTruthy()
  })
})

describe('MapControlsPanel two-step editor', () => {
  it('renders generation controls by default and emits generate-map', async () => {
    const wrapper = mountStep()
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    expect(controls.find('.map-controls-panel__title').exists()).toBe(false)
    expect(controls.find('.map-controls-panel__tabs').exists()).toBe(true)
    expect(controls.find('.map-controls-panel__tab-index').exists()).toBe(false)
    expect(controls.findAll('.map-controls-panel__tab').map(tab => tab.text())).toEqual([
      'Map generation',
      'Manual adjustments'
    ])
    expect(controls.text()).toContain('Map generation')
    expect(controls.text()).not.toContain('Adjustment & spawn')
    expect(controls.text()).toContain('Map dimensions')
    expect(controls.text()).toContain('Terrain included in generator')
    const terrainGroup = controls.findAll('.map-controls-panel__group')
      .find(group => group.text().includes('Terrain included in generator'))
    expect(terrainGroup).toBeTruthy()
    expect(terrainGroup.find('.map-controls-panel__configure-terrain-btn').exists()).toBe(true)
    expect(terrainGroup.find('.map-controls-panel__generate-btn').exists()).toBe(false)
    const afterConfigure = controls.find('#map-controls-generation-panel').html()
      .split('Configure terrain')[1]
    expect(afterConfigure.split('Generate terrain')[0]).toContain('map-controls-panel__divider')

    await controls.find('.map-controls-panel__generate-btn').trigger('click')
    expect(wrapper.emitted('generate-map')).toBeTruthy()
  })

  it('renders seed lock controls on both map control tabs', async () => {
    const wrapper = mountStep({ hexCount: 4, terrainSeed: 'terrain-seed-1' })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    const generationSeed = controls.find('#map-controls-generation-panel .map-controls-panel__seed-input')
    expect(generationSeed.element.value).toBe('terrain-seed-1')
    let lockButton = controls.find('#map-controls-generation-panel .map-controls-panel__seed-lock-btn')
    expect(lockButton.attributes('aria-pressed')).toBe('false')
    await lockButton.trigger('click')
    expect(wrapper.emitted('update:terrain-seed-locked')[0]).toEqual([true])

    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')
    const adjustmentSeed = controls.find('#map-controls-adjustment-panel .map-controls-panel__seed-input')
    expect(adjustmentSeed.element.value).toBe('terrain-seed-1')
    lockButton = controls.find('#map-controls-adjustment-panel .map-controls-panel__seed-lock-btn')
    expect(lockButton.exists()).toBe(true)
  })

  it('auto-locks a manually committed terrain seed and keeps locked seed fields readonly', async () => {
    const wrapper = mountStep({ hexCount: 4, terrainSeed: '', terrainSeedLocked: false })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    const generationSeed = controls.find('#map-controls-generation-panel .map-controls-panel__seed-input')

    generationSeed.element.value = 'custom-seed-1'
    await generationSeed.trigger('input')

    expect(wrapper.emitted('update:terrain-seed').at(-1)).toEqual(['custom-seed-1'])
    expect(wrapper.emitted('update:terrain-seed-locked')).toBeUndefined()

    await generationSeed.trigger('change')

    expect(wrapper.emitted('update:terrain-seed').at(-1)).toEqual(['custom-seed-1'])
    expect(wrapper.emitted('update:terrain-seed-locked').at(-1)).toEqual([true])

    await wrapper.setProps({ terrainSeed: 'custom-seed-1', terrainSeedLocked: true })

    expect(generationSeed.attributes('readonly')).toBeDefined()
    expect(generationSeed.attributes('disabled')).toBeUndefined()

    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')
    const adjustmentSeed = controls.find('#map-controls-adjustment-panel .map-controls-panel__seed-input')
    expect(adjustmentSeed.attributes('readonly')).toBeDefined()
    expect(adjustmentSeed.attributes('disabled')).toBeUndefined()
  })

  it('commits dimension edits on Enter and blur', async () => {
    const wrapper = mountStep()
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    const inputs = controls.findAll('.map-controls-panel__number-input')

    expect(inputs[0].attributes('min')).toBe('4')
    expect(inputs[1].attributes('min')).toBe('4')

    await inputs[0].setValue('6')
    await inputs[0].trigger('keydown', { key: 'Enter' })
    await inputs[1].setValue('7')
    await inputs[1].trigger('blur')

    expect(wrapper.emitted('update:map-width').at(-1)).toEqual([6])
    expect(wrapper.emitted('update:map-height').at(-1)).toEqual([7])
    expect(wrapper.emitted('commit-map-dimensions')).toHaveLength(2)
  })

  it('clamps committed dimensions to a 4 cell minimum', async () => {
    const wrapper = mountStep()
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    const inputs = controls.findAll('.map-controls-panel__number-input')

    await inputs[0].setValue('2')
    await inputs[0].trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:map-width').at(-1)).toEqual([4])
    expect(wrapper.emitted('commit-map-dimensions')).toHaveLength(1)
  })

  it('shows terrain difficulty on generator and brush terrain cards', async () => {
    const wrapper = mountStep({ hexCount: 4, activeMapTool: 'terrain' })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    let difficultyLabels = controls.findAll('.map-controls-panel__terrain-difficulty')
      .map(label => label.text())
    expect(difficultyLabels).toEqual(['(0)', '(1)'])

    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')
    difficultyLabels = controls.findAll('.map-controls-panel__terrain-difficulty')
      .map(label => label.text())
    expect(difficultyLabels).toEqual(['(0)', '(1)'])
  })

  it('opens the terrain catalog dialog and forwards applied terrain changes', async () => {
    const wrapper = mountStep()
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    await controls.find('.map-controls-panel__configure-terrain-btn').trigger('click')
    const dialog = controls.findComponent({ name: 'TerrainCatalogDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Configure terrain')

    await dialog.find('.terrain-catalog-dialog__add-button').trigger('click')
    const nameInputs = dialog.findAll('input[aria-label="Terrain name"]')
    await nameInputs[nameInputs.length - 1].setValue('Lava')
    await dialog.find('.terrain-catalog-dialog__apply-button').trigger('click')

    const emitted = wrapper.emitted('update-terrain-types')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toEqual([
      expect.objectContaining({ id: 'plains', name: 'Plains', terrainDifficulty: 0 }),
      expect.objectContaining({ id: 'forest', name: 'Forest', terrainDifficulty: 1 }),
      expect.objectContaining({
        id: 'custom_terrain_3',
        name: 'Lava',
        terrainDifficulty: 1,
        generationWeight: 10
      })
    ])
  })

  it('syncs terrain labels.en_US when an existing terrain name is edited', async () => {
    const wrapper = mountStep({
      terrainTypes: [
        {
          id: 'plains',
          name: 'Plains',
          labels: { en_US: 'Old Plains', uk_UA: 'Rivnyna' },
          color: '#4CAF50',
          terrainDifficulty: 0
        },
        terrainTypes[1]
      ]
    })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    await controls.find('.map-controls-panel__configure-terrain-btn').trigger('click')
    const dialog = controls.findComponent({ name: 'TerrainCatalogDialog' })
    await dialog.find('input[aria-label="Terrain name"]').setValue('Open Plains')
    await dialog.find('.terrain-catalog-dialog__apply-button').trigger('click')

    const emitted = wrapper.emitted('update-terrain-types')
    expect(emitted[0][0][0]).toEqual(expect.objectContaining({
      id: 'plains',
      name: 'Open Plains',
      labels: {
        en_US: 'Open Plains',
        uk_UA: 'Rivnyna'
      }
    }))
  })

  it('uses roster-style inline number steppers in the terrain catalog with Shift-step support', async () => {
    const wrapper = mountStep()
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    await controls.find('.map-controls-panel__configure-terrain-btn').trigger('click')
    const dialog = controls.findComponent({ name: 'TerrainCatalogDialog' })
    expect(dialog.findAllComponents({ name: 'InlineNumberStepper' })).toHaveLength(4)

    await dialog.find('button[aria-label="Increase Terrain difficulty"]').trigger('click', { shiftKey: true })
    await dialog.find('.terrain-catalog-dialog__apply-button').trigger('click')

    const emitted = wrapper.emitted('update-terrain-types')
    expect(emitted[0][0][0]).toEqual(expect.objectContaining({
      id: 'plains',
      terrainDifficulty: 10
    }))
  })

  it('keeps the generation tab active when regenerating from Step 1', async () => {
    const wrapper = mountStep({ hexCount: 4 })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })

    expect(controls.vm.activeControlStep).toBe('generation')
    expect(controls.find('.map-controls-panel__generate-btn').text()).toBe('Regenerate terrain')
    expect(controls.find('.map-controls-panel__generate-btn svg').exists()).toBe(true)

    await controls.find('.map-controls-panel__generate-btn').trigger('click')

    expect(wrapper.emitted('generate-map')).toBeTruthy()
    expect(controls.vm.activeControlStep).toBe('generation')
  })

  it('disables the adjustment tab until a map exists', () => {
    const wrapper = mountStep({ hexCount: 0 })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    const tabs = controls.findAll('.map-controls-panel__tab')
    expect(tabs[1].attributes('disabled')).toBeDefined()
  })

  it('renders the editor toolbar in adjustment step and emits tool selection', async () => {
    const wrapper = mountStep({ hexCount: 4 })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    const tabs = controls.findAll('.map-controls-panel__tab')
    await tabs[1].trigger('click')

    const toolbar = controls.find('.map-controls-panel__tool-grid')
    expect(toolbar.exists()).toBe(true)
    const tools = controls.findAll('.map-controls-panel__tool')
    expect(tools).toHaveLength(4)
    expect(tools[0].classes()).toContain('map-controls-panel__tool--icon-only')
    expect(tools[0].text()).toBe('')
    expect(tools.slice(1).map(tool => tool.text())).toEqual(['Terrain', 'Spawn', 'Lock'])
    await tools[1].trigger('click')
    expect(wrapper.emitted('select-map-tool')[0]).toEqual(['terrain'])
  })

  it('does not render a divider between the editor toolbar and active tool panel', async () => {
    const wrapper = mountStep({ hexCount: 4, activeMapTool: 'terrain' })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')

    const betweenToolbarAndBrush = controls.html()
      .split('Editor tools')[1]
      .split('Terrain brush')[0]
    expect(betweenToolbarAndBrush).not.toContain('map-controls-panel__divider')
  })

  it('shows deployment anchors and the clear-all action for the deployment tool', async () => {
    const wrapper = mountStep({
      hexCount: 4,
      activeMapTool: 'deployment',
      deploymentAnchorCount: 2,
      clearableDeploymentAnchorCount: 2
    })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')

    const anchorButtons = controls.findAll('.map-controls-panel__anchor')
    expect(anchorButtons).toHaveLength(overlayTypes.length)
    const groupTitles = controls.findAll('.map-controls-panel__anchor-group-title')
      .map(title => title.text())
    expect(groupTitles).toEqual(['Player', 'Enemy'])
    expect(anchorButtons.map(button => button.text())).toEqual([
      'Spawn point',
      'Base',
      'Spawn point',
      'Base'
    ])
    await anchorButtons[0].trigger('click')
    expect(wrapper.emitted('select-overlay')[0][0].id).toBe(overlayTypes[0].id)

    expect(controls.text()).toContain('Anchors placed: 2')
    const clearButton = controls.find('.map-controls-panel__text-btn')
    expect(clearButton.text()).toBe('Clear all')
    await clearButton.trigger('click')
    expect(wrapper.emitted('clear-deployment-anchors')).toBeTruthy()
  })

  it('shows lock actions for the lock tool', async () => {
    const wrapper = mountStep({
      hexCount: 4,
      activeMapTool: 'lock',
      lockedHexCount: 2
    })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')

    expect(controls.text()).toContain('Locked tiles: 2')
    const lockActions = controls.findAll('.map-controls-panel__lock-action')
    await lockActions[1].trigger('click')
    expect(wrapper.emitted('select-lock-brush-mode')[0]).toEqual(['unlock'])

    await controls.find('.map-controls-panel__text-btn').trigger('click')
    expect(wrapper.emitted('unlock-all-hexes')).toBeTruthy()
  })

  it('keeps Protect deployment terrain as a checkbox in adjustment step', async () => {
    const wrapper = mountStep({ hexCount: 4 })
    const controls = wrapper.findComponent({ name: 'MapControlsPanel' })
    await controls.findAll('.map-controls-panel__tab')[1].trigger('click')

    const checkbox = controls.find('.map-controls-panel__checkbox-input')
    expect(checkbox.exists()).toBe(true)
    await checkbox.setValue(false)
    expect(wrapper.emitted('update:protect-deployment-terrain')[0]).toEqual([false])
  })
})
