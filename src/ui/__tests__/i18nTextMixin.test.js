// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18nTextMixin } from '../i18nTextMixin.js'

/**
 * Focused tests for the shared i18n-fallback mixin (Finding #49).
 *
 * The canonical behavior is taken from Playground.vue (the most-correct copy):
 *  - uiText tries $tf, then $t, validating the result is a usable string,
 *    otherwise returns the fallback.
 *  - uiFormat is an alias of uiText.
 *  - notificationText normalizes a value for notification bodies.
 *  - notifyUser dispatches through window.$notify and reports whether it fired.
 *
 * The broader safety net is that all ~10 components' own suites stay green.
 */

const Host = {
  name: 'I18nMixinHost',
  mixins: [i18nTextMixin],
  template: '<div />'
}

function mountHost(mocks = {}) {
  return mount(Host, { global: { mocks } })
}

afterEach(() => {
  delete window.$notify
  vi.restoreAllMocks()
})

describe('i18nTextMixin.uiText', () => {
  it('returns the $tf translation when it yields a string', () => {
    const $tf = vi.fn((key, fallback) => (key === 'present.key' ? 'Translated' : fallback))
    const vm = mountHost({ $tf }).vm

    expect(vm.uiText('present.key', 'Fallback')).toBe('Translated')
    expect($tf).toHaveBeenCalledWith('present.key', 'Fallback', {})
  })

  it('passes params through to $tf', () => {
    const $tf = vi.fn(() => 'ok')
    const vm = mountHost({ $tf }).vm

    vm.uiText('some.key', 'fb', { count: 3 })
    expect($tf).toHaveBeenCalledWith('some.key', 'fb', { count: 3 })
  })

  it('returns the fallback when $tf returns a non-string', () => {
    const $tf = vi.fn(() => ({ not: 'a string' }))
    const vm = mountHost({ $tf }).vm

    expect(vm.uiText('missing.key', 'Fallback')).toBe('Fallback')
  })

  it('falls back to $t when $tf is unavailable and the key resolves', () => {
    // The global test setup injects $tf for every mount; override it to a
    // non-function so the mixin's `typeof this.$tf === 'function'` is false
    // and the $t branch is actually exercised.
    const $t = vi.fn((key) => (key === 'present.key' ? 'From $t' : key))
    const vm = mountHost({ $tf: null, $t }).vm

    expect(vm.uiText('present.key', 'Fallback')).toBe('From $t')
  })

  it('returns the fallback when $t echoes the key (missing translation)', () => {
    const $t = vi.fn((key) => key)
    const vm = mountHost({ $tf: null, $t }).vm

    expect(vm.uiText('missing.key', 'Fallback')).toBe('Fallback')
  })

  it('returns the fallback when $t returns a non-string', () => {
    const $t = vi.fn(() => 42)
    const vm = mountHost({ $tf: null, $t }).vm

    expect(vm.uiText('missing.key', 'Fallback')).toBe('Fallback')
  })

  it('returns the fallback when neither translator is present', () => {
    const vm = mountHost({ $tf: null, $t: null }).vm
    expect(vm.uiText('any.key', 'Fallback')).toBe('Fallback')
  })

  it('defaults the fallback to an empty string', () => {
    const vm = mountHost({ $tf: null, $t: null }).vm
    expect(vm.uiText('any.key')).toBe('')
  })
})

describe('i18nTextMixin.uiFormat', () => {
  it('is an alias for uiText', () => {
    const $tf = vi.fn((key, fallback) => (key === 'present.key' ? 'Translated' : fallback))
    const vm = mountHost({ $tf }).vm

    expect(vm.uiFormat('present.key', 'Fallback', { a: 1 })).toBe('Translated')
    expect($tf).toHaveBeenCalledWith('present.key', 'Fallback', { a: 1 })
  })
})

describe('i18nTextMixin.notificationText', () => {
  it('passes through non-empty strings', () => {
    const vm = mountHost().vm
    expect(vm.notificationText('hello', 'fb')).toBe('hello')
  })

  it('coerces non-null non-string values to String', () => {
    const vm = mountHost().vm
    expect(vm.notificationText(7, 'fb')).toBe('7')
    expect(vm.notificationText(false, 'fb')).toBe('false')
  })

  it('returns the fallback for empty string, null and undefined', () => {
    const vm = mountHost().vm
    expect(vm.notificationText('', 'fb')).toBe('fb')
    expect(vm.notificationText(null, 'fb')).toBe('fb')
    expect(vm.notificationText(undefined, 'fb')).toBe('fb')
  })

  it('defaults the fallback to an empty string', () => {
    const vm = mountHost().vm
    expect(vm.notificationText(null)).toBe('')
  })
})

describe('i18nTextMixin.notifyUser', () => {
  it('dispatches the resolved title and message through window.$notify and returns true', () => {
    const error = vi.fn()
    window.$notify = { error }
    const $tf = vi.fn((key, fallback) => (key === 'title.key' ? 'Resolved Title' : fallback))
    const vm = mountHost({ $tf }).vm

    const fired = vm.notifyUser('error', 'title.key', 'Title Fallback', 'Body message')

    expect(fired).toBe(true)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('Resolved Title', 'Body message')
  })

  it('uses the title fallback when the key does not resolve', () => {
    const info = vi.fn()
    window.$notify = { info }
    const $tf = vi.fn((key, fallback) => fallback)
    const vm = mountHost({ $tf }).vm

    vm.notifyUser('info', 'missing.key', 'Title Fallback')

    expect(info).toHaveBeenCalledWith('Title Fallback', '')
  })

  it('passes title params through to the translator', () => {
    const success = vi.fn()
    window.$notify = { success }
    const $tf = vi.fn((key, fallback) => fallback)
    const vm = mountHost({ $tf }).vm

    vm.notifyUser('success', 'k', 'fb', 'msg', { levelId: 'abc' })

    expect($tf).toHaveBeenCalledWith('k', 'fb', { levelId: 'abc' })
  })

  it('returns false when window.$notify is absent', () => {
    delete window.$notify
    const vm = mountHost().vm
    expect(vm.notifyUser('error', 'k', 'fb', 'msg')).toBe(false)
  })

  it('returns false when the requested level method is missing', () => {
    window.$notify = { info: vi.fn() }
    const vm = mountHost().vm
    expect(vm.notifyUser('error', 'k', 'fb', 'msg')).toBe(false)
  })
})
