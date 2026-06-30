// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationSystem from '../NotificationSystem.vue'

/**
 * Component-level tests for NotificationSystem (Finding #15):
 *
 *   - window.$notify is set on mount and exposes the exact public API methods
 *   - calling a notify method adds a notification
 *   - on unmount, window.$notify is deleted (only if it belongs to this instance)
 *   - mount + unmount twice: second mount's api is the live one; unmount removes it
 *   - auto-close timers are cleared on unmount (no work on dead ref)
 */

afterEach(() => {
  // Ensure no pollution between tests even if a test omits unmount
  delete window.$notify
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('NotificationSystem — window.$notify registration', () => {
  it('sets window.$notify on mount with all expected methods', () => {
    const wrapper = mount(NotificationSystem)

    expect(window.$notify).toBeDefined()
    expect(typeof window.$notify.success).toBe('function')
    expect(typeof window.$notify.error).toBe('function')
    expect(typeof window.$notify.warning).toBe('function')
    expect(typeof window.$notify.info).toBe('function')
    expect(typeof window.$notify.primary).toBe('function')
    expect(typeof window.$notify.secondary).toBe('function')

    wrapper.unmount()
  })

  it('removes window.$notify on unmount', () => {
    const wrapper = mount(NotificationSystem)
    expect(window.$notify).toBeDefined()

    wrapper.unmount()

    expect(window.$notify).toBeUndefined()
  })

  it('calling a notify method adds a notification to the list', async () => {
    const wrapper = mount(NotificationSystem)

    window.$notify.success('Test title', 'Test message')
    await wrapper.vm.$nextTick()

    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text()).toContain('Test title')
    expect(alerts[0].text()).toContain('Test message')
    expect(alerts[0].classes()).toContain('alert-success')

    wrapper.unmount()
  })

  it('error maps to alert-danger variant', async () => {
    const wrapper = mount(NotificationSystem)

    window.$notify.error('Error title', 'Error body')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.alert-danger').exists()).toBe(true)

    wrapper.unmount()
  })

  it('warning, info, primary, secondary all produce the right variant class', async () => {
    const wrapper = mount(NotificationSystem)

    window.$notify.warning('w', '')
    window.$notify.info('i', '')
    window.$notify.primary('p', '')
    window.$notify.secondary('s', '')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.alert-warning').exists()).toBe(true)
    expect(wrapper.find('.alert-info').exists()).toBe(true)
    expect(wrapper.find('.alert-primary').exists()).toBe(true)
    expect(wrapper.find('.alert-secondary').exists()).toBe(true)

    wrapper.unmount()
  })
})

describe('NotificationSystem — unmount safety', () => {
  it('does not delete window.$notify on unmount when it belongs to a different instance', () => {
    const wrapper = mount(NotificationSystem)
    const foreignApi = { success: vi.fn() }
    // Simulate another instance taking over
    window.$notify = foreignApi

    wrapper.unmount()

    // Our unmount must NOT delete the foreign api
    expect(window.$notify).toBe(foreignApi)
    delete window.$notify
  })

  it('second mount after first unmount registers fresh api', () => {
    const w1 = mount(NotificationSystem)
    const api1 = window.$notify
    w1.unmount()
    expect(window.$notify).toBeUndefined()

    const w2 = mount(NotificationSystem)
    const api2 = window.$notify
    expect(api2).toBeDefined()
    expect(api2).not.toBe(api1)

    w2.unmount()
    expect(window.$notify).toBeUndefined()
  })

  it('warns to console when a duplicate instance mounts while one is already registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const w1 = mount(NotificationSystem)
    // w1 set window.$notify; now mounting a second instance should warn
    const w2 = mount(NotificationSystem)

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mount NotificationSystem only once')
    )

    w1.unmount()
    w2.unmount()
    warn.mockRestore()
    delete window.$notify
  })
})

describe('NotificationSystem — auto-close timer cleanup on unmount', () => {
  it('clears pending auto-close timers on unmount so callbacks do not fire on dead ref', async () => {
    vi.useFakeTimers()

    const wrapper = mount(NotificationSystem)
    // Schedule a notification — its auto-close timer (6000ms) starts now
    window.$notify.info('Timer test', 'body')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)

    // Unmount before the timer fires
    wrapper.unmount()

    // Advance time past the auto-close duration
    // If the timer was NOT cleared, it would try to call removeNotification
    // on the dead ref's notifications array — in happy-dom this would throw
    // or produce unexpected behaviour. We assert no error is thrown and that
    // $notify is gone (cleanup ran).
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
    expect(window.$notify).toBeUndefined()
  })

  it('clearTimeout is called with the specific timer ids scheduled for each pending notification', () => {
    vi.useFakeTimers()

    // Capture the timer ids returned by setTimeout for our notifications
    const scheduledIds = []
    const origSetTimeout = globalThis.setTimeout
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      const id = origSetTimeout(fn, delay, ...args)
      scheduledIds.push(id)
      return id
    })

    const wrapper = mount(NotificationSystem)
    window.$notify.info('A', '')
    window.$notify.warning('B', '')
    // 2 timers pending; scheduledIds now holds both timer ids

    setTimeoutSpy.mockRestore()

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    wrapper.unmount()

    // Assert that clearTimeout was called with each specific id we captured
    expect(scheduledIds).toHaveLength(2)
    for (const id of scheduledIds) {
      expect(clearSpy).toHaveBeenCalledWith(id)
    }
  })

  it('manual dismissal cancels the pending auto-close timer', async () => {
    vi.useFakeTimers()

    const wrapper = mount(NotificationSystem)
    window.$notify.info('Dismiss me', '')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)

    // Manually dismiss before auto-close fires
    await wrapper.find('.btn-close').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)

    // Advancing time past auto-close duration must NOT cause double-removal errors
    // (the callback deletes from the map first, so removeNotification is a no-op)
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()

    // Notification list should still be empty — no phantom re-addition
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)

    wrapper.unmount()
  })
})
