<template>
  <div class="turntable-builder-step">
    <section
      class="turntable-builder-step__victory-panel"
      :aria-label="$t('levelBuilder.turntableBuilder.victoryConditions')"
    >
      <div class="turntable-builder-step__victory-header">
        <div>
          <h3 class="turntable-builder-step__victory-title">{{ $t('levelBuilder.turntableBuilder.victoryConditions') }}</h3>
          <p class="turntable-builder-step__victory-note">{{ $t('levelBuilder.turntableBuilder.victoryNote') }}</p>
        </div>
      </div>

      <div class="turntable-builder-step__victory-grid">
        <label class="turntable-builder-step__field">
          <span class="turntable-builder-step__field-label">{{ $t('levelBuilder.turntableBuilder.primaryObjective') }}</span>
          <select
            class="turntable-builder-step__select"
            :value="selectedObjectiveType"
            @change="onObjectiveTypeChange"
          >
            <option
              v-for="option in objectiveOptions"
              :key="option.type"
              :value="option.type"
              :disabled="option.disabled"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div
          class="turntable-builder-step__deadline-control"
          :class="{ 'turntable-builder-step__deadline-control--active': deadlineEnabled }"
        >
          <label
            class="turntable-builder-step__victory-switch"
            :class="{ 'turntable-builder-step__victory-switch--disabled': deadlineRequired }"
          >
            <input
              type="checkbox"
              role="switch"
              class="turntable-builder-step__victory-switch-input"
              :checked="deadlineEnabled"
              :disabled="deadlineRequired"
              @change="onDeadlineToggle"
            />
            <span class="turntable-builder-step__victory-switch-track" aria-hidden="true"></span>
            <span class="turntable-builder-step__victory-switch-label">{{ $t('levelBuilder.turntableBuilder.limitTurns') }}</span>
          </label>
          <div class="turntable-builder-step__survive-stepper" :aria-label="$t('levelBuilder.turntableBuilder.deadlineTurns')">
            <button
              type="button"
              class="turntable-builder-step__stepper-btn"
              :disabled="!deadlineEnabled || deadlineTurns <= 2"
              :aria-label="$t('levelBuilder.turntableBuilder.decreaseDeadlineTurns')"
              @click="emitDeadlineTurns(deadlineTurns - 1)"
            >-</button>
            <input
              type="number"
              min="2"
              max="999"
              class="turntable-builder-step__number-input"
              :disabled="!deadlineEnabled"
              :value="deadlineTurns"
              :aria-label="$t('levelBuilder.turntableBuilder.deadlineTurns')"
              @input="onDeadlineTurnsInput"
            />
            <button
              type="button"
              class="turntable-builder-step__stepper-btn"
              :disabled="!deadlineEnabled || deadlineTurns >= 999"
              :aria-label="$t('levelBuilder.turntableBuilder.increaseDeadlineTurns')"
              @click="emitDeadlineTurns(deadlineTurns + 1)"
            >+</button>
          </div>
        </div>
      </div>

      <p
        v-if="!redBaseAvailable || !blueBaseAvailable"
        class="turntable-builder-step__victory-note turntable-builder-step__victory-note--muted"
      >
        {{ unavailableBaseText }}
      </p>

      <div class="turntable-builder-step__red-preview">
        <span class="turntable-builder-step__field-label">{{ $t('levelBuilder.turntableBuilder.redPreview') }}</span>
        <p class="turntable-builder-step__victory-note">{{ redPreviewText }}</p>
      </div>
    </section>

    <div class="turntable-builder-step__sides">
      <section
        v-for="side in sides"
        :key="side.key"
        class="turntable-builder-step__side"
        :class="{
          'turntable-builder-step__side--player': side.key === 'Our_operations',
          'turntable-builder-step__side--enemy': side.key === 'Enemy_operations'
        }"
        :aria-label="$tf('levelBuilder.turntableBuilder.sideOperations', `${side.title} operations`, { title: side.title })"
      >
        <header class="turntable-builder-step__side-header">
          <h3 class="turntable-builder-step__side-title">{{ side.title }}</h3>
          <span class="turntable-builder-step__side-key">{{ side.key }}</span>
        </header>

        <TurntableMatrixEditor
          v-if="operationsFor(side.key).length > 0"
          :operations="operationsFor(side.key)"
          @toggle-action="(opIdx, faceIdx, action) => $emit('toggle-action', side.key, opIdx, faceIdx, action)"
        />

        <p
          v-if="side.key === 'Our_operations' && operationsFor(side.key).length > 0"
          class="turntable-builder-step__note"
        >
          {{ $t('levelBuilder.turntableBuilder.playerActionOrderNote') }}
        </p>

        <p
          v-if="operationsFor(side.key).length === 0"
          class="turntable-builder-step__empty"
        >
          {{ $t('levelBuilder.turntableBuilder.emptyStart') }}
          <strong>{{ $t('levelBuilder.turntableBuilder.resetToDefault') }}</strong>
          {{ $t('levelBuilder.turntableBuilder.emptyEnd') }}
        </p>
      </section>
    </div>

    <TurntableWorkflowPanel
      @reset="$emit('reset-turntable')"
      @mirror="(direction) => $emit('mirror-turntable', direction)"
    />
  </div>
