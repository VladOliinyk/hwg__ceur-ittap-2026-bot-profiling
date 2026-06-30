// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GameEngineBlock from '../GameEngineBlock.vue'
import { DEFAULT_TERRAIN_COLORS, TERRAIN_COLOR_UNKNOWN } from '../../utils/terrainColors.js'

vi.mock('@/assets/dice_animation/dice0.svg', () => ({ default: 'dice0.svg' }))
vi.mock('@/assets/dice_animation/dice1.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice2.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice3.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice4.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice5.json', () => ({ default: {} }))
vi.mock('@/assets/dice_animation/dice6.json', () => ({ default: {} }))

function makePackageWithTerrain({ terrainTypes = [], hexes = [] } = {}) {
  return {
    id: 'level_test',
    terrain: { terrainTypes },
    hexmap: {
      parameters: { width: 2, height: 1 },
      map: hexes.length
        ? hexes
        : [
            { q: 0, r: 0, terrain: 'water' },
            { q: 1, r: 0, terrain: 'grass' }
          ]
    }
  }
}

function mountEngine(props = {}) {
  return mount(GameEngineBlock, {
    props: {
      gameState: null,
      mapData: null,
      levelOptions: [{ id: 'level_test', label: 'level_test', source: 'default' }],
      selectedLevelId: 'level_test',
      seed: 'level_test-seed-1',
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

describe('GameEngineBlock terrain legend colors (#47)', () => {
  it('uses the package-defined color for water when package overrides it', () => {
    const pkg = makePackageWithTerrain({
      terrainTypes: [{ id: 'water', color: '#0000FF', name: 'Water' }]
    })
    const wrapper = mountEngine({ loadedPackage: pkg })

    // getTerrainColor must return package color, not the default
    expect(wrapper.vm.getTerrainColor('water')).toBe('#0000FF')
    expect(wrapper.vm.getTerrainColor('water')).not.toBe(DEFAULT_TERRAIN_COLORS.water)
  })

  it('falls back to DEFAULT_TERRAIN_COLORS when terrain id not in package', () => {
    const pkg = makePackageWithTerrain({
      terrainTypes: [{ id: 'water', color: '#0000FF', name: 'Water' }]
    })
    const wrapper = mountEngine({ loadedPackage: pkg })

    // 'grass' not in package terrainTypes → default
    expect(wrapper.vm.getTerrainColor('grass')).toBe(DEFAULT_TERRAIN_COLORS.grass)
  })

  it('falls back to TERRAIN_COLOR_UNKNOWN for a totally unknown terrain id', () => {
    const pkg = makePackageWithTerrain({ terrainTypes: [] })
    const wrapper = mountEngine({ loadedPackage: pkg })
    expect(wrapper.vm.getTerrainColor('volcano')).toBe(TERRAIN_COLOR_UNKNOWN)
  })

  it('falls back to DEFAULT when loadedPackage has no terrain section', () => {
    const pkg = { id: 'level_test', hexmap: { parameters: { width: 1, height: 1 }, map: [] } }
    const wrapper = mountEngine({ loadedPackage: pkg })
    expect(wrapper.vm.getTerrainColor('forest')).toBe(DEFAULT_TERRAIN_COLORS.forest)
  })

  it('terrainLegend computed uses package color (legend matches map source)', () => {
    // This is the core divergence the finding describes:
    // before the fix GEB legend ignored package color → legend ≠ map.
    // After the fix both use resolveTerrainColor with package types.
    const hexes = [
      { q: 0, r: 0, terrain: 'water' },
      { q: 1, r: 0, terrain: 'water' }
    ]
    const pkg = makePackageWithTerrain({
      terrainTypes: [{ id: 'water', color: '#AABBCC', name: 'Water' }],
      hexes
    })
    // Pass hexmap as mapData prop so terrainLegend computed can iterate hexes
    const wrapper = mountEngine({ loadedPackage: pkg, mapData: pkg.hexmap })

    const legend = wrapper.vm.terrainLegend
    expect(legend.length).toBeGreaterThan(0)
    const waterEntry = legend.find(e => e.id === 'water')
    expect(waterEntry).toBeDefined()
    expect(waterEntry.color).toBe('#AABBCC')
  })
})
