import { describe, it, expect } from 'vitest'
import {
  normalizeLocalizedLabelMap,
  syncDefaultLocalizedLabel,
  resolveLocalizedLabel
} from '../packageLabels.js'

describe('normalizeLocalizedLabelMap — UNSAFE_LABEL_KEYS guard', () => {
  // Object literals like `{ __proto__: 'x' }` use the prototype setter, so __proto__
  // is NOT an own enumerable key and Object.entries never sees it.  The real attack
  // vector is JSON imported from level files: JSON.parse('{"__proto__":"x"}') creates
  // an OWN key named "__proto__" that Object.entries DOES enumerate.  These tests use
  // JSON.parse so the UNSAFE_LABEL_KEYS guard is actually exercised.

  it('drops __proto__, constructor, prototype keys; keeps safe keys', () => {
    // JSON.parse gives own enumerable keys — the literal { __proto__: ... } would not.
    const input = JSON.parse('{"__proto__":"x","constructor":"y","prototype":"z","ok":"fine value"}')
    const result = normalizeLocalizedLabelMap(input)
    expect(result).toEqual({ ok: 'fine value' })
    // guard must have dropped the unsafe keys, not left them on the result
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false)
  })

  it('does not pollute Object.prototype', () => {
    // JSON.parse so __proto__ is an own key and the guard path is actually hit
    normalizeLocalizedLabelMap(JSON.parse('{"__proto__":{"injected":true}}'))
    expect(({}).injected).toBeUndefined()
  })

  it('returns null when all keys are unsafe', () => {
    // JSON.parse so every key is own-enumerable and the guard is exercised for each
    const result = normalizeLocalizedLabelMap(
      JSON.parse('{"__proto__":"x","constructor":"y","prototype":"z"}')
    )
    expect(result).toBeNull()
  })
})

describe('syncDefaultLocalizedLabel', () => {
  it('merges default name into map without mutating input', () => {
    const labels = { en_US: 'Old Name', uk_UA: 'Стара Назва' }
    const result = syncDefaultLocalizedLabel(labels, 'New Name')
    expect(result.en_US).toBe('New Name')
    expect(result.uk_UA).toBe('Стара Назва')
    // input must not be mutated
    expect(labels.en_US).toBe('Old Name')
  })

  it('returns normalized map unchanged when name is empty', () => {
    const labels = { en_US: 'Name' }
    const result = syncDefaultLocalizedLabel(labels, '')
    expect(result).toEqual({ en_US: 'Name' })
    expect(result).not.toBe(labels)
  })

  it('returns null when labels is invalid (not a plain object with valid entries)', () => {
    expect(syncDefaultLocalizedLabel(null, 'x')).toBeNull()
    expect(syncDefaultLocalizedLabel('string', 'x')).toBeNull()
  })
})

describe("resolveLocalizedLabel — 'default' key fallback", () => {
  it("falls back to 'default' key when no locale/language/en_US/en match", () => {
    const labels = { default: 'Fallback Label' }
    const result = resolveLocalizedLabel({ labels }, 'xx_ZZ')
    expect(result).toBe('Fallback Label')
  })

  it("prefers locale over 'default'", () => {
    const labels = { fr_FR: 'Etiquette', default: 'Fallback' }
    expect(resolveLocalizedLabel({ labels }, 'fr_FR')).toBe('Etiquette')
  })

  it("prefers language code over 'default'", () => {
    const labels = { fr: 'Langue', default: 'Fallback' }
    expect(resolveLocalizedLabel({ labels }, 'fr_BE')).toBe('Langue')
  })

  it("returns fallback argument when 'default' key also absent", () => {
    const labels = { uk_UA: 'Назва' }
    expect(resolveLocalizedLabel({ labels }, 'xx_ZZ', 'my fallback')).toBe('my fallback')
  })
})
