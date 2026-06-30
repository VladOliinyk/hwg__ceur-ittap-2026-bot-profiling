// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import TurntableBuilderStep from '../TurntableBuilderStep.vue'

function mountStep(overrides = {}) {
  const baseProps = {
    turntableData: null,
    redBaseAvailable: true,
    blueBaseAvailable: true,
    victoryConditionSettings: {
      type: 'eliminateUnits',
      deadlineEnabled: false,
      deadlineTurns: 10
    },
    ...overrides
  }
  return mount(TurntableBuilderStep, { props: baseProps })
}

describe('TurntableBuilderStep · victory conditions', () => {
  it('renders the primary objective panel before the turntable sides and shortcuts', () => {
    const wrapper = mountStep({
      victoryConditionSettings: {
        type: 'surviveTurns',
        deadlineEnabled: true,
        deadlineTurns: 7
      }
    })

    expect(wrapper.text()).toContain('Victory conditions')
    expect(wrapper.text()).toContain('Destroy all enemy units')
    expect(wrapper.text()).toContain('Occupy enemy base')
    expect(wrapper.text()).toContain('Team Red preview')

    const markup = wrapper.html()
    expect(markup.indexOf('turntable-builder-step__victory-panel')).toBeLessThan(
      markup.indexOf('turntable-builder-step__sides')
    )
    expect(markup.indexOf('turntable-builder-step__victory-panel')).toBeLessThan(
      markup.indexOf('turntable-workflow-panel')
    )

    const deadlineInput = wrapper.find('input[aria-label="Deadline turns"]')
    expect(deadlineInput.element.value).toBe('7')

    const select = wrapper.find('select')
    expect(select.element.value).toBe('surviveTurns')
  })

  it('emits update-victory-condition when changing the objective type', async () => {
    const wrapper = mountStep()
    const select = wrapper.find('select')

    await select.setValue('occupyBase')
    expect(wrapper.emitted('update-victory-condition')[0]).toEqual([
      { key: 'type', value: 'occupyBase' }
    ])
  })

  it('emits the deadline turn count when stepping up', async () => {
    const wrapper = mountStep({
      victoryConditionSettings: {
        type: 'surviveTurns',
        deadlineEnabled: true,
        deadlineTurns: 7
      }
    })

    const increment = wrapper.findAll('.turntable-builder-step__survive-stepper button')[1]
    await increment.trigger('click')
    expect(wrapper.emitted('update-victory-condition')[0]).toEqual([
      { key: 'deadlineTurns', deadlineTurns: 8 }
    ])
  })

  it('disables base objectives until their base exists', () => {
    const wrapper = mountStep({
      redBaseAvailable: false,
      blueBaseAvailable: false
    })

    expect(wrapper.text()).toContain('Place a Team Red base')
    expect(wrapper.text()).toContain('Place a Team Blue base')
    const options = wrapper.findAll('option')
    expect(options.find(option => option.element.value === 'occupyBase').attributes('disabled')).toBeDefined()
    expect(options.find(option => option.element.value === 'protectBase').attributes('disabled')).toBeDefined()
  })

  it('requires the deadline switch for survive/protect objectives', () => {
    const wrapper = mountStep({
      victoryConditionSettings: {
        type: 'surviveTurns',
        deadlineEnabled: true,
        deadlineTurns: 10
      }
    })

    const deadlineSwitch = wrapper.find('.turntable-builder-step__victory-switch-input')
    expect(deadlineSwitch.attributes('disabled')).toBeDefined()
    expect(deadlineSwitch.element.checked).toBe(true)
  })
})
