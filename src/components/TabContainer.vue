<template>
  <div class="tab-container">
    <div class="tab-header">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
        @click="setActiveTab(tab.id)"
      >
        {{ uiText(tab.labelKey, tab.label || tab.id) }}
      </button>
    </div>
    <div class="tab-content" :class="{ loading: isLoading }">
      <div v-if="isLoading" class="loading-content">
        <div class="loading-spinner"></div>
        <span>{{ resolvedLoadingText }}</span>
      </div>
      <slot v-else :activeTab="activeTab" :tabData="getActiveTabData()">
        <!-- Default content if no slot provided -->
        <div class="default-tab-content">
          <h4>{{ activeTabLabel }}</h4>
          <p>{{ uiText('tabs.defaultContent', `Content for ${activeTabLabel} tab`, { label: activeTabLabel }) }}</p>
        </div>
      </slot>
    </div>
  </div>
</template>

<script>
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

export default {
  name: 'TabContainer',
  mixins: [i18nTextMixin],
  props: {
    tabs: {
      type: Array,
      required: true,
      validator: (tabs) => tabs.every(tab => 
        tab &&
        typeof tab.id === 'string' &&
        tab.id.trim() &&
        (
          typeof tab.label === 'string' ||
          typeof tab.labelKey === 'string'
        )
      )
    },
    initialTab: {
      type: String,
      default: null
    },
    isLoading: {
      type: Boolean,
      default: false
    },
    loadingText: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      activeTab: this.initialTab || (this.tabs.length > 0 ? this.tabs[0].id : null)
    }
  },
  watch: {
    tabs: {
      handler(newTabs) {
        if (!Array.isArray(newTabs) || newTabs.length === 0) {
          this.activeTab = null
          return
        }
        if (!newTabs.find(tab => tab.id === this.activeTab)) {
          this.activeTab = newTabs[0].id
        }
      },
      immediate: true
    },
    initialTab(newTab) {
      if (newTab && this.tabs.find(tab => tab.id === newTab)) {
        this.activeTab = newTab
      }
    }
  },
  computed: {
    activeTabLabel() {
      const tab = this.getActiveTabData()
      if (!tab) return ''
      return this.uiText(tab.labelKey, tab.label || tab.id)
    },
    resolvedLoadingText() {
      return this.loadingText || this.uiText('common.loading', 'Loading...')
    }
  },
  methods: {
    setActiveTab(tabId) {
      const tabs = Array.isArray(this.tabs) ? this.tabs : []
      if (tabs.find(tab => tab.id === tabId)) {
        this.activeTab = tabId
        this.$emit('tab-change', tabId)
      }
    },
    getActiveTabData() {
      const tabs = Array.isArray(this.tabs) ? this.tabs : []
      return tabs.find(tab => tab.id === this.activeTab)
    }
  }
}
</script>

<style scoped>
/* Using universal styles from components.scss */
</style>
