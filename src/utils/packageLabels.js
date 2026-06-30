export const DEFAULT_PACKAGE_LABEL_LOCALE = 'en_US'
export const MAX_PACKAGE_LABEL_KEY_LENGTH = 32
export const MAX_PACKAGE_LABEL_LENGTH = 120

const UNSAFE_LABEL_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLocale(locale) {
  if (typeof locale === 'string') return locale.trim() || DEFAULT_PACKAGE_LABEL_LOCALE
  if (locale && typeof locale === 'object' && typeof locale.value === 'string') {
    return locale.value.trim() || DEFAULT_PACKAGE_LABEL_LOCALE
  }
  return DEFAULT_PACKAGE_LABEL_LOCALE
}

function fallbackText(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

function normalizeLabelText(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text.length > 0 && text.length <= MAX_PACKAGE_LABEL_LENGTH ? text : ''
}

export function normalizeLocalizedLabelMap(labels) {
  if (!isPlainObject(labels)) return null
  const normalized = {}
  for (const [rawKey, rawValue] of Object.entries(labels)) {
    const key = String(rawKey).trim()
    if (!key || key.length > MAX_PACKAGE_LABEL_KEY_LENGTH || UNSAFE_LABEL_KEYS.has(key)) continue
    const value = normalizeLabelText(rawValue)
    if (!value) continue
    normalized[key] = value
  }
  return Object.keys(normalized).length > 0 ? normalized : null
}

function labelCandidates(locale) {
  const normalized = normalizeLocale(locale)
  const language = normalized.split(/[_-]/)[0]
  return Array.from(new Set([
    normalized,
    language,
    DEFAULT_PACKAGE_LABEL_LOCALE,
    'en_US',
    'en',
    'default'
  ].filter(Boolean)))
}

function pickLocalizedLabel(labels, locale) {
  if (!labels) return ''
  for (const key of labelCandidates(locale)) {
    const value = labels[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function resolveLocalizedLabel(value, locale = DEFAULT_PACKAGE_LABEL_LOCALE, fallback = '') {
  if (typeof value === 'string') return normalizeLabelText(value) || fallbackText(fallback)
  const fallbackValue = fallbackText(fallback)
  if (!isPlainObject(value)) return fallbackValue

  const labels = normalizeLocalizedLabelMap(value.labels) || normalizeLocalizedLabelMap(value)
  const localized = pickLocalizedLabel(labels, locale)
  if (localized) return localized

  for (const key of ['name', 'label', 'id']) {
    const candidate = value[key]
    const label = normalizeLabelText(candidate)
    if (label) return label
  }
  return fallbackValue
}

export function resolvePackageEntryLabel(entry, locale = DEFAULT_PACKAGE_LABEL_LOCALE, fallback = '') {
  const baseFallback = fallback ||
    (entry && typeof entry.name === 'string' ? entry.name : '') ||
    (entry && typeof entry.id === 'string' ? entry.id : '')
  return resolveLocalizedLabel(entry, locale, baseFallback)
}

export function hasDefaultLocalizedLabel(labels) {
  return Boolean(resolveLocalizedLabel({ labels }, DEFAULT_PACKAGE_LABEL_LOCALE, ''))
}

export function syncDefaultLocalizedLabel(labels, name, locale = DEFAULT_PACKAGE_LABEL_LOCALE) {
  const normalized = normalizeLocalizedLabelMap(labels)
  if (!normalized) return null
  const text = normalizeLabelText(name)
  if (!text) return normalized
  return {
    ...normalized,
    [normalizeLocale(locale)]: text
  }
}