</template>

<script>
import TurntableWorkflowPanel from './TurntableWorkflowPanel.vue'
import TurntableMatrixEditor from './TurntableMatrixEditor.vue'

const SIDES = Object.freeze([
  { key: 'Our_operations', titleKey: 'levelBuilder.turntableBuilder.ourPlayer', title: 'Our (player)' },
  { key: 'Enemy_operations', titleKey: 'levelBuilder.turntableBuilder.enemy', title: 'Enemy' }
])

const OBJECTIVE_TYPES = Object.freeze({
  ELIMINATE_UNITS: 'eliminateUnits',
  OCCUPY_BASE: 'occupyBase',
  PROTECT_BASE: 'protectBase',
  SURVIVE_TURNS: 'surviveTurns'
})

export default {
  name: 'TurntableBuilderStep',
  components: { TurntableWorkflowPanel, TurntableMatrixEditor },
  props: {
    turntableData: { type: Object, default: null },
    victoryConditionSettings: { type: Object, required: true },
    redBaseAvailable: { type: Boolean, default: false },
    blueBaseAvailable: { type: Boolean, default: false },
    baseObjectiveAvailable: { type: Boolean, default: false }
  },
  emits: ['reset-turntable', 'mirror-turntable', 'toggle-action', 'update-victory-condition'],
  computed: {
    sides() {
      return SIDES.map(side => ({
        ...side,
        title: this.$tf(side.titleKey, side.title)
      }))
    },
    effectiveRedBaseAvailable() {
      return this.redBaseAvailable || this.baseObjectiveAvailable
    },
    effectiveBlueBaseAvailable() {
      return this.blueBaseAvailable || this.baseObjectiveAvailable
    },
    selectedObjectiveType() {
      const type = this.victoryConditionSettings && this.victoryConditionSettings.type
      if (type === OBJECTIVE_TYPES.OCCUPY_BASE && !this.effectiveRedBaseAvailable) {
        return OBJECTIVE_TYPES.ELIMINATE_UNITS
      }
      if (type === OBJECTIVE_TYPES.PROTECT_BASE && !this.effectiveBlueBaseAvailable) {
        return OBJECTIVE_TYPES.ELIMINATE_UNITS
      }
      return Object.values(OBJECTIVE_TYPES).includes(type)
        ? type
        : OBJECTIVE_TYPES.ELIMINATE_UNITS
    },
    objectiveOptions() {
      return [
        {
          type: OBJECTIVE_TYPES.ELIMINATE_UNITS,
          label: this.$t('levelBuilder.turntableBuilder.destroyAllEnemyUnits')
        },
        {
          type: OBJECTIVE_TYPES.OCCUPY_BASE,
          label: this.$t('levelBuilder.turntableBuilder.occupyEnemyBase'),
          disabled: !this.effectiveRedBaseAvailable
        },
        {
          type: OBJECTIVE_TYPES.PROTECT_BASE,
          label: this.$t('levelBuilder.turntableBuilder.protectOwnBase'),
          disabled: !this.effectiveBlueBaseAvailable
        },
        {
          type: OBJECTIVE_TYPES.SURVIVE_TURNS,
          label: this.$t('levelBuilder.turntableBuilder.surviveTurns')
        }
      ]
    },
    deadlineRequired() {
      return this.selectedObjectiveType === OBJECTIVE_TYPES.PROTECT_BASE ||
        this.selectedObjectiveType === OBJECTIVE_TYPES.SURVIVE_TURNS
    },
    deadlineEnabled() {
      return this.deadlineRequired ||
        (this.victoryConditionSettings && this.victoryConditionSettings.deadlineEnabled === true)
    },
    deadlineTurns() {
      const value = this.victoryConditionSettings && (
        this.victoryConditionSettings.deadlineTurns != null
          ? this.victoryConditionSettings.deadlineTurns
          : this.victoryConditionSettings.surviveTurnsCount
      )
      const n = Number(value)
      if (!Number.isFinite(n)) return 10
      return Math.max(2, Math.min(999, Math.trunc(n)))
    },
    unavailableBaseText() {
      const needs = []
      if (!this.effectiveRedBaseAvailable) needs.push(this.$t('levelBuilder.turntableBuilder.redBaseUnavailable'))
      if (!this.effectiveBlueBaseAvailable) needs.push(this.$t('levelBuilder.turntableBuilder.blueBaseUnavailable'))
      return needs.join(' ')
    },
    redPreviewText() {
      const prefix = this.$t('levelBuilder.turntableBuilder.redPreviewWipe')
      if (this.selectedObjectiveType === OBJECTIVE_TYPES.OCCUPY_BASE) {
        return `${prefix} ${this.$t('levelBuilder.turntableBuilder.redPreviewStopOccupy')}`
      }
      if (this.selectedObjectiveType === OBJECTIVE_TYPES.PROTECT_BASE) {
        return `${prefix} ${this.$t('levelBuilder.turntableBuilder.redPreviewCaptureBlueBase')}`
      }
      if (this.selectedObjectiveType === OBJECTIVE_TYPES.SURVIVE_TURNS) {
        return `${prefix} ${this.$t('levelBuilder.turntableBuilder.redPreviewStopSurvive')}`
      }
      return prefix
    }
  },
  methods: {
    operationsFor(key) {
      const ops = this.turntableData && this.turntableData[key]
      return Array.isArray(ops) ? ops : []
    },
    onObjectiveTypeChange(event) {
      this.$emit('update-victory-condition', {
        key: 'type',
        value: event.target.value
      })
    },
    onDeadlineToggle(event) {
      this.$emit('update-victory-condition', {
        key: 'deadlineEnabled',
        value: event.target.checked === true
      })
    },
    emitDeadlineTurns(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return
      this.$emit('update-victory-condition', {
        key: 'deadlineTurns',
        deadlineTurns: Math.max(2, Math.min(999, Math.trunc(n)))
      })
    },
    onDeadlineTurnsInput(event) {
      this.emitDeadlineTurns(event.target.valueAsNumber)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.turntable-builder-step {
  display: flex;
  flex-direction: column;
  gap: $panel-gap;

  &__sides {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: $panel-gap;
    align-items: start;
  }

  &__side {
    --turntable-builder-accent: #1e88e5;
    --turntable-builder-accent-soft: rgba(30, 136, 229, 0.2);
    --turntable-builder-accent-strong: rgba(30, 136, 229, 0.38);

    padding: $panel-padding;
    background-color: $surface-color;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    box-shadow: $panel-shadow;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__side--enemy {
    --turntable-builder-accent: #d32f2f;
    --turntable-builder-accent-soft: rgba(211, 47, 47, 0.2);
    --turntable-builder-accent-strong: rgba(211, 47, 47, 0.38);
  }

  &__side-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  &__side-title {
    margin: 0;
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__side-key {
    font-family: monospace;
    font-size: $font-size-small;
    color: $text-muted;
  }

  &__empty {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-muted;
    font-style: italic;
  }

  &__note {
    margin: 0;
    color: $text-muted;
    font-size: $font-size-small;
    line-height: 1.35;
  }

  &__victory-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    background-color: #f8fafc;
    border: $border-width solid #d8dee6;
    border-radius: 6px;
  }

  &__victory-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  &__victory-title {
    margin: 0;
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__victory-note {
    margin: 0;
    color: $text-secondary;
    font-size: $font-size-normal;
    line-height: 1.35;

    &--muted {
      color: $disabled-color;
    }
  }

  &__victory-title + &__victory-note {
    margin-top: 4px;
  }

  &__victory-grid {
    display: grid;
    grid-template-columns: minmax(280px, 520px) minmax(240px, 320px);
    gap: 14px;
    align-items: end;
    justify-content: start;
  }

  &__victory-switch {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    color: $text-secondary;
    cursor: pointer;
    user-select: none;

    &--disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  }

  &__victory-switch-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  &__victory-switch-track {
    position: relative;
    flex: 0 0 38px;
    width: 38px;
    height: 20px;
    border: $border-width solid $border-color;
    border-radius: 999px;
    background-color: $border-light;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.16);
    transition: background-color $transition-fast $transition-easing,
      border-color $transition-fast $transition-easing,
      box-shadow $transition-fast $transition-easing;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: $surface-color;
      box-shadow: $switch-shadow;
      transition: transform $transition-fast $transition-easing;
    }
  }

  &__victory-switch-input:checked + &__victory-switch-track {
    border-color: $primary-color;
    background-color: $primary-color;

    &::after {
      transform: translateX(18px);
    }
  }

  &__victory-switch-input:focus-visible + &__victory-switch-track {
    box-shadow: 0 0 0 3px rgba($primary-color, 0.2),
      inset 0 1px 2px rgba(0, 0, 0, 0.16);
  }

  &__victory-switch-input:disabled + &__victory-switch-track {
    border-color: $disabled-color;
  }

  &__victory-switch-label {
    min-width: 0;
    line-height: 1.2;
  }

  &__field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  &__field-label {
    color: $text-secondary;
    font-size: $font-size-small;
    font-weight: $font-weight-bold;
  }

  &__select {
    width: 100%;
    min-width: 0;
    border: $border-width solid $border-color;
    border-radius: 4px;
    padding: 7px 8px;
    color: $text-primary;
    background: $surface-color;
    font-size: $font-size-normal;
  }

  &__deadline-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 116px;
    align-items: center;
    gap: 10px;
    min-height: 34px;
  }

  &__red-preview {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
    padding: 10px 12px;
    border: $border-width solid #e2e8f0;
    border-radius: 4px;
    background: $surface-color;
  }

  &__survive-stepper {
    min-width: 0;
    display: flex;
    align-items: stretch;
    border: $border-width solid $border-color;
    border-radius: 4px;
    overflow: hidden;
    background: $surface-color;
  }

  &__stepper-btn {
    flex: 0 0 30px;
    border: none;
    background-color: $surface-color;
    color: $text-primary;
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      background-color: $primary-light;
      color: $primary-color;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__number-input {
    flex: 1;
    min-width: 0;
    border: none;
    padding: 6px 4px;
    font-size: $font-size-medium;
    text-align: center;
    background: $surface-color;
    color: $text-primary;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    appearance: textfield;
    -moz-appearance: textfield;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

@media (max-width: 960px) {
  .turntable-builder-step__sides {
    grid-template-columns: minmax(0, 1fr);
  }

  .turntable-builder-step__victory-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .turntable-builder-step__deadline-control {
    grid-template-columns: minmax(0, 1fr) 116px;
  }
}

@media (max-width: 560px) {
  .turntable-builder-step__deadline-control,
  .turntable-builder-step__red-preview {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
