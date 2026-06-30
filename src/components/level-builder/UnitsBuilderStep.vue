<template>
  <div class="units-builder-step">
    <p class="units-builder-step__intro">
      {{ $t('levelBuilder.unitsBuilder.introStart') }}
      <em>{{ $t('levelBuilder.unitsBuilder.mapDeployment') }}</em>.
      {{ $t('levelBuilder.unitsBuilder.introMiddle') }}
      <code>validateLevelPackage</code>:
      <strong>{{ $t('levelBuilder.unitsBuilder.introErrors') }}</strong>
      {{ $t('levelBuilder.unitsBuilder.introEnd') }}
    </p>
    <div class="units-builder-step__toolbar">
      <button
        type="button"
        class="units-builder-step__configure-btn"
        @click="unitCatalogDialogOpen = true"
      >
        <PhGearSix :size="17" weight="bold" aria-hidden="true" />
        <span>{{ $t('levelBuilder.unitsBuilder.configureUnits') }}</span>
      </button>
    </div>
    <div class="units-builder-step__sides">
      <UnitRosterEditor
        :title="$t('levelBuilder.unitsBuilder.player')"
        player-key="player1"
        :roster="player1Roster"
        :available-types="availableTypesByKey.player1"
        :unit-types="unitTypes"
        :deployment-slot-count="deploymentSlots.player1"
        :unit-issues="unitIssuesByKey.player1"
        :comparison-roster="player2Roster"
        :active-comparison="activeComparison"
        :comparison-always-on="comparisonAlwaysOn"
        @add-unit="(type) => emitRosterAdd('player1', type)"
        @remove-unit="(idx) => emitRosterRemove('player1', idx)"
        @set-type="(idx, type) => emitRosterSetType('player1', idx, type)"
        @update-field="(idx, field, value) => emitRosterUpdate('player1', idx, field, value)"
        @compare-focus="setActiveComparison"
        @compare-blur="clearActiveComparison"
      />
      <UnitRosterEditor
        :title="$t('levelBuilder.unitsBuilder.enemy')"
        player-key="player2"
        :roster="player2Roster"
        :available-types="availableTypesByKey.player2"
        :unit-types="unitTypes"
        :deployment-slot-count="deploymentSlots.player2"
        :unit-issues="unitIssuesByKey.player2"
        :comparison-roster="player1Roster"
        :active-comparison="activeComparison"
        :comparison-always-on="comparisonAlwaysOn"
        :readonly="enemySyncLocked"
        @add-unit="(type) => emitRosterAdd('player2', type)"
        @remove-unit="(idx) => emitRosterRemove('player2', idx)"
        @set-type="(idx, type) => emitRosterSetType('player2', idx, type)"
        @update-field="(idx, field, value) => emitRosterUpdate('player2', idx, field, value)"
        @compare-focus="setActiveComparison"
        @compare-blur="clearActiveComparison"
      />
    </div>
    <UnitsWorkflowPanel
      :comparison-always-on="comparisonAlwaysOn"
      :enemy-sync-locked="enemySyncLocked"
      @reset="resetUnits"
      @copy="copyRoster"
      @update:comparison-always-on="(value) => (comparisonAlwaysOn = value)"
      @update:enemy-sync-locked="setEnemySyncLocked"
    />
    <UnitCatalogDialog
      v-if="unitCatalogDialogOpen"
      :unit-types="unitTypes"
      :used-unit-type-ids="usedUnitTypeIds"
      @close="unitCatalogDialogOpen = false"
      @apply="applyUnitTypes"
    />
  </div>
</template>

<script>
import { PhGearSix } from '@phosphor-icons/vue'
import UnitCatalogDialog from './UnitCatalogDialog.vue'
import UnitRosterEditor from './UnitRosterEditor.vue'
import UnitsWorkflowPanel from './UnitsWorkflowPanel.vue'

const EMPTY_ROSTER = Object.freeze({ units: [] })

