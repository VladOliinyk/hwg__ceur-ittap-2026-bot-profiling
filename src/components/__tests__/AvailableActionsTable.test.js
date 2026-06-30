// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AvailableActionsTable from '../AvailableActionsTable.vue'

const operations = [
  {
    id: 'manoeuvre',
    title: 'manoeuvre',
    moves: [
      {
        id: 'm1',
        title: '-',
        dice: [['move'], ['turn'], ['move', 'reverse'], ['turn'], ['reverse'], ['move']]
      }
    ]
  },
  {
    id: 'attack',
    title: 'attack',
    moves: [
      {
        id: 'm2',
        title: '-',
        dice: [['fire'], ['reload'], [], ['fire'], [], ['fire', 'reload']]
      }
    ]
  }
]

function mountTable(props = {}) {
  return mount(AvailableActionsTable, {
    props: {
      operations,
      diceIndex: 2,
      diceLabel: 'd3',
      currentPlayer: 'player1',
      showPriority: false,
      ariaLabel: 'Available actions for d3',
      ...props
    },
    global: {
      mocks: { $t: key => (key === 'common.d6' ? 'd6' : key) }
    }
  })
}

describe('AvailableActionsTable', () => {
  it('renders the d6 header row and one operation column per operation', () => {
    const wrapper = mountTable()

    const headers = wrapper.findAll('thead th').map(th => th.text())
    expect(headers).toEqual(['d6', 'Manoeuvre', 'Attack'])

    const table = wrapper.find('.engine-available-actions-table')
    expect(table.attributes('data-current-player')).toBe('player1')
    expect(table.attributes('aria-label')).toBe('Available actions for d3')
  })

  it('renders the dice label row header and one cell per operation', () => {
    const wrapper = mountTable()

    expect(wrapper.find('.engine-available-actions-table__face').text()).toBe('d3')
    expect(wrapper.findAll('tbody td')).toHaveLength(2)
  })

  it('renders action chips for the selected dice index', () => {
    const wrapper = mountTable({ diceIndex: 2 })
    // dice index 2 => manoeuvre: ['move','reverse'], attack: [] (empty cell).
    const chips = wrapper.findAll('.engine-available-action-chip:not(.engine-available-action-chip--empty) .engine-available-action-chip__label')
    expect(chips.map(chip => chip.text())).toEqual(['move', 'reverse'])

    const empty = wrapper.findAll('.engine-available-action-chip--empty')
    expect(empty).toHaveLength(1)
    expect(empty[0].text()).toBe('-')
  })

  it('omits the empty-cell aria-label by default (AutomatedPlayground behavior)', () => {
    const wrapper = mountTable({ diceIndex: 2 })
    const empty = wrapper.find('.engine-available-action-chip--empty')
    expect(empty.attributes('aria-label')).toBeUndefined()
  })

  it('applies the empty-cell aria-label when provided (GameEngineBlock behavior)', () => {
    const wrapper = mountTable({ diceIndex: 2, emptyActionLabel: 'No action available' })
    const empty = wrapper.find('.engine-available-action-chip--empty')
    expect(empty.attributes('aria-label')).toBe('No action available')
  })

  it('numbers chips by priority when showPriority is true', () => {
    // dice index 5 => attack: ['fire','reload'] gives two prioritized chips.
    const wrapper = mountTable({ diceIndex: 5, showPriority: true })
    const priorities = wrapper.findAll('.engine-available-action-chip__priority').map(node => node.text())
    expect(priorities).toContain('1')
    expect(priorities).toContain('2')
    const prioritized = wrapper.find('.engine-available-action-chip[data-priority="1"]')
    expect(prioritized.exists()).toBe(true)
  })

  it('shows per-move surface titles when an operation has multiple moves', () => {
    const multiMove = [
      {
        id: 'op',
        title: 'combo',
        moves: [
          { id: 'a', title: 'Drive', dice: [['move']] },
          { id: 'b', title: 'Spin', dice: [['turn']] }
        ]
      }
    ]
    const wrapper = mountTable({ operations: multiMove, diceIndex: 0 })
    const surfaces = wrapper.findAll('.engine-available-action-surface').map(node => node.text())
    expect(surfaces).toEqual(['Drive', 'Spin'])
  })
})
