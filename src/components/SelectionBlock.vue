<template>
  <div class="grid-item grid-item--selection">
    <div class="block-header-with-status">
      <h3>{{ $t('gameplay.selection.title') }}</h3>
    </div>

    <div class="content-container-flex selection-block__content">
      <div v-if="selectedHex" class="selection-block__scroll">
        <SelectionInspectorPanel
          variant="engine"
          a11y-instance-id="selection-block"
          :selected-hex="selectedHex"
          :selected-unit="selectedUnit"
          :show-floating-panel="showFloatingPanel"
          :actions-remaining="selectedUnitTurnState ? selectedUnitTurnState.actionsRemaining : null"
          :is-loaded="selectedUnitTurnState ? selectedUnitTurnState.isLoaded : null"
          :can-move-forward="inspectorBridge.canMoveForward"
          :can-move-reverse="inspectorBridge.canMoveReverse"
          :valid-attack-targets="inspectorBridge.validAttackTargets"
          :selected-target-index="inspectorBridge.selectedTargetIndex"
          :can-fire="inspectorBridge.canFire"
          :can-reload="inspectorBridge.canReload"
          :actions-disabled="actionsDisabled"
          :show-actions="showActions"
          :show-keyboard-hints="showKeyboardHints"
          :show-floating-toggle="showFloatingToggle"
          @deselect="$emit('deselect')"
          @update:showFloatingPanel="$emit('update:showFloatingPanel', $event)"
          @move-unit-forward="$emit('move-unit-forward')"
          @move-unit-reverse="$emit('move-unit-reverse')"
          @rotate-unit-clockwise="$emit('rotate-unit-clockwise')"
          @rotate-unit-counterclockwise="$emit('rotate-unit-counterclockwise')"
          @fire="$emit('fire')"
          @reload="$emit('reload')"
          @attack-target-shift="$emit('attack-target-shift', $event)"
        />
      </div>

      <div v-else class="placeholder-content selection-block__empty">
        <h4>{{ $t('gameplay.selection.emptyTitle') }}</h4>
        <p>{{ $t('gameplay.selection.emptyBody') }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import SelectionInspectorPanel from './SelectionInspectorPanel.vue'

export default {
  name: 'SelectionBlock',
  components: {
    SelectionInspectorPanel
  },
  props: {
    selectedHex: {
      type: Object,
      default: null
    },
    gameState: {
      type: Object,
      default: null
    },
    showFloatingPanel: {
      type: Boolean,
      default: true
    },
    selectionInspectorBridge: {
      type: Object,
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
    'deselect',
    'update:showFloatingPanel',
    'move-unit-forward',
    'move-unit-reverse',
    'rotate-unit-clockwise',
    'rotate-unit-counterclockwise',
    'fire',
    'reload',
    'attack-target-shift'
  ],
  computed: {
    selectedUnit() {
      const hex = this.selectedHex
      const state = this.gameState
      if (!hex || !state || typeof state.getHex !== 'function') return null
      const gameHex = state.getHex(hex.q, hex.r)
      return gameHex && gameHex.unit ? gameHex.unit : null
    },
    selectedUnitTurnState() {
      const unitId = this.selectedUnit && this.selectedUnit.id
      if (!unitId || !this.gameState || !this.gameState.turnState) return null
      const row = this.gameState.turnState[unitId]
      return row && typeof row === 'object' ? row : null
    },
    inspectorBridge() {
      const b = this.selectionInspectorBridge
      const targets = b && Array.isArray(b.validAttackTargets) ? b.validAttackTargets : []
      const idxRaw = Number(b && b.selectedTargetIndex)
      const idx = Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.floor(idxRaw) : 0
      return {
        canMoveForward: b && typeof b.canMoveForward === 'boolean' ? b.canMoveForward : false,
        canMoveReverse: b && typeof b.canMoveReverse === 'boolean' ? b.canMoveReverse : true,
        validAttackTargets: targets,
        selectedTargetIndex: idx,
        canFire: !!(b && b.canFire),
        canReload: !!(b && b.canReload)
      }
    }
  }
}
</script>

<style scoped lang="scss">
.selection-block__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  min-height: 0;
  padding: 0;
}

.selection-block__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.selection-block__empty {
  align-self: stretch;
  width: 100%;
  max-width: 280px;
  margin: 0 auto;
  padding: 18px 16px;
  color: #555;
  text-align: center;
}

.selection-block__empty h4 {
  color: #333;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0 0 6px;
}

.selection-block__empty p {
  color: #555;
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}
</style>
