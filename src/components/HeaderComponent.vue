<template>
  <nav
    class="app-menubar"
    :class="{ 'app-menubar--menu-open': menuOpen }"
    :aria-label="$t('navigation.primaryAria')"
  >
    <button
      type="button"
      class="app-menubar__menu-button"
      aria-controls="app-menubar-links"
      :aria-expanded="String(menuOpen)"
      :aria-label="menuToggleLabel"
      @click="toggleMenu"
    >
      <PhList :size="18" weight="bold" aria-hidden="true" />
      <span>{{ menuToggleLabel }}</span>
    </button>
    <ul id="app-menubar-links" class="app-menubar__list">
      <li
        v-for="link in links"
        :key="link.href"
        class="app-menubar__item"
      >
        <router-link
          :to="link.href"
          class="app-menubar__link"
          :class="{ 'app-menubar__link--active': isActive(link.href) }"
          :aria-current="isActive(link.href) ? 'page' : undefined"
          @click="closeMenu"
        >
          {{ $tf(link.titleKey, link.title) }}
        </router-link>
      </li>
    </ul>
    <div v-if="hasHeaderActions" class="app-menubar__actions">
      <div
        v-if="showLocaleSwitcher"
        class="app-menubar__language"
        role="group"
        :aria-label="$t('app.language.selectAria')"
      >
        <button
          v-for="locale in availableLocales"
          :key="locale.code"
          type="button"
          class="app-menubar__language-option"
          :class="{ 'app-menubar__language-option--active': locale.code === currentLocaleCode }"
          :aria-pressed="locale.code === currentLocaleCode"
          :title="$tf(locale.labelKey, locale.label)"
          @click="setLocale(locale.code)"
        >
          {{ shortLocaleLabel(locale) }}
        </button>
      </div>
      <button
        v-if="showResetLayout"
        type="button"
        class="app-menubar__action"
        @click="$emit('reset-layout')"
      >
        {{ $t('navigation.resetLayout') }}
      </button>
    </div>
  </nav>
</template>

<script>
import { PhList } from '@phosphor-icons/vue'
import { SUPPORTED_LOCALES, getI18nLocaleCode, setI18nLocale } from '../i18n'

export default {
  name: 'HeaderComponent',
  components: {
    PhList,
  },
  props: {
    showResetLayout: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['reset-layout'],
  data() {
    return {
      menuOpen: false,
      links: [
        {
          titleKey: 'navigation.main',
          title: 'Main',
          href: '/',
        },
        {
          titleKey: 'navigation.levelBuilder',
          title: 'Level builder',
          href: '/LevelBuilder',
        },
        {
          titleKey: 'navigation.playground',
          title: 'Playground',
          href: '/Playground',
        },
        {
          titleKey: 'navigation.automatedPlayground',
          title: 'Automated',
          href: '/AutomatedPlayground',
        },
      ],
    }
  },
  computed: {
    availableLocales() {
      return SUPPORTED_LOCALES
    },
    showLocaleSwitcher() {
      return this.availableLocales.length > 1
    },
    hasHeaderActions() {
      return this.showResetLayout || this.showLocaleSwitcher
    },
    currentLocaleCode() {
      return getI18nLocaleCode(this.$i18n)
    },
    menuToggleLabel() {
      const key = this.menuOpen ? 'navigation.closeMenu' : 'navigation.menu'
      const fallback = this.menuOpen ? 'Close menu' : 'Menu'
      return typeof this.$tf === 'function' ? this.$tf(key, fallback) : fallback
    },
  },
  watch: {
    '$route.path'() {
      this.closeMenu()
    },
  },
  methods: {
    isActive(href) {
      return this.$route.path === href
    },
    shortLocaleLabel(locale) {
      const map = { en_US: 'EN', uk_UA: 'UA' }
      if (map[locale.code]) return map[locale.code]
      return locale.code.slice(0, 2).toUpperCase()
    },
    setLocale(code) {
      setI18nLocale(this.$i18n, code)
    },
    toggleMenu() {
      this.menuOpen = !this.menuOpen
    },
    closeMenu() {
      this.menuOpen = false
    },
  },
}
</script>

<style scoped>
.app-menubar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #ffffff;
  border-bottom: 1px solid #dee2e6;
}

.app-menubar__list {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-self: center;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  background: #f8f9fa;
}

.app-menubar__menu-button {
  display: none;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.app-menubar__menu-button:hover {
  background: #eef2f7;
  border-color: #94a3b8;
  color: #0f172a;
}

.app-menubar__menu-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #4CAF50;
}

.app-menubar__link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 4px;
  color: #334155;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.app-menubar__link:hover {
  background: #eef2f7;
  color: #0f172a;
}

.app-menubar__link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #4CAF50;
}

.app-menubar__link--active,
.app-menubar__link--active:hover {
  background: #4CAF50;
  color: #ffffff;
}

.app-menubar__actions {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 8px;
  min-width: 0;
}

.app-menubar__language {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #f8f9fa;
}

.app-menubar__language-option {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.app-menubar__language-option:hover {
  background: #eef2f7;
  color: #334155;
}

.app-menubar__language-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px #94a3b8;
}

.app-menubar__language-option--active,
.app-menubar__language-option--active:hover {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.app-menubar__action {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

.app-menubar__action:hover {
  background: #eef2f7;
  border-color: #94a3b8;
  color: #0f172a;
}

.app-menubar__action:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #4CAF50;
}

@media (max-width: 1024px) {
  .app-menubar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    overflow-x: hidden;
  }

  .app-menubar__list {
    grid-column: 1;
    justify-self: start;
    min-width: max-content;
    max-width: 100%;
    overflow-x: auto;
  }

  .app-menubar__actions {
    grid-column: 2;
    justify-self: end;
    flex: none;
  }
}

@media (max-width: 640px) {
  .app-menubar {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    overflow-x: visible;
  }

  .app-menubar__menu-button {
    grid-column: 1;
    grid-row: 1;
    display: inline-flex;
    justify-self: start;
  }

  .app-menubar__list {
    grid-column: 1 / -1;
    grid-row: 2;
    display: none;
    width: 100%;
    min-width: 0;
    max-width: none;
    box-sizing: border-box;
    flex-direction: column;
    align-items: stretch;
    justify-self: stretch;
    gap: 2px;
    overflow: visible;
  }

  .app-menubar--menu-open .app-menubar__list {
    display: flex;
  }

  .app-menubar__item {
    width: 100%;
  }

  .app-menubar__link {
    width: 100%;
    box-sizing: border-box;
    justify-content: flex-start;
    min-height: 38px;
    padding: 0 10px;
    line-height: 1.15;
    white-space: normal;
  }

  .app-menubar__actions {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    max-width: 100%;
  }

  .app-menubar__action {
    min-height: 30px;
    padding: 0 8px;
    font-size: 12px;
    white-space: nowrap;
  }
}
</style>
