// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionInspectorPanel from '../SelectionInspectorPanel.vue'

function mountPanel(props = {}) {
  return mount(SelectionInspectorPanel, {
    props: {
      selectedHex: { q: 1, r: 2, terrain: { name: 'Plains' } },
      selectedUnit: { id: 'u1', type: 'infantry', player: 'player1' },
      showFloatingPanel: true,
      ...props
    },
    global: {
      stubs: {
        UnitInfoFields: true
      }
    }
  })
}

function findButtonByText(wrapper, text) {
  return wrapper.findAll('button').find(button => button.text().includes(text))
}

describe('SelectionInspectorPanel movement actions', () => {
  it('keeps actions, keyboard hints, and floating toggle visible by default', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('Move forward')
    expect(wrapper.text()).toContain('Keyboard controls')
    expect(wrapper.text()).toContain('Show detached panel')
  })

  it('renders terrain display labels from package labels', () => {
    const wrapper = mountPanel({
      selectedHex: {
        q: 1,
        r: 2,
        terrain: {
          id: 'plains',
          name: 'Plains',
          labels: { en_US: 'Open Plains' }
        }
      }
    })

    expect(wrapper.text()).toContain('Open Plains')
  })

  it('disables forward movement when canMoveForward is false', () => {
    const wrapper = mountPanel({ canMoveForward: false })
    const button = findButtonByText(wrapper, 'Move forward')

    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('enables forward movement when canMoveForward is true', () => {
    const wrapper = mountPanel({ canMoveForward: true })
    const button = findButtonByText(wrapper, 'Move forward')

    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('hides unit actions and keyboard hints for read-only inspection', () => {
    const wrapper = mountPanel({
      showActions: false,
      showKeyboardHints: false
    })

    expect(wrapper.text()).not.toContain('Move forward')
    expect(wrapper.text()).not.toContain('Fire')
    expect(wrapper.text()).not.toContain('Keyboard controls')
  })

  it('can hide keyboard hints while keeping action buttons visible', () => {
    const wrapper = mountPanel({
      showKeyboardHints: false,
      canMoveForward: true
    })

    expect(findButtonByText(wrapper, 'Move forward').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Keyboard controls')
  })

  it('can hide the floating panel toggle without hiding deselect', () => {
    const wrapper = mountPanel({ showFloatingToggle: false })

    expect(wrapper.text()).toContain('Deselect')
    expect(wrapper.text()).not.toContain('Show detached panel')
  })
})
