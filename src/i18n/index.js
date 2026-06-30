import { createI18n } from 'vue-i18n'
import enUS from './locales/en_US.json'
import ukUA from './locales/uk_UA.json'
import { resolveLocalizedLabel } from '../utils/packageLabels.js'

export const DEFAULT_LOCALE = 'en_US'
export const FALLBACK_LOCALE = DEFAULT_LOCALE
export const LOCALE_STORAGE_KEY = 'hexWarLocale'

export const SUPPORTED_LOCALES = Object.freeze([
  { code: 'en_US', labelKey: 'app.language.en_US', label: 'English (US)' },
  { code: 'uk_UA', labelKey: 'app.language.uk_UA', label: 'Українська' }
])

const SUPPORTED_LOCALE_CODES = new Set(SUPPORTED_LOCALES.map(locale => locale.code))

function browserStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null ? localStorage : null
  } catch (err) {
    return null
  }
}

function readStoredLocale() {
  const storage = browserStorage()
  if (!storage) return DEFAULT_LOCALE
  try {
    const stored = storage.getItem(LOCALE_STORAGE_KEY)
    return SUPPORTED_LOCALE_CODES.has(stored) ? stored : DEFAULT_LOCALE
  } catch (err) {
    return DEFAULT_LOCALE
  }
}

function writeStoredLocale(code) {
  const storage = browserStorage()
  if (!storage) return false
  try {
    storage.setItem(LOCALE_STORAGE_KEY, code)
    return true
  } catch (err) {
    return false
  }
}

export const INITIAL_LOCALE = readStoredLocale()

export const messages = Object.freeze({
  [DEFAULT_LOCALE]: enUS,
  uk_UA: ukUA
})

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: INITIAL_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages
})

function lookupMessage(key, locale = DEFAULT_LOCALE) {
  if (typeof key !== 'string' || !key.trim()) return undefined
  const root = messages[locale] || messages[FALLBACK_LOCALE]
  return key.split('.').reduce((node, part) => {
    if (node == null || typeof node !== 'object') return undefined
    return node[part]
  }, root)
}

export function hasTranslation(key, locale = DEFAULT_LOCALE) {
  return typeof lookupMessage(key, locale) === 'string'
}

export function getI18nLocaleCode(i18nLike, fallback = DEFAULT_LOCALE) {
  const locale = i18nLike && i18nLike.locale
  if (typeof locale === 'string' && SUPPORTED_LOCALE_CODES.has(locale)) return locale
  if (
    locale
    && typeof locale === 'object'
    && 'value' in locale
    && typeof locale.value === 'string'
    && SUPPORTED_LOCALE_CODES.has(locale.value)
  ) {
    return locale.value
  }
  return SUPPORTED_LOCALE_CODES.has(fallback) ? fallback : DEFAULT_LOCALE
}

export function setI18nLocale(i18nLike, code, options = {}) {
  if (!i18nLike || typeof code !== 'string' || !SUPPORTED_LOCALE_CODES.has(code)) return false
  const persist = options == null || options.persist !== false
  if (
    i18nLike.locale
    && typeof i18nLike.locale === 'object'
    && 'value' in i18nLike.locale
  ) {
    i18nLike.locale.value = code
    if (persist) writeStoredLocale(code)
    return true
  }
  i18nLike.locale = code
  if (persist) writeStoredLocale(code)
  return true
}

export function translateWithFallback(key, fallback = '', params = {}) {
  if (typeof key !== 'string' || !key.trim()) return fallback
  const translated = i18n.global.t(key, params)
  return translated === key && fallback != null ? fallback : translated
}

export { resolveLocalizedLabel }

export function installI18n(app) {
  app.use(i18n)
  app.config.globalProperties.$tf = translateWithFallback
  app.config.globalProperties.$localizedLabel = resolveLocalizedLabel
}

export default i18n
