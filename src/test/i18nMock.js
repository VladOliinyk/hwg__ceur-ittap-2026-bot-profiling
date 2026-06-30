import { config } from '@vue/test-utils'
import { DEFAULT_LOCALE, FALLBACK_LOCALE, messages } from '../i18n'
import { resolveLocalizedLabel } from '../utils/packageLabels.js'

function currentLocale() {
  const locale = config.global.mocks.$i18n && config.global.mocks.$i18n.locale
  if (typeof locale === 'string' && locale.trim()) return locale
  if (locale && typeof locale === 'object' && typeof locale.value === 'string' && locale.value.trim()) {
    return locale.value
  }
  return DEFAULT_LOCALE
}

function lookup(key, locale = currentLocale()) {
  if (typeof key !== 'string' || !key.trim()) return undefined
  const root = messages[locale] || messages[FALLBACK_LOCALE]
  return key.split('.').reduce((node, part) => {
    if (node == null || typeof node !== 'object') return undefined
    return node[part]
  }, root)
}

function formatMessage(message, params = {}) {
  if (!params || typeof params !== 'object') return message
  return message.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ))
}

function t(key, params) {
  const message = lookup(key)
  return typeof message === 'string' ? formatMessage(message, params) : key
}

function tf(key, fallback = '', params = {}) {
  const message = lookup(key)
  return typeof message === 'string' ? formatMessage(message, params) : fallback
}

config.global.mocks.$t = t
config.global.mocks.$tf = tf
config.global.mocks.$te = key => typeof lookup(key) === 'string'
config.global.mocks.$i18n = { locale: 'en_US' }
config.global.mocks.$localizedLabel = resolveLocalizedLabel