export default {
  name: 'UnitsBuilderStep',
  components: { PhGearSix, UnitCatalogDialog, UnitRosterEditor, UnitsWorkflowPanel },
  props: {
    unitsData: { type: Object, default: null },
    unitTypes: { type: Array, default: () => [] },
    usedUnitTypeIds: { type: Array, default: () => [] },
    // Per-side deployment capacity from the validator's
    // `countSpawnSlots` function (which counts cells where
    // `<player>Spawn === true || <player>Base === true`). Shape:
    // { player1: number, player2: number }.
    deploymentSlots: { type: Object, required: true },
    availableTypesByKey: { type: Object, required: true },
    // Per-side issues from `validateLevelPackage`, each entry already
    // tagged with `severity: 'error' | 'warning'` by the parent.
    unitIssuesByKey: { type: Object, required: true }
  },
  emits: ['add-unit', 'remove-unit', 'set-type', 'update-field', 'reset-units', 'copy-roster', 'sync-enemy-roster', 'update-unit-types'],
  data() {
    return {
      activeComparison: null,
      comparisonAlwaysOn: false,
      enemySyncLocked: false,
      unitCatalogDialogOpen: false
    }
  },
  computed: {
    player1Roster() {
      return (this.unitsData && this.unitsData.player1) || EMPTY_ROSTER
    },
    player2Roster() {
      return (this.unitsData && this.unitsData.player2) || EMPTY_ROSTER
    }
  },
  methods: {
    emitRosterAdd(playerKey, type) {
      if (!this.canEditRoster(playerKey)) return
      this.$emit('add-unit', playerKey, type)
      this.syncAfterPlayerEdit(playerKey)
    },
    emitRosterRemove(playerKey, idx) {
      if (!this.canEditRoster(playerKey)) return
      this.$emit('remove-unit', playerKey, idx)
      this.syncAfterPlayerEdit(playerKey)
    },
    emitRosterSetType(playerKey, idx, type) {
      if (!this.canEditRoster(playerKey)) return
      this.$emit('set-type', playerKey, idx, type)
      this.syncAfterPlayerEdit(playerKey)
    },
    emitRosterUpdate(playerKey, idx, field, value) {
      if (!this.canEditRoster(playerKey)) return
      this.$emit('update-field', playerKey, idx, field, value)
      this.syncAfterPlayerEdit(playerKey)
    },
    canEditRoster(playerKey) {
      return !(this.enemySyncLocked && playerKey === 'player2')
    },
    syncAfterPlayerEdit(playerKey) {
      if (this.enemySyncLocked && playerKey === 'player1') {
        this.requestEnemySync()
      }
    },
    setEnemySyncLocked(value) {
      this.enemySyncLocked = Boolean(value)
      if (this.enemySyncLocked) {
        this.requestEnemySync()
      }
    },
    requestEnemySync() {
      this.$emit('sync-enemy-roster')
    },
    resetUnits() {
      this.$emit('reset-units')
      if (this.enemySyncLocked) {
        this.requestEnemySync()
      }
    },
    applyUnitTypes(unitTypes) {
      this.$emit('update-unit-types', unitTypes)
      this.unitCatalogDialogOpen = false
    },
    copyRoster(direction) {
      if (direction === 'enemy->player' && this.enemySyncLocked) return
      this.$emit('copy-roster', direction)
    },
    setActiveComparison(payload) {
      if (!payload || !payload.type || !payload.field) return
      this.activeComparison = {
        playerKey: payload.playerKey,
        type: payload.type,
        field: payload.field
      }
    },
    clearActiveComparison(payload) {
      const active = this.activeComparison
      if (!active || !payload) return
      if (
        active.playerKey === payload.playerKey &&
        active.type === payload.type &&
        active.field === payload.field
      ) {
        this.activeComparison = null
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.units-builder-step {
  display: flex;
  flex-direction: column;
  gap: $panel-gap;

  &__intro {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-secondary;
    line-height: 1.4;

    em {
      font-style: normal;
      font-weight: $font-weight-medium;
      color: $text-primary;
    }

    code {
      font-family: monospace;
      font-size: 0.9em;
      background-color: rgba(0, 0, 0, 0.05);
      padding: 1px 5px;
      border-radius: 3px;
    }
  }

  &__toolbar {
    display: flex;
    justify-content: flex-end;
  }

  &__configure-btn {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background: $surface-color;
    color: $text-primary;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: border-color $transition-fast $transition-easing,
      color $transition-fast $transition-easing;

    &:hover {
      border-color: $primary-color;
      color: $primary-color;
    }
  }

  &__sides {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: $panel-gap;
    align-items: start;
  }
}

@media (max-width: 960px) {
  .units-builder-step__sides {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
