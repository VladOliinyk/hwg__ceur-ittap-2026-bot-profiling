// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TerrainLegendBlock from '../TerrainLegendBlock.vue'

function mountLegend(props = {}) {
  return mount(TerrainLegendBlock, {
    props: {
      terrainTypes: [
        {
          id: 'plains',
          name: 'Plains',
          labels: { en_US: 'Open Plains' },
          color: '#8BC34A',
          terrainDifficulty: 0
        },
        {
          id: 'forest',
          name: 'Forest',
          color: '#2E7D32',
          terrainDifficulty: 2
        },
        {
          id: 'water',
          name: 'Water',
          color: '#2196F3',
          terrainDifficulty: 3
        }
      ],
      hexes: [
        { q: 0, r: 0, terrain: 'plains' },
        { q: 1, r: 0, terrain: { id: 'plains' } },
        ['0,1', { q: 0, r: 1, terrain: { id: 'forest' } }]
      ],
      ...props
    },
    global: {
      mocks: {
        $i18n: { locale: 'en_US' },
        $tf: (key, fallback, params = {}) => {
          if (key === 'levelBuilder.mapBuilder.terrainLegend') return 'Terrain legend'
          if (key === 'levelBuilder.mapBuilder.terrainLegendMeta') {
            return `(Count: ${params.count}, terrain difficulty: ${params.difficulty})`
          }
          return fallback
        }
      }
    }
  })
}

describe('TerrainLegendBlock', () => {
  it('counts terrain from map hexes and renders package labels with difficulty', () => {
    const wrapper = mountLegend()

    expect(wrapper.text()).toContain('Terrain legend')
    expect(wrapper.text()).toContain('Open Plains')
    expect(wrapper.text()).toContain('(Count: 2, terrain difficulty: 0)')
    expect(wrapper.text()).toContain('Forest')
    expect(wrapper.text()).toContain('(Count: 1, terrain difficulty: 2)')
    expect(wrapper.text()).not.toContain('Water')
  })

  it('can keep a selected empty terrain visible', () => {
    const wrapper = mountLegend({ selectedTerrainId: 'water' })

    expect(wrapper.text()).toContain('Water')
    expect(wrapper.text()).toContain('(Count: 0, terrain difficulty: 3)')
    expect(wrapper.find('.terrain-legend-block__item--selected').text()).toContain('Water')
  })
})
