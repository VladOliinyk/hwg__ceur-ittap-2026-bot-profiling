<template>
  <div class="unit-catalog-dialog" role="presentation">
    <div class="unit-catalog-dialog__backdrop" @click="$emit('close')"></div>

    <section
      class="unit-catalog-dialog__modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unit-catalog-dialog-title"
    >
      <header class="unit-catalog-dialog__header">
        <h3 id="unit-catalog-dialog-title" class="unit-catalog-dialog__title">
          {{ $t('levelBuilder.unitCatalog.title') }}
        </h3>
        <button
          type="button"
          class="unit-catalog-dialog__icon-button"
          :aria-label="$t('levelBuilder.unitCatalog.close')"
          @click="$emit('close')"
        >
          <PhX :size="18" weight="bold" aria-hidden="true" />
        </button>
      </header>

      <div class="unit-catalog-dialog__table-wrap">
        <table class="unit-catalog-dialog__table">
          <colgroup>
            <col class="unit-catalog-dialog__name-col" />
            <col class="unit-catalog-dialog__id-col" />
            <col class="unit-catalog-dialog__health-col" />
            <col span="5" class="unit-catalog-dialog__attr-col" />
            <col class="unit-catalog-dialog__mode-col" />
            <col class="unit-catalog-dialog__icon-col" />
            <col class="unit-catalog-dialog__action-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.nameTitle')">{{ $t('levelBuilder.unitCatalog.name') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.stableIdTitle')">{{ $t('levelBuilder.unitCatalog.stableId') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.hpTitle')">{{ $t('levelBuilder.unitRoster.hp') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.actionsTitle')">{{ $t('levelBuilder.unitCatalog.actions') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.fireRangeTitle')">{{ $t('levelBuilder.unitCatalog.fireRange') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.fireAngleTitle')">{{ $t('levelBuilder.unitCatalog.fireAngle') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.attackDamageTitle')">{{ $t('levelBuilder.unitCatalog.attackDamage') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.terrainPassabilityTitle')">{{ $t('levelBuilder.unitCatalog.terrainPassability') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.artilleryFireTitle')">{{ $t('levelBuilder.unitCatalog.artilleryFire') }}</th>
              <th scope="col" :title="$t('levelBuilder.unitCatalog.iconTitle')">{{ $t('levelBuilder.unitCatalog.icon') }}</th>
              <th scope="col"><span class="sr-only">{{ $t('levelBuilder.unitCatalog.remove') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(unitType, index) in draft"
              :key="unitType._rowKey"
              class="unit-catalog-dialog__row"
              :class="{ 'unit-catalog-dialog__row--icon-picker-open': isIconPickerOpen(unitType) }"
            >
              <td>
                <input
                  v-model.trim="unitType.name"
                  type="text"
                  class="unit-catalog-dialog__text-input"
                  :aria-label="$t('levelBuilder.unitCatalog.unitTypeName')"
                />
              </td>
              <td>
                <code class="unit-catalog-dialog__id">{{ unitType.id }}</code>
              </td>
              <td>
                <InlineNumberStepper
                  v-model="unitType.health"
                  :min="1"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.health')"
                />
              </td>
              <td>
                <InlineNumberStepper
                  v-model="unitType.movement"
                  :min="0"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.movement')"
                />
              </td>
              <td>
                <InlineNumberStepper
                  v-model="unitType.attackRange"
                  :min="0"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.attackRange')"
                />
              </td>
              <td>
                <InlineNumberStepper
                  :model-value="unitType.attackAngle"
                  :min="0"
                  :max="4"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.fireAngle')"
                  @update:model-value="unitType.attackAngle = coerceAttackAngle($event)"
                />
              </td>
              <td>
                <InlineNumberStepper
                  v-model="unitType.attackPower"
                  :min="0"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.attackPower')"
                />
              </td>
              <td>
                <InlineNumberStepper
                  v-model="unitType.maxTerrainDifficulty"
                  :min="0"
                  :step="1"
                  class="unit-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.unitCatalog.maximumTerrainDifficulty')"
                />
              </td>
              <td class="unit-catalog-dialog__center-cell">
                <input
                  type="checkbox"
                  class="unit-catalog-dialog__checkbox"
                  :checked="unitType.losMode === 'artillery'"
                  :aria-label="$tf('levelBuilder.unitCatalog.indirectFire', `Indirect fire for ${unitType.name || unitType.id}`, { name: unitType.name || unitType.id })"
                  @change="unitType.losMode = $event.target.checked ? 'artillery' : 'direct_fire'"
                />
              </td>
              <td>
                <div
                  class="unit-catalog-dialog__icon-picker"
                  :class="{ 'unit-catalog-dialog__icon-picker--open': isIconPickerOpen(unitType) }"
                >
                  <button
                    type="button"
                    class="unit-catalog-dialog__icon-picker-button"
                    :aria-label="$tf('levelBuilder.unitCatalog.iconStyle', `Icon style: ${iconLabel(unitType.iconKey)}`, { label: iconLabel(unitType.iconKey) })"
                    :aria-expanded="isIconPickerOpen(unitType)"
                    aria-haspopup="listbox"
                    @click="toggleIconPicker(unitType)"
                  >
                    <img
                      class="unit-catalog-dialog__icon-preview"
                      :src="iconPath(unitType.iconKey)"
                      alt=""
                    />
                    <PhCaretDown :size="12" weight="bold" aria-hidden="true" />
                  </button>
                  <div
                    v-if="isIconPickerOpen(unitType)"
                    class="unit-catalog-dialog__icon-grid"
                    role="listbox"
                    :aria-label="$tf('levelBuilder.unitCatalog.chooseIcon', `Choose icon for ${unitType.name || unitType.id}`, { name: unitType.name || unitType.id })"
                  >
                    <button
                      v-for="option in iconOptions"
                      :key="option.value"
                      type="button"
                      class="unit-catalog-dialog__icon-option"
                      :class="{
                        'unit-catalog-dialog__icon-option--selected': option.value === unitType.iconKey,
                        'unit-catalog-dialog__icon-option--used': iconUsageCount(option.value) > 0
                      }"
                      :title="iconOptionTitle(option)"
                      :aria-label="iconOptionAriaLabel(option)"
                      :aria-selected="option.value === unitType.iconKey"
                      :data-icon-key="option.value"
                      :data-icon-usage-count="iconUsageCount(option.value)"
                      role="option"
                      @click="selectIcon(unitType, option.value)"
                    >
                      <img :src="iconPath(option.value)" alt="" />
                      <span
                        v-if="iconUsageCount(option.value) > 0"
                        class="unit-catalog-dialog__icon-usage-badge"
                        aria-hidden="true"
                      >
                        {{ iconUsageCount(option.value) }}
                      </span>
                    </button>
                  </div>
                </div>
              </td>
              <td class="unit-catalog-dialog__center-cell">
                <button
                  type="button"
                  class="unit-catalog-dialog__icon-button unit-catalog-dialog__delete-button"
                  :disabled="!canDeleteUnitType(unitType)"
                  :title="canDeleteUnitType(unitType) ? $t('levelBuilder.unitCatalog.removeUnitType') : $t('levelBuilder.unitCatalog.unitTypeUsed')"
                  :aria-label="$tf('levelBuilder.unitCatalog.removeUnit', `Remove ${unitType.name || unitType.id}`, { name: unitType.name || unitType.id })"
                  @click="removeUnitType(index)"
                >
                  <PhX :size="18" weight="bold" aria-hidden="true" />
                </button>
              </td>
            </tr>
            <tr class="unit-catalog-dialog__add-row">
              <td colspan="11">
                <button
                  type="button"
                  class="unit-catalog-dialog__add-button"
                  @click="addUnitType"
                >
                  <PhPlus :size="18" weight="bold" aria-hidden="true" />
                  <span>{{ $t('levelBuilder.unitCatalog.addUnitType') }}</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="unit-catalog-dialog__footer">
        <button
          type="button"
          class="unit-catalog-dialog__secondary-button"
          @click="$emit('close')"
        >
          {{ $t('levelBuilder.unitCatalog.cancel') }}
        </button>
        <button
          type="button"
          class="unit-catalog-dialog__apply-button"
          :disabled="!canApply"
          @click="applyChanges"
        >
          {{ $t('levelBuilder.unitCatalog.applyChanges') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script>
import { PhCaretDown, PhPlus, PhX } from '@phosphor-icons/vue'
import { getAvailableUnitTypes, getUnitIcon } from '../../assets/icons/index.js'
import { normalizeUnitTypeDef } from '@/domain/engine/gameUnits.js'
import { normalizeAttackAngle } from '@/domain/engine/hexUtils.js'
import { syncDefaultLocalizedLabel } from '../../utils/packageLabels.js'
import InlineNumberStepper from './InlineNumberStepper.vue'

const LOS_MODES = new Set(['direct_fire', 'artillery'])

export default {
  name: 'UnitCatalogDialog',
  components: {
    InlineNumberStepper,
    PhCaretDown,
    PhPlus,
    PhX
  },
  props: {
    unitTypes: { type: Array, required: true },
    usedUnitTypeIds: { type: Array, default: () => [] }
  },
  emits: ['apply', 'close'],
  data() {
    return {
      draft: [],
      openIconPickerRowKey: null,
      rowKeySequence: 0
    }
  },
  computed: {
    usedIds() {
      return new Set(this.usedUnitTypeIds)
    },
    iconOptions() {
      return getAvailableUnitTypes().map(value => ({
        value,
        label: this.labelFromId(value)
      }))
    },
    iconUsageByKey() {
      const usage = new Map()
      this.draft.forEach(unitType => {
        if (!unitType || typeof unitType.iconKey !== 'string') return
        const iconKey = unitType.iconKey.trim()
        if (!iconKey) return
        const name = typeof unitType.name === 'string' && unitType.name.trim()
          ? unitType.name.trim()
          : unitType.id
        if (!usage.has(iconKey)) usage.set(iconKey, [])
        usage.get(iconKey).push(name || this.labelFromId(iconKey))
      })
      return usage
    },
    canApply() {
      if (!Array.isArray(this.draft) || this.draft.length === 0) return false
      const ids = new Set()
      return this.draft.every(unitType => {
        if (!unitType || typeof unitType.id !== 'string' || !unitType.id.trim()) return false
        if (ids.has(unitType.id)) return false
        ids.add(unitType.id)
        return (
          typeof unitType.name === 'string' &&
          unitType.name.trim().length > 0 &&
          this.isPositiveFinite(unitType.health) &&
          this.isNonNegativeFinite(unitType.movement) &&
          this.isNonNegativeFinite(unitType.attackRange) &&
          this.isSupportedAttackAngle(unitType.attackAngle) &&
          this.isNonNegativeFinite(unitType.attackPower) &&
          this.isNonNegativeFinite(unitType.maxTerrainDifficulty) &&
          LOS_MODES.has(unitType.losMode) &&
          typeof unitType.iconKey === 'string' &&
          unitType.iconKey.trim().length > 0
        )
      })
    }
  },
  watch: {
    unitTypes: {
      immediate: true,
      handler() {
        this.resetDraft()
      }
    }
  },
  methods: {
    resetDraft() {
      this.openIconPickerRowKey = null
      this.draft = this.unitTypes.map(unitType => this.createDraftEntry(unitType))
    },
    createDraftEntry(unitType) {
      const normalized = normalizeUnitTypeDef(unitType)
      return {
        ...normalized,
        _rowKey: `${normalized.id}-${this.rowKeySequence++}`
      }
    },
    addUnitType() {
      const id = this.createCustomUnitTypeId()
      this.draft.push(this.createDraftEntry({
        id,
        name: `Custom unit ${this.draft.length + 1}`,
        health: 60,
        movement: 3,
        attackRange: 1,
        attackAngle: 1,
        attackPower: 30,
        maxTerrainDifficulty: 10,
        losMode: 'direct_fire',
        iconKey: 'unknown'
      }))
    },
    removeUnitType(index) {
      const unitType = this.draft[index]
      if (!this.canDeleteUnitType(unitType)) return
      if (this.isIconPickerOpen(unitType)) this.openIconPickerRowKey = null
      this.draft.splice(index, 1)
    },
    canDeleteUnitType(unitType) {
      return !!(unitType && unitType.id && !this.usedIds.has(unitType.id))
    },
    applyChanges() {
      if (!this.canApply) return
      this.openIconPickerRowKey = null
      const unitTypes = this.draft.map(unitType => {
        const normalized = normalizeUnitTypeDef(unitType)
        const labels = syncDefaultLocalizedLabel(normalized.labels, normalized.name)
        return {
          id: normalized.id,
          name: normalized.name,
          ...(labels ? { labels } : {}),
          health: normalized.health,
          movement: normalized.movement,
          attackRange: normalized.attackRange,
          attackAngle: normalized.attackAngle,
          attackPower: normalized.attackPower,
          maxTerrainDifficulty: normalized.maxTerrainDifficulty,
          losMode: normalized.losMode,
          iconKey: normalized.iconKey
        }
      })
      this.$emit('apply', unitTypes)
    },
    createCustomUnitTypeId() {
      const ids = new Set(this.draft.map(unitType => unitType && unitType.id).filter(Boolean))
      let index = ids.size + 1
      let id = `custom_unit_${index}`
      while (ids.has(id)) {
        index += 1
        id = `custom_unit_${index}`
      }
      return id
    },
    toggleIconPicker(unitType) {
      if (!unitType || !unitType._rowKey) return
      this.openIconPickerRowKey = this.isIconPickerOpen(unitType) ? null : unitType._rowKey
    },
    isIconPickerOpen(unitType) {
      return !!(unitType && unitType._rowKey && this.openIconPickerRowKey === unitType._rowKey)
    },
    selectIcon(unitType, iconKey) {
      if (!unitType || typeof iconKey !== 'string' || !iconKey.trim()) return
      unitType.iconKey = iconKey
      this.openIconPickerRowKey = null
    },
    coerceAttackAngle(value) {
      if (value === '') return ''
      const n = Number(value)
      return Number.isFinite(n) ? normalizeAttackAngle(n) : value
    },
    iconPath(iconKey) {
      return getUnitIcon(iconKey)
    },
    iconLabel(iconKey) {
      const option = this.iconOptions.find(candidate => candidate.value === iconKey)
      return option ? option.label : this.labelFromId(iconKey || 'unknown')
    },
    iconUsageNames(iconKey) {
      if (typeof iconKey !== 'string') return []
      return this.iconUsageByKey.get(iconKey) || []
    },
    iconUsageCount(iconKey) {
      return this.iconUsageNames(iconKey).length
    },
    iconUsageLabel(iconKey) {
      const names = this.iconUsageNames(iconKey)
      return names.length > 0
        ? this.$tf('levelBuilder.unitCatalog.usedBy', `Used by ${names.join(', ')}`, { names: names.join(', ') })
        : ''
    },
    iconOptionTitle(option) {
      const usageLabel = this.iconUsageLabel(option.value)
      return usageLabel ? `${option.label} - ${usageLabel}` : option.label
    },
    iconOptionAriaLabel(option) {
      const names = this.iconUsageNames(option.value)
      return names.length > 0
        ? `${option.label}, ${this.$tf('levelBuilder.unitCatalog.usedByAria', `used by ${names.join(', ')}`, { names: names.join(', ') })}`
        : option.label
    },
    labelFromId(id) {
      return String(id)
        .replace(/[_-]+/g, ' ')
        .replace(/^\w/, letter => letter.toUpperCase())
    },
    isPositiveFinite(value) {
      const n = Number(value)
      return Number.isFinite(n) && n > 0
    },
    isNonNegativeFinite(value) {
      const n = Number(value)
      return Number.isFinite(n) && n >= 0
    },
    isSupportedAttackAngle(value) {
      if (value === '' || value === null || value === undefined) return false
      if (typeof value === 'boolean') return false
      const n = Number(value)
      return Number.isInteger(n) && n >= 0 && n <= 4
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

.unit-catalog-dialog {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  --unit-catalog-icon-grid-columns: 6;
  --unit-catalog-icon-grid-gap: 8px;
  --unit-catalog-icon-cell-size: 56px;
  --unit-catalog-icon-image-size: 48px;

  &__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
  }

  &__modal {
    position: relative;
    z-index: 1;
    width: min(1240px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    background: $surface-color;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  }

  &__header,
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: $border-width solid $border-light;
  }

  &__footer {
    justify-content: flex-end;
    border-top: $border-width solid $border-light;
    border-bottom: none;
  }

  &__title {
    margin: 0;
    font-size: $font-size-xlarge;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__table-wrap {
    overflow: auto;
    padding: 14px 18px 18px;
  }

  &__table {
    width: 100%;
    min-width: 1160px;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: $font-size-normal;

    th,
    td {
      padding: 6px 8px;
      border-bottom: $border-width solid $border-light;
      text-align: left;
      vertical-align: middle;
    }

    th {
      white-space: nowrap;
      color: $text-secondary;
      font-weight: $font-weight-medium;
      background-color: rgba(0, 0, 0, 0.02);
    }
  }

  &__name-col {
    width: 12%;
  }

  &__id-col {
    width: 18%;
  }

  &__health-col {
    width: 7%;
  }

  &__attr-col {
    width: 8.5%;
  }

  &__mode-col {
    width: 8.5%;
  }

  &__action-col {
    width: 3%;
  }

  &__icon-col {
    width: 5%;
  }

  &__center-cell {
    text-align: center;
  }

  &__row {
    position: relative;
    z-index: 0;

    &--icon-picker-open {
      z-index: 40;

      td {
        position: relative;
        z-index: 40;
      }
    }
  }

  &__id {
    display: inline-block;
    max-width: 100%;
    padding: 3px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: $border-width solid rgba(0, 0, 0, 0.06);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.035);
    color: $text-secondary;
  }

  &__text-input,
  &__number-input,
  &__select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: $border-width solid $border-color;
    border-radius: 4px;
    background: $surface-color;
    color: $text-primary;
    font-size: $font-size-normal;

    &:focus,
    &:focus-within {
      outline: none;
      border-color: $primary-color;
      box-shadow: 0 0 0 2px rgba($primary-color, 0.18);
    }
  }

  &__text-input,
  &__select {
    min-height: 30px;
    padding: 4px 6px;
  }

  &__number-input {
    height: 30px;
  }

  &__checkbox {
    width: 18px;
    height: 18px;
  }

  &__icon-picker {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    width: 100%;

    &--open {
      z-index: 20;
    }
  }

  &__icon-picker-button {
    width: 58px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 5px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background: $surface-color;
    color: $text-secondary;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
      border-color $transition-fast $transition-easing,
      color $transition-fast $transition-easing;

    &:hover,
    &[aria-expanded='true'] {
      border-color: $primary-color;
      color: $primary-color;
    }

    &:focus {
      outline: none;
      border-color: $primary-color;
      box-shadow: 0 0 0 2px rgba($primary-color, 0.18);
    }
  }

  &__icon-preview {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    object-fit: contain;
  }

  &__icon-grid {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(var(--unit-catalog-icon-grid-columns), var(--unit-catalog-icon-cell-size));
    gap: var(--unit-catalog-icon-grid-gap);
    padding: 10px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background: $surface-color;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  }

  &__icon-option {
    position: relative;
    width: var(--unit-catalog-icon-cell-size);
    height: var(--unit-catalog-icon-cell-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: $border-width solid $border-light;
    border-radius: 6px;
    background: $surface-color;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
      border-color $transition-fast $transition-easing,
      box-shadow $transition-fast $transition-easing;

    &--used {
      border-color: rgba($warning-color, 0.55);
    }

    img {
      width: var(--unit-catalog-icon-image-size);
      height: var(--unit-catalog-icon-image-size);
      object-fit: contain;
      pointer-events: none;
    }

    &:hover,
    &:focus {
      outline: none;
      border-color: $primary-color;
      background: rgba($primary-color, 0.08);
    }

    &--selected {
      border-color: $primary-color;
      background: rgba($primary-color, 0.12);
      box-shadow: inset 0 0 0 1px rgba($primary-color, 0.35);
    }
  }

  &__icon-usage-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    min-width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: $border-width solid $surface-color;
    border-radius: 999px;
    background: $warning-color;
    color: $surface-color;
    font-size: $font-size-small;
    font-weight: $font-weight-bold;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    pointer-events: none;
  }

  &__icon-button,
  &__add-button,
  &__secondary-button,
  &__apply-button {
    border: $border-width solid $border-color;
    border-radius: 6px;
    background: $surface-color;
    color: $text-primary;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
      border-color $transition-fast $transition-easing,
      color $transition-fast $transition-easing,
      opacity $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      border-color: $primary-color;
      color: $primary-color;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__icon-button {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  &__delete-button {
    border: none;
    background: transparent;
    color: $text-muted;

    &:hover:not(:disabled) {
      border-color: $error-color;
      color: $error-color;
      background-color: rgba($error-color, 0.1);
    }
  }

  &__add-row td {
    padding: 12px 10px 2px;
    border-bottom: none;
  }

  &__add-button {
    width: 100%;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-style: dashed;
    color: $text-secondary;
  }

  &__secondary-button,
  &__apply-button {
    min-height: 38px;
    padding: 8px 14px;
    font-weight: $font-weight-medium;
  }

  &__apply-button {
    border-color: $primary-color;
    background: $primary-color;
    color: $surface-color;

    &:hover:not(:disabled) {
      border-color: $primary-hover;
      background: $primary-hover;
      color: $surface-color;
    }
  }
}

@media (max-width: 720px) {
  .unit-catalog-dialog {
    padding: 12px;

    &__modal {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
    }
  }
}

@media (max-width: 520px) {
  .unit-catalog-dialog {
    --unit-catalog-icon-grid-columns: 4;
    --unit-catalog-icon-cell-size: 50px;
    --unit-catalog-icon-image-size: 42px;
  }
}
</style>
