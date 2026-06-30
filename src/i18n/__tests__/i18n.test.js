import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  INITIAL_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  getI18nLocaleCode,
  hasTranslation,
  i18n,
  messages,
  resolveLocalizedLabel,
  setI18nLocale,
  translateWithFallback
} from '../index.js'

function collectLeafEntries(node, path = []) {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) {
    return [[path.join('.'), node]]
  }
  return Object.entries(node).flatMap(([key, value]) => collectLeafEntries(value, [...path, key]))
}

function collectLeafKeys(node) {
  return collectLeafEntries(node).map(([key]) => key)
}

function collectPlaceholders(node) {
  const placeholderPattern = /\{\w+\}/g
  return Object.fromEntries(collectLeafEntries(node).map(([key, value]) => [
    key,
    [...new Set(String(value).match(placeholderPattern) || [])].sort()
  ]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('i18n scaffold', () => {
  it('uses en_US as the default and fallback locale', () => {
    expect(DEFAULT_LOCALE).toBe('en_US')
    expect(FALLBACK_LOCALE).toBe('en_US')
    expect(INITIAL_LOCALE).toBe('en_US')
    expect(SUPPORTED_LOCALES.map(locale => locale.code)).toEqual(['en_US', 'uk_UA'])
  })

  it('registers every supported locale with a translated locale label', () => {
    const supportedCodes = SUPPORTED_LOCALES.map(locale => locale.code)
    expect(Object.keys(messages).sort()).toEqual([...supportedCodes].sort())
    for (const locale of SUPPORTED_LOCALES) {
      expect(messages[locale.code]).toBeTruthy()
      expect(hasTranslation(locale.labelKey, locale.code)).toBe(true)
    }
  })

  it('keeps locale files on matching key trees', () => {
    const defaultKeys = collectLeafKeys(messages[DEFAULT_LOCALE]).sort()
    for (const locale of SUPPORTED_LOCALES) {
      expect(collectLeafKeys(messages[locale.code]).sort()).toEqual(defaultKeys)
    }
  })

  it('keeps locale placeholders aligned with the default locale', () => {
    const defaultPlaceholders = collectPlaceholders(messages[DEFAULT_LOCALE])
    for (const locale of SUPPORTED_LOCALES) {
      expect(collectPlaceholders(messages[locale.code])).toEqual(defaultPlaceholders)
    }
  })

  it('updates the real i18n locale and rejects unsupported locale codes', () => {
    const originalLocale = getI18nLocaleCode(i18n.global)
    try {
      expect(setI18nLocale(i18n.global, 'uk_UA', { persist: false })).toBe(true)
      expect(getI18nLocaleCode(i18n.global)).toBe('uk_UA')
      expect(i18n.global.t('navigation.main')).toBe(messages.uk_UA.navigation.main)

      expect(setI18nLocale(i18n.global, 'missing', { persist: false })).toBe(false)
      expect(getI18nLocaleCode(i18n.global)).toBe('uk_UA')
    } finally {
      setI18nLocale(i18n.global, originalLocale, { persist: false })
    }
  })

  it('persists supported locale codes and ignores unsupported ones', () => {
    const storage = {
      setItem: vi.fn(),
      getItem: vi.fn(() => null)
    }
    vi.stubGlobal('localStorage', storage)
    const i18nLike = { locale: 'en_US' }

    expect(setI18nLocale(i18nLike, 'uk_UA')).toBe(true)
    expect(i18nLike.locale).toBe('uk_UA')
    expect(storage.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'uk_UA')

    expect(setI18nLocale(i18nLike, 'missing')).toBe(false)
    expect(i18nLike.locale).toBe('uk_UA')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps switching locale when persistence storage throws', () => {
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      getItem: vi.fn(() => null)
    })
    const i18nLike = { locale: 'en_US' }

    expect(setI18nLocale(i18nLike, 'uk_UA')).toBe(true)
    expect(i18nLike.locale).toBe('uk_UA')
  })

  it('resolves existing keys and falls back for missing keys', () => {
    expect(hasTranslation('navigation.levelBuilder')).toBe(true)
    expect(hasTranslation('navigation.levelBuilder', 'uk_UA')).toBe(true)
    expect(translateWithFallback('navigation.levelBuilder')).toBe('Level builder')
    expect(translateWithFallback('missing.key', 'Fallback text')).toBe('Fallback text')
  })

  it('resolves localized package labels without changing ids', () => {
    expect(resolveLocalizedLabel('Plains')).toBe('Plains')
    expect(resolveLocalizedLabel({ en_US: 'Plains', uk_UA: 'Rivnyna' })).toBe('Plains')
    expect(resolveLocalizedLabel({ en: 'Forest' })).toBe('Forest')
    expect(resolveLocalizedLabel({ name: 'Plains', labels: { uk_UA: 'Rivnyna' } }, 'uk_UA')).toBe('Rivnyna')
    expect(resolveLocalizedLabel({ name: 'Plains', labels: { uk_UA: 'Rivnyna' } }, 'en_US')).toBe('Plains')
    expect(resolveLocalizedLabel('  Plains  ')).toBe('Plains')
    expect(resolveLocalizedLabel(' '.repeat(121), 'en_US', 'Fallback')).toBe('Fallback')
  })
})
