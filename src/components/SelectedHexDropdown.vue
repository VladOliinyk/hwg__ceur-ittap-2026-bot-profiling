<template>
  <div 
    v-if="visible" 
    class="floating-dropdown viewport-constrained"
    :style="positionStyle"
  >
    <!-- Drag Handle -->
    <div class="floating-dropdown-header" @mousedown="startDrag">
      <div class="drag-handle">⋮⋮</div>
      <h4>{{ title }}</h4>
      <button
        type="button"
        class="close-btn"
        title="Hide detached panel"
        @mousedown.stop
        @click.stop="onCloseFloatingOnly"
      >
        ×
      </button>
    </div>
    
    <div class="floating-dropdown-content selected-hex-dropdown__inspector-wrap">
      <SelectionInspectorPanel
        v-if="hex"
        variant="floating"
        :selected-hex="hex"
        :selected-unit="unit"
        :show-floating-panel="showFloatingPanel"
        :actions-remaining="actionsRemaining"
        :is-loaded="isLoaded"
        :can-move-forward="canMoveForward"
        :can-move-reverse="canMoveReverse"
        :selected-target-index="selectedTargetIndex"
        :valid-attack-targets="validAttackTargets"
        :can-fire="canFire"
        :can-reload="canReload"
        :actions-disabled="actionsDisabled"
        :show-actions="showActions"
        :show-keyboard-hints="showKeyboardHints"
        :show-floating-toggle="showFloatingToggle"
        a11y-instance-id="floating-dropdown"
        @deselect="$emit('deselect')"
        @update:showFloatingPanel="$emit('update:showFloatingPanel', $event)"
        @move-unit-forward="$emit('move-unit-forward')"
        @move-unit-reverse="$emit('move-unit-reverse')"
        @rotate-unit-clockwise="$emit('rotate-unit-clockwise')"
        @rotate-unit-counterclockwise="$emit('rotate-unit-counterclockwise')"
        @fire="$emit('fire')"
        @reload="$emit('reload')"
        @attack-target-shift="(d) => $emit('attack-target-shift', d)"
      />
    </div>
  </div>
</template>

<script>
import SelectionInspectorPanel from './SelectionInspectorPanel.vue'

export default {
  name: 'SelectedHexDropdown',
  components: {
    SelectionInspectorPanel
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    hex: {
      type: Object,
      default: null,
      validator: v => v == null || (typeof v === 'object' && !Array.isArray(v))
    },
    unit: {
      type: Object,
      default: null
    },
    position: {
      type: Object,
      default: () => ({ x: 100, y: 100 })
    },
    /** Синхронізація перемикача «Show detached panel» у секції Extra. */
    showFloatingPanel: {
      type: Boolean,
      default: true
    },
    canMoveForward: {
      type: Boolean,
      default: false
    },
    canMoveReverse: {
      type: Boolean,
      default: true
    },
    selectedTargetIndex: {
      type: Number,
      default: 0
    },
    validAttackTargets: {
      type: Array,
      default: () => []
    },
    canFire: {
      type: Boolean,
      default: false
    },
    canReload: {
      type: Boolean,
      default: false
    },
    /** Паритет з Game Engine: `gameState.turnState[unitId]`. */
    actionsRemaining: {
      type: Number,
      default: null
    },
    isLoaded: {
      type: Boolean,
      default: null
    },
    actionsDisabled: {
      type: Boolean,
      default: false
    },
    showActions: {
      type: Boolean,
      default: true
    },
    showKeyboardHints: {
      type: Boolean,
      default: true
    },
    showFloatingToggle: {
      type: Boolean,
      default: true
    }
  },
  emits: [
    'update:showFloatingPanel',
    'deselect',
    'start-drag',
    'move-unit-forward',
    'move-unit-reverse',
    'rotate-unit-clockwise',
    'rotate-unit-counterclockwise',
    'fire',
    'reload',
    'attack-target-shift'
  ],
  computed: {
    positionStyle() {
      const raw = this.position && typeof this.position === 'object' ? this.position : {}
      const x = Number(raw.x)
      const y = Number(raw.y)
      const left = Number.isFinite(x) ? x : 100
      const top = Number.isFinite(y) ? y : 100
      return { left: `${left}px`, top: `${top}px` }
    },
    title() {
      if (!this.hex) return 'Hex'
      const q = this.hex.q ?? '—'
      const r = this.hex.r ?? '—'
      if (this.unit) {
        const id = this.unit.id != null && this.unit.id !== '' ? this.unit.id : 'Unit'
        return `${id} (${q},${r})`
      }
      return `Hex (${q},${r})`
    }
  },
  methods: {
    startDrag(event) {
      event.preventDefault()
      this.$emit('start-drag', event)
    },

    /** Лише ховає плаваючу панель; не знімає вибір гекса/юніта. */
    onCloseFloatingOnly() {
      this.$emit('update:showFloatingPanel', false)
    }
  }
}
</script>

<style scoped lang="scss">
@use '../styles/components.scss' as *;

.floating-dropdown.viewport-constrained {
  display: flex;
  flex-direction: column;
  max-height: min(80vh, calc(100vh - 24px));
  overflow: hidden;
}

.floating-dropdown-header {
  position: sticky;
  top: 0;
  z-index: 1;
  flex: 0 0 auto;
}

.selected-hex-dropdown__inspector-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 12px 12px;
}
</style>
