// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AutomatedPlaytestPanel from '../AutomatedPlaytestPanel.vue'

function mountPanel(overrides = {}) {
  return mount(AutomatedPlaytestPanel, {
    props: {
      config: {
        seed: 'seed-1',
        maxTurns: 100,
        players: {
          player1: { profile: 'balanced' },
          player2: { profile: 'defensive' }
        },
        trace: true
      },
      result: null,
      error: '',
      running: false,
      traceAvailable: false,
      ...overrides
    },
    global: {
      mocks: {
        $t: key => key
      }
    }
  })
}

describe('AutomatedPlaytestPanel', () => {
  it('emits a player profile update', async () => {
    const wrapper = mountPanel()

    await wrapper.findAll('select')[0].setValue('aggressive')

    expect(wrapper.emitted('update-config')[0][0]).toEqual({
      players: {
        player1: { profile: 'aggressive' },
        player2: { profile: 'defensive' }
      }
    })
  })

  it('clamps maxTurns and forwards run/open actions', async () => {
    const wrapper = mountPanel({ traceAvailable: true })
    const maxTurnsInput = wrapper.find('input[type="number"]')

    await maxTurnsInput.setValue('1200')
    const actionButtons = wrapper.findAll('.automated-playtest__actions button')
    await actionButtons[0].trigger('click')
    await actionButtons[1].trigger('click')

    expect(wrapper.emitted('update-config')[0][0]).toEqual({ maxTurns: 999 })
    expect(wrapper.emitted('run-match')).toHaveLength(1)
    expect(wrapper.emitted('open-playback')).toHaveLength(1)
  })

  it('reflects the seedLocked prop on the seed input readonly state', () => {
    const unlocked = mountPanel({ seedLocked: false })
    expect(unlocked.find('.automated-playtest__seed-input').attributes('readonly')).toBeUndefined()

    const locked = mountPanel({ seedLocked: true })
    expect(locked.find('.automated-playtest__seed-input').attributes('readonly')).toBeDefined()
  })

  it('emits toggle-seed-lock when the lock button is clicked', async () => {
    const wrapper = mountPanel()

    await wrapper.find('.automated-playtest__seed-lock').trigger('click')

    expect(wrapper.emitted('toggle-seed-lock')).toHaveLength(1)
  })

  it('emits commit-seed with the value on change and on Enter', async () => {
    const wrapper = mountPanel()
    const seedInput = wrapper.find('.automated-playtest__seed-input')

    // Set the DOM value directly so we can trigger `input`, `change`, and
    // `keydown.enter` independently (setValue would also dispatch its own
    // change event, conflating the explicit commit triggers under test).
    seedInput.element.value = 'locked-seed'
    await seedInput.trigger('input')
    await seedInput.trigger('change')
    await seedInput.trigger('keydown.enter')

    const commits = wrapper.emitted('commit-seed')
    expect(commits).toHaveLength(2)
    expect(commits[0][0]).toBe('locked-seed')
    expect(commits[1][0]).toBe('locked-seed')
    // Live typing still flows through update-config so the parent can mirror it.
    expect(wrapper.emitted('update-config').some(([patch]) => patch.seed === 'locked-seed')).toBe(true)
  })

  it('seedLockButtonLabel switches with the seedLocked prop', () => {
    const unlocked = mountPanel({ seedLocked: false })
    expect(unlocked.vm.seedLockButtonLabel).toBe('levelBuilder.automatedPlaytest.lockSeed')

    const locked = mountPanel({ seedLocked: true })
    expect(locked.vm.seedLockButtonLabel).toBe('levelBuilder.automatedPlaytest.unlockSeed')
  })
})
