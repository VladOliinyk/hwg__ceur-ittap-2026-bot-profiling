// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionBlock from '../SelectionBlock.vue'

const panelStub = {
  name: 'SelectionInspectorPanel',
  props: [
    'selectedHex',
    'selectedUnit',
    'showFloatingPanel',
    'actionsRemaining',
    'isLoaded',
    'canMoveForward',
    'canMoveReverse',
    'validAttackTargets',
    'selectedTargetIndex',
    'canFire',
    'canReload',
    'actionsDisabled'
  ],
  emits: [
    'deselect',
    'update:showFloatingPanel',
    'move-unit-forward',
    'move-unit-reverse',
    'rotate-unit-clockwise',
    'rotate-unit-counterclockwise',
    'fire',
    'reload',
    'attack-target-shift'
  ],
  template: '<div data-testid="selection-inspector-stub" />'
}

function mountSelectionBlock(props = {}) {
  return mount(SelectionBlock, {
    props,
    global: {
      stubs: {
        SelectionInspectorPanel: panelStub
      }
    }
  })
}

describe('SelectionBlock', () => {
  it('derives selected unit state from the selected hex and gameState', () => {
    const unit = { id: 'u1', player: 'player1' }
    const selectedHex = { q: 2, r: 3, terrain: { name: 'Plains' } }
    const gameState = {
      turnState: { u1: { actionsRemaining: 2, isLoaded: true } },
      getHex(q, r) {
        return q === 2 && r === 3 ? { unit } : null
      }
    }

    const wrapper = mountSelectionBlock({
      selectedHex,
      gameState,
      selectionInspectorBridge: {
        canMoveReverse: false,
        canMoveForward: false,
        validAttackTargets: [{ q: 4, r: 3 }],
        selectedTargetIndex: 0,
        canFire: true,
        canReload: false
      },
      actionsDisabled: true
    })

    const panel = wrapper.findComponent({ name: 'SelectionInspectorPanel' })
    expect(panel.props('selectedHex')).toEqual(selectedHex)
    expect(panel.props('selectedUnit')).toEqual(unit)
    expect(panel.props('actionsRemaining')).toBe(2)
    expect(panel.props('isLoaded')).toBe(true)
    expect(panel.props('canMoveForward')).toBe(false)
    expect(panel.props('canMoveReverse')).toBe(false)
    expect(panel.props('canFire')).toBe(true)
    expect(panel.props('canReload')).toBe(false)
    expect(panel.props('actionsDisabled')).toBe(true)
  })

  it('forwards inspector action events to the playground', async () => {
    const wrapper = mountSelectionBlock({
      selectedHex: { q: 0, r: 0, terrain: { name: 'Plains' } },
      gameState: { turnState: {}, getHex: () => null }
    })
    const panel = wrapper.findComponent({ name: 'SelectionInspectorPanel' })

    await panel.vm.$emit('move-unit-forward')
    await panel.vm.$emit('attack-target-shift', 1)
    await panel.vm.$emit('update:showFloatingPanel', false)

    expect(wrapper.emitted('move-unit-forward')).toHaveLength(1)
    expect(wrapper.emitted('attack-target-shift')).toEqual([[1]])
    expect(wrapper.emitted('update:showFloatingPanel')).toEqual([[false]])
  })
})
