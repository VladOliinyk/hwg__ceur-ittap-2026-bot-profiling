<template>
  <section
    class="unit-roster-editor"
    :class="{ 'unit-roster-editor--readonly': readonly }"
    :aria-labelledby="titleId"
  >
    <header class="unit-roster-editor__header">
      <h3 :id="titleId" class="unit-roster-editor__title">{{ title }}</h3>
      <ul class="unit-roster-editor__status">
        <li class="unit-roster-editor__stat">
          <span class="unit-roster-editor__stat-value">{{ totalUnits }}</span>
          <span class="unit-roster-editor__stat-label">{{ totalUnitsLabel }}</span>
        </li>
        <li class="unit-roster-editor__stat">
          <span class="unit-roster-editor__stat-value">{{ deploymentSlotCount }}</span>
          <span class="unit-roster-editor__stat-label">{{ deploymentSlotLabel }}</span>
        </li>
        <li
          class="unit-roster-editor__deployment-badge"
          :class="errorCount > 0
            ? 'unit-roster-editor__deployment-badge--errors'
            : 'unit-roster-editor__deployment-badge--ok'"
        >
          {{ errorCount > 0 ? errorCountLabel : $t('levelBuilder.unitRoster.deploymentOk') }}
        </li>
        <li
          v-if="warningCount > 0"
          class="unit-roster-editor__deployment-badge unit-roster-editor__deployment-badge--warnings"
        >
          {{ warningCountLabel }}
        </li>
      </ul>
    </header>

    <div
      v-if="roster && Array.isArray(roster.units) && roster.units.length > 0"
      class="unit-roster-editor__table-wrapper"
    >
      <table class="unit-roster-editor__table">
        <colgroup>
          <col class="unit-roster-editor__type-col" />
          <col span="7" class="unit-roster-editor__num-col" />
          <col class="unit-roster-editor__action-col" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" class="unit-roster-editor__type-cell">{{ $t('levelBuilder.unitRoster.type') }}</th>
            <th scope="col">{{ $t('levelBuilder.unitRoster.count') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.health')">{{ $t('levelBuilder.unitRoster.hp') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.movement')">{{ $t('levelBuilder.unitRoster.mv') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.attackRange')">{{ $t('levelBuilder.unitRoster.rng') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.fireAngleTitle')">{{ $t('levelBuilder.unitRoster.arc') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.attackPower')">{{ $t('levelBuilder.unitRoster.atk') }}</th>
            <th scope="col" :title="$t('levelBuilder.unitRoster.maximumTerrainDifficulty')">{{ $t('levelBuilder.unitRoster.maxT') }}</th>
            <th scope="col"><span class="sr-only">{{ $t('levelBuilder.unitRoster.remove') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(unit, idx) in roster.units"
            :key="`${playerKey}-${idx}-${unit.type}`"
          >
            <td class="unit-roster-editor__type-cell unit-roster-editor__field unit-roster-editor__field--type">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.type') }}
              </span>
              <select
                class="unit-roster-editor__select"
                :value="unit.type"
                :disabled="readonly"
                @change="$emit('set-type', idx, $event.target.value)"
              >
                <option :value="unit.type">{{ unitTypeLabel(unit.type) }}</option>
                <option v-for="t in availableTypes" :key="t" :value="t">{{ unitTypeLabel(t) }}</option>
              </select>
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.count') }}
              </span>
              <InlineNumberStepper
                :model-value="unit.count"
                :min="0"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'count')]"
                :aria-label="$t('levelBuilder.unitRoster.count')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'count')"
                @blur="emitCompareBlur(unit, 'count')"
                @update:model-value="emitNumberValue(idx, 'count', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.hp') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'health')"
                :min="1"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'health')]"
                :aria-label="$t('levelBuilder.unitRoster.health')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'health')"
                @blur="emitCompareBlur(unit, 'health')"
                @update:model-value="emitNumberValue(idx, 'health', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.mv') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'movement')"
                :min="0"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'movement')]"
                :aria-label="$t('levelBuilder.unitRoster.movement')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'movement')"
                @blur="emitCompareBlur(unit, 'movement')"
                @update:model-value="emitNumberValue(idx, 'movement', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.rng') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'attackRange')"
                :min="0"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'attackRange')]"
                :aria-label="$t('levelBuilder.unitRoster.attackRange')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'attackRange')"
                @blur="emitCompareBlur(unit, 'attackRange')"
                @update:model-value="emitNumberValue(idx, 'attackRange', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.arc') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'attackAngle')"
                :min="0"
                :max="4"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'attackAngle')]"
                :aria-label="$t('levelBuilder.unitRoster.fireAngle')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'attackAngle')"
                @blur="emitCompareBlur(unit, 'attackAngle')"
                @update:model-value="emitNumberValue(idx, 'attackAngle', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.atk') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'attackPower')"
                :min="0"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'attackPower')]"
                :aria-label="$t('levelBuilder.unitRoster.attackPower')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'attackPower')"
                @blur="emitCompareBlur(unit, 'attackPower')"
                @update:model-value="emitNumberValue(idx, 'attackPower', $event)"
              />
            </td>
            <td class="unit-roster-editor__field">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.maxT') }}
              </span>
              <InlineNumberStepper
                :model-value="unitFieldValue(unit, 'maxTerrainDifficulty')"
                :min="0"
                :class="['unit-roster-editor__num', comparisonInputClass(unit, 'maxTerrainDifficulty')]"
                :aria-label="$t('levelBuilder.unitRoster.maxTerrainDifficulty')"
                :disabled="readonly"
                @focus="emitCompareFocus(unit, 'maxTerrainDifficulty')"
                @blur="emitCompareBlur(unit, 'maxTerrainDifficulty')"
                @update:model-value="emitNumberValue(idx, 'maxTerrainDifficulty', $event)"
              />
            </td>
            <td class="unit-roster-editor__field unit-roster-editor__field--action">
              <span class="unit-roster-editor__mobile-label" aria-hidden="true">
                {{ $t('levelBuilder.unitRoster.remove') }}
              </span>
              <button
                type="button"
                class="unit-roster-editor__remove-btn"
                :aria-label="$t('levelBuilder.unitRoster.removeUnit')"
                :disabled="readonly"
                @click="$emit('remove-unit', idx)"
              >×</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="unit-roster-editor__empty">{{ $t('levelBuilder.unitRoster.empty') }}</p>

    <div class="unit-roster-editor__add">
      <select v-model="addType" class="unit-roster-editor__select" :disabled="readonly">
        <option value="">{{ $t('levelBuilder.unitRoster.addUnitType') }}</option>
        <option v-for="t in availableTypes" :key="t" :value="t">{{ unitTypeLabel(t) }}</option>
      </select>
      <button
        type="button"
        class="unit-roster-editor__add-btn"
        :disabled="readonly || !addType"
        @click="onAdd"
      >{{ $t('levelBuilder.unitRoster.add') }}</button>
    </div>

    <ul
      v-if="blockingIssues.length"
      class="unit-roster-editor__issues unit-roster-editor__issues--errors"
      :aria-label="$tf('levelBuilder.unitRoster.errorsAria', `Roster errors for ${title}`, { title })"
    >
      <li
        v-for="(issue, i) in blockingIssues"
        :key="`err-${i}`"
        class="unit-roster-editor__issue"
      >
        <code class="unit-roster-editor__issue-path unit-roster-editor__issue-path--error">{{ issue.path }}</code>
        <span>{{ issue.message }}</span>
      </li>
    </ul>
    <ul
      v-if="advisoryIssues.length"
      class="unit-roster-editor__issues unit-roster-editor__issues--warnings"
      :aria-label="$tf('levelBuilder.unitRoster.warningsAria', `Roster warnings for ${title}`, { title })"
    >
      <li
        v-for="(issue, i) in advisoryIssues"
        :key="`warn-${i}`"
        class="unit-roster-editor__issue"
      >
        <code class="unit-roster-editor__issue-path unit-roster-editor__issue-path--warning">{{ issue.path }}</code>
        <span>{{ issue.message }}</span>
      </li>
    </ul>
  </section>
