import {
  defaultLayoutRatios,
  normalizeLayoutRatios,
  ratiosMatchDefaults,
  buildLayoutTracksFromRatios,
  layoutRatiosFromTracks,
  resizeLayoutTrackPair
} from './resizableLayout.js'

function makeDefaultLayout(config) {
  return {
    isReady: false,
    isCustom: false,
    columns: {},
    rows: {},
    columnRatios: defaultLayoutRatios(config.columns),
    rowRatios: hasRows(config) ? defaultLayoutRatios(config.rows) : {}
  }
}

function hasRows(config) {
  return !!(config.rows && Object.keys(config.rows).length > 0)
}

function readSnapshot(storageKey) {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (err) {
    console.warn('Resizable layout restore failed:', err)
    return null
  }
}

export const resizableLayoutMixin = {
  data() {
    const config = this.$options.resizableLayoutConfig
    return {
      resizableLayout: makeDefaultLayout(config),
      resizableLayoutViewportWidth: 0,
      resizableLayoutResizeObserver: null,
      resizableLayoutResizeFallbackActive: false,
      activeResizableLayoutSplitter: null,
      resizableLayoutPersistTimer: null
    }
  },
  computed: {
    layoutGridStyle() {
      const config = this.$options.resizableLayoutConfig
      if (!this.resizableLayout || !this.resizableLayout.isReady) return {}
      const columns = this.resizableLayout.columns || {}
      const rows = this.resizableLayout.rows || {}
      const style = {}
      Object.entries(config.cssVars.columns || {}).forEach(([key, cssVar]) => {
        style[cssVar] = `${Math.round(columns[key] || 0)}px`
      })
      Object.entries(config.cssVars.rows || {}).forEach(([key, cssVar]) => {
        style[cssVar] = `${Math.round(rows[key] || 0)}px`
      })
      return style
    },
    layoutSplitters() {
      return this.isLayoutResizable ? this.$options.resizableLayoutConfig.splitters : []
    },
    isLayoutResizable() {
      return this.resizableLayoutViewportWidth >= this.$options.resizableLayoutConfig.desktopMinWidth
    },
    isLayoutDirty() {
      return !!(this.resizableLayout && this.resizableLayout.isCustom)
    },
    shouldShowLayoutReset() {
      return this.isLayoutResizable && this.isLayoutDirty
    }
  },
  mounted() {
    this.updateLayoutViewportWidth()
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', this.updateLayoutViewportWidth)
    }
    this.restoreLayout()
    this.$nextTick(() => {
      this.syncLayoutFromContainer()
      this.startLayoutObserver()
    })
  },
  beforeUnmount() {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.updateLayoutViewportWidth)
    }
    this.stopLayoutDrag()
    this.stopLayoutObserver()
    if (this.resizableLayoutPersistTimer) {
      clearTimeout(this.resizableLayoutPersistTimer)
      this.resizableLayoutPersistTimer = null
    }
  },
  methods: {
    isLayoutSplitterActive(key) {
      return !!(this.activeResizableLayoutSplitter && this.activeResizableLayoutSplitter.key === key)
    },
    updateLayoutViewportWidth() {
      if (typeof window === 'undefined') {
        this.resizableLayoutViewportWidth = 0
        return
      }
      const width = Number(window.innerWidth)
      if (Number.isFinite(width) && width > 0) {
        this.resizableLayoutViewportWidth = width
        return
      }
      const fallback = typeof document !== 'undefined'
        ? Number(document.documentElement && document.documentElement.clientWidth)
        : 0
      this.resizableLayoutViewportWidth = Number.isFinite(fallback) && fallback > 0 ? fallback : 0
    },
    restoreLayout() {
      const config = this.$options.resizableLayoutConfig
      const saved = readSnapshot(config.storageKey)
      if (!saved) return
      this.resizableLayout.columnRatios = normalizeLayoutRatios(saved.columns, config.columns)
      if (hasRows(config)) {
        this.resizableLayout.rowRatios = normalizeLayoutRatios(saved.rows, config.rows)
      }
      this.resizableLayout.isCustom = !this.layoutRatiosMatchDefaults()
    },
    layoutRatiosMatchDefaults() {
      const config = this.$options.resizableLayoutConfig
      const columnsMatch = ratiosMatchDefaults(this.resizableLayout.columnRatios, config.columns)
      const rowsMatch = hasRows(config)
        ? ratiosMatchDefaults(this.resizableLayout.rowRatios, config.rows)
        : true
      return columnsMatch && rowsMatch
    },
    getLayoutAvailableSize() {
      const config = this.$options.resizableLayoutConfig
      const el = this.$refs[config.containerRef]
      if (!el) return null
      const styles = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(el)
        : null
      const paddingLeft = styles ? parseFloat(styles.paddingLeft) || 0 : 0
      const paddingRight = styles ? parseFloat(styles.paddingRight) || 0 : 0
      const paddingTop = styles ? parseFloat(styles.paddingTop) || 0 : 0
      const paddingBottom = styles ? parseFloat(styles.paddingBottom) || 0 : 0
      const verticalSplitters = config.splitters.filter(s => s.orientation === 'vertical').length
      const horizontalSplitters = config.splitters.filter(s => s.orientation === 'horizontal').length
      // When the resizable columns share their grid with fixed sibling columns
      // (a non-resizable panel via `reservedRefs`, a fixed gutter track via
      // `reservedWidth`) and/or a grid `gap`, subtract that space so the available
      // width maps 1:1 to the draggable pair. Defaults keep this a no-op for
      // gap-free grids whose tracks are all resizable (e.g. Playground).
      const gap = Number(config.gap) || 0
      const reservedRefs = Array.isArray(config.reservedRefs) ? config.reservedRefs : []
      let reservedWidth = Number(config.reservedWidth) || 0
      reservedRefs.forEach(refName => {
        const refEl = this.$refs[refName]
        if (refEl && typeof refEl.getBoundingClientRect === 'function') {
          reservedWidth += refEl.getBoundingClientRect().width
        }
      })
      const columnTrackCount = Object.keys(config.columns).length + verticalSplitters + reservedRefs.length
      const rowTrackCount = (hasRows(config) ? Object.keys(config.rows).length : 0) + horizontalSplitters
      const columnGaps = gap > 0 && columnTrackCount > 1 ? gap * (columnTrackCount - 1) : 0
      const rowGaps = gap > 0 && rowTrackCount > 1 ? gap * (rowTrackCount - 1) : 0
      const width = el.clientWidth - paddingLeft - paddingRight - (config.splitterSize * verticalSplitters) - columnGaps - reservedWidth
      const height = el.clientHeight - paddingTop - paddingBottom - (config.splitterSize * horizontalSplitters) - rowGaps
      return {
        width: Math.max(0, width),
        height: Math.max(0, height)
      }
    },
    syncLayoutFromContainer() {
      const config = this.$options.resizableLayoutConfig
      const available = this.getLayoutAvailableSize()
      if (!available || available.width <= 0) return
      // Parity with original Playground: when the layout has rows, both
      // dimensions must be measurable before the layout is considered ready.
      if (hasRows(config) && available.height <= 0) return
      this.resizableLayout.columns = buildLayoutTracksFromRatios(
        this.resizableLayout.columnRatios,
        available.width,
        config.columns
      )
      if (hasRows(config)) {
        this.resizableLayout.rows = buildLayoutTracksFromRatios(
          this.resizableLayout.rowRatios,
          available.height,
          config.rows
        )
      }
      this.resizableLayout.isReady = true
    },
    startLayoutObserver() {
      const config = this.$options.resizableLayoutConfig
      const el = this.$refs[config.containerRef]
      if (!el || this.resizableLayoutResizeObserver || this.resizableLayoutResizeFallbackActive) return
      if (typeof ResizeObserver !== 'undefined') {
        this.resizableLayoutResizeObserver = new ResizeObserver(() => {
          this.syncLayoutFromContainer()
        })
        this.resizableLayoutResizeObserver.observe(el)
        return
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', this.syncLayoutFromContainer)
        this.resizableLayoutResizeFallbackActive = true
      }
    },
    stopLayoutObserver() {
      if (this.resizableLayoutResizeObserver) {
        this.resizableLayoutResizeObserver.disconnect()
        this.resizableLayoutResizeObserver = null
      }
      if (this.resizableLayoutResizeFallbackActive && typeof window !== 'undefined') {
        window.removeEventListener('resize', this.syncLayoutFromContainer)
        this.resizableLayoutResizeFallbackActive = false
      }
    },
    onLayoutSplitterPointerDown(event, splitter) {
      if (!splitter) return
      if (!this.resizableLayout.isReady) {
        this.syncLayoutFromContainer()
      }
      if (!this.resizableLayout.isReady) return
      event.preventDefault()
      if (event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      this.activeResizableLayoutSplitter = {
        ...splitter,
        startX: event.clientX,
        startY: event.clientY,
        startColumns: { ...this.resizableLayout.columns },
        startRows: { ...this.resizableLayout.rows }
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('pointermove', this.onLayoutSplitterPointerMove)
        document.addEventListener('pointerup', this.onLayoutSplitterPointerUp)
        document.addEventListener('pointercancel', this.onLayoutSplitterPointerUp)
      }
    },
    onLayoutSplitterPointerMove(event) {
      const splitter = this.activeResizableLayoutSplitter
      if (!splitter) return
      if (splitter.orientation === 'vertical') {
        this.applyLayoutColumnDelta(splitter, event.clientX - splitter.startX, splitter.startColumns)
        return
      }
      this.applyLayoutRowDelta(splitter, event.clientY - splitter.startY, splitter.startRows)
    },
    onLayoutSplitterPointerUp() {
      if (this.activeResizableLayoutSplitter) {
        this.persistLayout()
      }
      this.stopLayoutDrag()
    },
    stopLayoutDrag() {
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointermove', this.onLayoutSplitterPointerMove)
        document.removeEventListener('pointerup', this.onLayoutSplitterPointerUp)
        document.removeEventListener('pointercancel', this.onLayoutSplitterPointerUp)
      }
      this.activeResizableLayoutSplitter = null
    },
    onLayoutSplitterKeydown(event, splitter) {
      const step = event.shiftKey ? 64 : 24
      let delta = 0
      if (splitter.orientation === 'vertical') {
        if (event.key === 'ArrowLeft') delta = -step
        if (event.key === 'ArrowRight') delta = step
      } else {
        if (event.key === 'ArrowUp') delta = -step
        if (event.key === 'ArrowDown') delta = step
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        this.resetLayout()
        return
      }
      if (delta === 0) return
      event.preventDefault()
      if (!this.resizableLayout.isReady) this.syncLayoutFromContainer()
      if (splitter.orientation === 'vertical') {
        this.applyLayoutColumnDelta(splitter, delta)
      } else {
        this.applyLayoutRowDelta(splitter, delta)
      }
      this.persistLayout()
    },
    applyLayoutColumnDelta(splitter, delta, sourceColumns = this.resizableLayout.columns) {
      const config = this.$options.resizableLayoutConfig
      const nextColumns = resizeLayoutTrackPair(sourceColumns, splitter, delta, config.columns)
      this.resizableLayout.columns = nextColumns
      this.resizableLayout.columnRatios = layoutRatiosFromTracks(nextColumns, config.columns)
      this.resizableLayout.isReady = true
      this.markLayoutCustom()
    },
    applyLayoutRowDelta(splitter, delta, sourceRows = this.resizableLayout.rows) {
      const config = this.$options.resizableLayoutConfig
      if (!hasRows(config)) return
      const nextRows = resizeLayoutTrackPair(sourceRows, splitter, delta, config.rows)
      this.resizableLayout.rows = nextRows
      this.resizableLayout.rowRatios = layoutRatiosFromTracks(nextRows, config.rows)
      this.resizableLayout.isReady = true
      this.markLayoutCustom()
    },
    markLayoutCustom() {
      this.resizableLayout.isCustom = !this.layoutRatiosMatchDefaults()
      if (!this.resizableLayout.isCustom) {
        this.clearPersistedLayout()
        return
      }
      this.scheduleLayoutPersist()
    },
    scheduleLayoutPersist() {
      if (this.resizableLayoutPersistTimer) clearTimeout(this.resizableLayoutPersistTimer)
      this.resizableLayoutPersistTimer = setTimeout(() => {
        this.resizableLayoutPersistTimer = null
        this.persistLayout()
      }, 200)
    },
    persistLayout() {
      const config = this.$options.resizableLayoutConfig
      if (this.resizableLayoutPersistTimer) {
        clearTimeout(this.resizableLayoutPersistTimer)
        this.resizableLayoutPersistTimer = null
      }
      if (!this.resizableLayout.isCustom) return
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) return
        localStorage.setItem(config.storageKey, JSON.stringify({
          version: 1,
          columns: this.resizableLayout.columnRatios,
          rows: this.resizableLayout.rowRatios,
          updatedAt: new Date().toISOString()
        }))
      } catch (err) {
        console.warn('Resizable layout save failed:', err)
      }
    },
    clearPersistedLayout() {
      const config = this.$options.resizableLayoutConfig
      if (this.resizableLayoutPersistTimer) {
        clearTimeout(this.resizableLayoutPersistTimer)
        this.resizableLayoutPersistTimer = null
      }
      try {
        if (typeof localStorage !== 'undefined' && localStorage !== null) {
          localStorage.removeItem(config.storageKey)
        }
      } catch (err) {
        console.warn('Resizable layout reset failed:', err)
      }
    },
    resetLayout() {
      const config = this.$options.resizableLayoutConfig
      this.clearPersistedLayout()
      this.resizableLayout.columnRatios = defaultLayoutRatios(config.columns)
      this.resizableLayout.rowRatios = hasRows(config) ? defaultLayoutRatios(config.rows) : {}
      this.resizableLayout.columns = {}
      this.resizableLayout.rows = {}
      this.resizableLayout.isReady = false
      this.resizableLayout.isCustom = false
      this.$nextTick(() => {
        this.syncLayoutFromContainer()
      })
    }
  }
}

export default resizableLayoutMixin
