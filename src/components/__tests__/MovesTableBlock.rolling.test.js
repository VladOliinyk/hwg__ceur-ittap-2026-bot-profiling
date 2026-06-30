// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MovesTableBlock from '../MovesTableBlock.vue'

function diceRows(label) {
  return Array.from({ length: 6 }, (_, index) => [`${label}-${index + 1}`])
}

function makeMovesData() {
  return {
    Our_operations: [
      { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: diceRows('move') }] },
      { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: diceRows('fire') }] }
    ],
    Enemy_operations: [
      { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: diceRows('enemy-move') }] },
      { title: 'ATTACK', moves: [{ title: 'x1 dice', dice: diceRows('enemy-fire') }] }
    ]
  }
}

function makeGameState({ player = 'player1', roll = null } = {}) {
  return {
    currentPlayer: player,
    currentTurnActions: roll == null ? [] : [{ type: 'dice_roll', result: roll }],
    getCurrentDiceResult: vi.fn(() => roll)
  }
}

function highlightedRows(wrapper) {
  return wrapper
    .findAll('.turntable-table__row')
    .filter(row => row.attributes('data-is-highlighted') === 'true')
}

function realActionChips(section) {
  return section
    .findAll('.turntable-action-chip')
    .filter(chip => !chip.classes('turntable-action-chip--empty'))
}

describe('MovesTableBlock D6 row highlighting', () => {
  it('renders player actions as plain chips and enemy actions as indexed priority chips', async () => {
    const wrapper = mount(MovesTableBlock, {
      props: {
        movesData: {
          Our_operations: [
            { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['move', 'turn'], [], [], [], [], []] }] }
          ],
          Enemy_operations: [
            { title: 'MANOEUVRE', moves: [{ title: 'x1 dice', dice: [['turn', 'move'], [], [], [], [], []] }] }
          ]
        },
        gameState: makeGameState({ player: 'player1' })
      }
    })

    await nextTick()

    const sections = wrapper.findAll('.turntable-side')
    const playerChips = realActionChips(sections[0])
    expect(playerChips.map(chip => chip.find('.turntable-action-chip__label').text())).toEqual(['move', 'turn'])
    expect(sections[0].findAll('.turntable-action-chip__priority')).toHaveLength(0)
    expect(sections[0].findAll('.turntable-action-chip--empty')).toHaveLength(5)
    expect(sections[0].find('.turntable-action-chip--empty .turntable-action-chip__empty-indicator').exists()).toBe(true)

    const enemyChips = realActionChips(sections[1])
    expect(enemyChips.map(chip => chip.find('.turntable-action-chip__label').text())).toEqual(['turn', 'move'])
    expect(sections[1].findAll('.turntable-action-chip__priority').map(node => node.text())).toEqual(['1', '2'])
    expect(sections[1].findAll('.turntable-action-chip--empty')).toHaveLength(5)

    wrapper.unmount()
  })

  it('does not highlight table rows while dice is rolling and highlights the final D6 row', async () => {
    const wrapper = mount(MovesTableBlock, {
      props: {
        movesData: makeMovesData(),
        gameState: makeGameState({ player: 'player2' }),
        isDiceRolling: true
      }
    })

    await nextTick()

    const sections = wrapper.findAll('.turntable-side')
    expect(sections[0].attributes('data-is-rolling')).toBe('false')
    expect(sections[1].attributes('data-is-rolling')).toBe('true')
    expect(highlightedRows(wrapper)).toHaveLength(0)

    await wrapper.setProps({
      isDiceRolling: false,
      gameState: makeGameState({ player: 'player2', roll: 5 })
    })
    await nextTick()

    expect(highlightedRows(wrapper)).toHaveLength(1)
    expect(highlightedRows(wrapper)[0].attributes('data-highlight-state')).toBe('result')
    expect(highlightedRows(wrapper)[0].text()).toContain('d5')

    expect(
      sections[0].findAll('.turntable-table__row').map(row => row.attributes('data-highlight-state'))
    ).toEqual(['none', 'none', 'none', 'none', 'none', 'none'])
    expect(
      sections[1].findAll('.turntable-table__row').map(row => row.attributes('data-highlight-state'))
    ).toEqual(['inactive', 'inactive', 'inactive', 'inactive', 'result', 'inactive'])

    wrapper.unmount()
  })
})