</template>

<script>
import InlineNumberStepper from './InlineNumberStepper.vue'
import { resolvePackageEntryLabel } from '../../utils/packageLabels.js'

const NUMERIC_COMPARISON_FIELDS = new Set([
  'count',
  'health',
  'movement',
  'attackRange',
  'attackAngle',
  'attackPower',
  'maxTerrainDifficulty'
])

export default {
  name: 'UnitRosterEditor',
  components: {
    InlineNumberStepper
  },
  props: {
    title: { type: String, required: true },
    playerKey: { type: String, required: true },
    roster: { type: Object, default: () => ({ units: [] }) },
    availableTypes: { type: Array, required: true },
    unitTypes: { type: Array, default: () => [] },
    // Number of cells in `generatedMap` whose `<player>Spawn` OR
    // `<player>Base` is true. Matches the validator's
    // `countSpawnSlots(cells, player)` so a roster of base-only anchors
    // still shows a non-zero deployment capacity.
    deploymentSlotCount: { type: Number, required: true },
    // Subset of `validateLevelPackage` errors+warnings whose path applies
    // to this side, each tagged with `severity: 'error' | 'warning'` by
    // the parent. Errors block export (validator returns ok=false),
    // warnings are advisory (validator still returns ok=true).
    unitIssues: { type: Array, default: () => [] },
    comparisonRoster: { type: Object, default: null },
    activeComparison: { type: Object, default: null },
    comparisonAlwaysOn: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false }
  },
  emits: [
    'add-unit',
    'remove-unit',
    'set-type',
    'update-field',
    'compare-focus',
    'compare-blur'
  ],
  data() {
    return {
      addType: ''
    }
  },
  computed: {
    titleId() {
      return `unit-roster-${this.playerKey}-title`
    },
    totalUnits() {
      // Match `validateLevelPackage`'s totalCount accumulator
      // (src/domain/level/validateLevelPackage.js:281–290):
      //   - `unit.count == null` counts as 1 (validator's default)
      //   - a non-negative integer count adds that value
      //   - any other value is treated as 0 here; the validator
      //     emits a separate error for the invalid count
      // Without this alignment, a row imported without a `count` field
      // displays as "0 units" while the export would ship 1 unit.
      if (!this.roster || !Array.isArray(this.roster.units)) return 0
      return this.roster.units.reduce((sum, u) => {
        if (!u) return sum
        if (u.count == null) return sum + 1
        if (Number.isInteger(u.count) && u.count >= 0) return sum + u.count
        return sum
      }, 0)
    },
    errorCount() {
      return this.unitIssues.filter(i => i && i.severity === 'error').length
    },
    warningCount() {
      return this.unitIssues.filter(i => i && i.severity === 'warning').length
    },
    totalUnitsLabel() {
      return this.totalUnits === 1
        ? this.$t('levelBuilder.unitRoster.unit')
        : this.$t('levelBuilder.unitRoster.units')
    },
    deploymentSlotLabel() {
      return this.deploymentSlotCount === 1
        ? this.$t('levelBuilder.unitRoster.deploymentSlot')
        : this.$t('levelBuilder.unitRoster.deploymentSlots')
    },
    errorCountLabel() {
      const label = this.errorCount === 1
        ? this.$t('levelBuilder.unitRoster.error')
        : this.$t('levelBuilder.unitRoster.errors')
      return this.$tf('levelBuilder.unitRoster.errorCount', `${this.errorCount} ${label}`, {
        count: this.errorCount,
        label
      })
    },
    warningCountLabel() {
      const label = this.warningCount === 1
        ? this.$t('levelBuilder.unitRoster.warning')
        : this.$t('levelBuilder.unitRoster.warnings')
      return this.$tf('levelBuilder.unitRoster.warningCount', `${this.warningCount} ${label}`, {
        count: this.warningCount,
        label
      })
    },
    blockingIssues() {
      return this.unitIssues.filter(i => i && i.severity === 'error')
    },
    advisoryIssues() {
      return this.unitIssues.filter(i => i && i.severity === 'warning')
    }
  },
  methods: {
    unitTypeDef(type) {
      const id = type == null ? '' : String(type)
      const unitTypes = Array.isArray(this.unitTypes) ? this.unitTypes : []
      return unitTypes.find(unitType => unitType && unitType.id === id) || null
    },
    unitTypeLabel(type) {
      const def = this.unitTypeDef(type)
      const locale = this.$i18n && this.$i18n.locale ? this.$i18n.locale : undefined
      if (typeof this.$localizedLabel === 'function') {
        return this.$localizedLabel(def || { id: type }, locale, type)
      }
      return resolvePackageEntryLabel(def || { id: type }, locale, type)
    },
    unitFieldValue(unit, field) {
      if (!unit || typeof unit !== 'object') return ''
      if (unit[field] !== undefined && unit[field] !== null) return unit[field]
      const def = this.unitTypeDef(unit.type)
      return def && def[field] !== undefined && def[field] !== null ? def[field] : ''
    },
    comparisonInputClass(unit, field) {
      const status = this.comparisonStatus(unit, field)
      return status ? `unit-roster-editor__num--compare-${status}` : ''
    },
    comparisonStatus(unit, field) {
      if (!this.shouldCompareField(unit, field)) return ''
      const other = this.findComparisonUnit(unit.type)
      if (!other) return ''

      const value = this.numericValue(this.unitFieldValue(unit, field))
      const otherValue = this.numericValue(this.unitFieldValue(other, field))
      if (value === null || otherValue === null) return ''
      if (value === otherValue) return 'equal'

      return value > otherValue ? 'better' : 'worse'
    },
    shouldCompareField(unit, field) {
      if (!unit || !unit.type || !NUMERIC_COMPARISON_FIELDS.has(field)) return false
      if (this.comparisonAlwaysOn) return true
      const active = this.activeComparison
      return Boolean(active && active.type === unit.type && active.field === field)
    },
    findComparisonUnit(type) {
      const units = this.comparisonRoster && Array.isArray(this.comparisonRoster.units)
        ? this.comparisonRoster.units
        : []
      return units.find(u => u && u.type === type) || null
    },
    numericValue(value) {
      if (value === '' || value === null || value === undefined) return null
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : null
    },
    emitCompareFocus(unit, field) {
      if (!unit || !unit.type || !NUMERIC_COMPARISON_FIELDS.has(field)) return
      this.$emit('compare-focus', {
        playerKey: this.playerKey,
        type: unit.type,
        field
      })
    },
    emitCompareBlur(unit, field) {
      if (!unit || !unit.type || !NUMERIC_COMPARISON_FIELDS.has(field)) return
      this.$emit('compare-blur', {
        playerKey: this.playerKey,
        type: unit.type,
        field
      })
    },
    emitNumberField(index, field, event) {
      if (this.readonly) return
      const raw = event && event.target ? event.target.value : ''
      const parsed = event && event.target ? event.target.valueAsNumber : NaN
      const value = raw === '' ? '' : (Number.isFinite(parsed) ? parsed : raw)
      this.$emit('update-field', index, field, value)
    },
    emitNumberValue(index, field, value) {
      if (this.readonly) return
      this.$emit('update-field', index, field, value)
    },
    onAdd() {
      if (this.readonly) return
      if (!this.addType) return
      const type = this.addType
      // Clear the dropdown before emitting so the parent's `addUnitToRoster`
      // is observed against an already-reset UI; matches the legacy roster
      // editor's behavior.
      this.addType = ''
      this.$emit('add-unit', type)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.unit-roster-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: $panel-padding;
  background-color: $surface-color;
  border: $border-width solid $border-color;
  border-radius: $border-radius;
  box-shadow: $panel-shadow;

  &__header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__title {
    margin: 0;
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__status {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }

  &__stat {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  &__stat-value {
    font-size: $font-size-large;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__stat-label {
    font-size: $font-size-normal;
    color: $text-secondary;
  }

  &__deployment-badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;

    &--ok {
      margin-left: auto;
      background-color: rgba($success-color, 0.15);
      color: $success-color;
    }

    &--errors {
      margin-left: auto;
      background-color: rgba($error-color, 0.15);
      color: $error-color;
    }

    &--warnings {
      // Amber/warning palette. Sits to the right of the OK or errors
      // badge so a roster with only warnings reads "Deployment OK"
      // primary + "N warnings" secondary.
      background-color: rgba($warning-color, 0.15);
      color: $warning-color;
    }
  }

  &__table-wrapper {
    overflow-x: auto;
  }

  &__mobile-label {
    display: none;
  }

  &__table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: $font-size-normal;

    th,
    td {
      padding: 5px 4px;
      text-align: left;
      border-bottom: $border-width solid $border-light;
    }

    th:last-child,
    td:last-child {
      width: 32px;
      padding-left: 2px;
      padding-right: 2px;
      text-align: center;
    }

    th {
      font-weight: $font-weight-medium;
      color: $text-secondary;
      background-color: rgba(0, 0, 0, 0.02);
    }
  }

  &__type-cell {
    width: 24%;
  }

  &__type-col {
    width: 24%;
  }

  &__num-col {
    width: 10.4%;
  }

  &__action-col {
    width: 32px;
  }

  &__select {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    border: $border-width solid $border-color;
    border-radius: 4px;
    background: $surface-color;
    font-size: $font-size-normal;
    color: $text-primary;

    &:disabled {
      opacity: 1;
      color: $text-secondary;
      cursor: not-allowed;
    }
  }

  &__num {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    height: 30px;
    border: $border-width solid $border-color;
    border-radius: 4px;
    background: $surface-color;
    font-size: $font-size-normal;
    color: $text-primary;
    transition: border-color $transition-fast $transition-easing,
      background-color $transition-fast $transition-easing,
      box-shadow $transition-fast $transition-easing;

    &:focus-within {
      border-color: $primary-color;
      box-shadow: 0 0 0 2px rgba($primary-color, 0.14);
    }

    &.inline-number-stepper--disabled {
      opacity: 1;
      cursor: not-allowed;
      color: $text-secondary;
    }

    &--compare-better {
      border-color: rgba($success-color, 0.85);
      background-color: rgba($success-color, 0.12);
      box-shadow: 0 0 0 1px rgba($success-color, 0.18);
    }

    &--compare-worse {
      border-color: rgba($error-color, 0.8);
      background-color: rgba($error-color, 0.1);
      box-shadow: 0 0 0 1px rgba($error-color, 0.16);
    }

    &--compare-equal {
      border-color: rgba($primary-color, 0.55);
      background-color: rgba($primary-color, 0.1);
      box-shadow: 0 0 0 1px rgba($primary-color, 0.14);
    }
  }

  &__remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: $text-muted;
    font-size: $font-size-large;
    line-height: 1;
    cursor: pointer;
    min-width: 24px;
    min-height: 24px;
    padding: 2px 4px;
    border-radius: 4px;

    &:hover {
      color: $error-color;
      background-color: rgba($error-color, 0.1);
    }

    &:disabled {
      color: $disabled-color;
      cursor: not-allowed;

      &:hover {
        color: $disabled-color;
        background-color: transparent;
      }
    }
  }

  &__empty {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-muted;
    font-style: italic;
  }

  &__add {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  &__add-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    background-color: $primary-color;
    color: $surface-color;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    cursor: pointer;

    &:disabled {
      background-color: $disabled-background;
      color: $disabled-color;
      cursor: not-allowed;
    }
  }

  &__issues {
    list-style: none;
    margin: 0;
    padding: 8px 12px;
    border: $border-width solid transparent;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;

    &--errors {
      background-color: rgba($error-color, 0.06);
      border-color: rgba($error-color, 0.25);
    }

    &--warnings {
      background-color: rgba($warning-color, 0.06);
      border-color: rgba($warning-color, 0.25);
    }
  }

  &__issue {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: $font-size-normal;
    color: $text-primary;
  }

  &__issue-path {
    font-family: monospace;
    font-size: 0.9em;
    padding: 1px 6px;
    border-radius: 3px;

    &--error {
      color: $error-color;
      background-color: rgba($error-color, 0.08);
    }

    &--warning {
      color: $warning-color;
      background-color: rgba($warning-color, 0.08);
    }
  }
}

@media (max-width: 640px) {
  .unit-roster-editor {
    padding: 14px;

    &__status {
      gap: 8px 12px;
    }

    &__deployment-badge {
      &--ok,
      &--errors {
        margin-left: 0;
      }
    }

    &__table-wrapper {
      overflow-x: visible;
    }

    &__table {
      display: block;
      table-layout: auto;

      colgroup,
      thead {
        display: none;
      }

      tbody {
        display: grid;
        gap: 10px;
      }

      tr {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        padding: 10px;
        border: $border-width solid $border-light;
        border-radius: 6px;
        background-color: rgba($surface-color, 0.72);
      }

      td,
      td:last-child {
        display: flex;
        width: auto;
        min-width: 0;
        flex-direction: column;
        gap: 4px;
        padding: 0;
        border-bottom: 0;
        text-align: left;
      }
    }

    &__type-cell,
    &__field--type,
    &__field--action {
      grid-column: 1 / -1;
      width: auto;
    }

    &__mobile-label {
      display: block;
      min-height: 13px;
      color: $text-secondary;
      font-size: 11px;
      font-weight: $font-weight-medium;
      line-height: 1.15;
    }

    &__select,
    &__num {
      min-height: 32px;
    }

    &__field--action {
      align-items: flex-end;
    }

    &__remove-btn {
      min-width: 32px;
      min-height: 32px;
      border: $border-width solid $border-light;
      background-color: rgba($surface-color, 0.9);
    }

    &__add {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
    }
  }
}

@media (max-width: 360px) {
  .unit-roster-editor {
    &__add {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
