/**
 * Спільний Options-API mixin для i18n-fallback хелперів.
 *
 * Раніше ці методи копіювалися (і поступово розходилися) у ~10 компонентах.
 * Канонічна поведінка взята з Playground.vue — найкоректнішого варіанта,
 * який перевіряє `typeof translated === 'string'` на обох шляхах ($tf і $t).
 *
 * Контракт:
 *  - uiText(key, fallback, params): пробує $tf, потім $t; повертає переклад
 *    лише якщо це непорожній рядок, що відрізняється від ключа, інакше fallback.
 *  - uiFormat: псевдонім uiText (історична назва на деяких call-site'ах).
 *  - notificationText(value, fallback): нормалізує значення для тіл нотифікацій.
 *  - notifyUser(level, titleKey, titleFallback, message, titleParams): шле
 *    нотифікацію через window.$notify; повертає true/false (чи був виклик).
 */
export const i18nTextMixin = {
  methods: {
    uiText(key, fallback = '', params = {}) {
      if (typeof this.$tf === 'function') {
        const translated = this.$tf(key, fallback, params)
        return typeof translated === 'string' ? translated : fallback
      }
      if (typeof this.$t === 'function') {
        const translated = this.$t(key, params)
        return typeof translated === 'string' && translated !== key ? translated : fallback
      }
      return fallback
    },

    uiFormat(key, fallback = '', params = {}) {
      return this.uiText(key, fallback, params)
    },

    notificationText(value, fallback = '') {
      if (typeof value === 'string' && value.length > 0) return value
      if (value != null && typeof value !== 'string') return String(value)
      return fallback
    },

    notifyUser(level, titleKey, titleFallback, message = '', titleParams = {}) {
      const api = typeof window !== 'undefined' ? window.$notify : null
      if (!api || typeof api[level] !== 'function') return false
      const title = this.notificationText(this.uiText(titleKey, titleFallback, titleParams), titleFallback)
      api[level](title, this.notificationText(message))
      return true
    }
  }
}

export default i18nTextMixin
