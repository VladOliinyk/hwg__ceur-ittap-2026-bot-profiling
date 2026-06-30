<template>
  <div class="terrain-catalog-dialog" role="presentation">
    <div class="terrain-catalog-dialog__backdrop" @click="$emit('close')"></div>

    <section
      class="terrain-catalog-dialog__modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terrain-catalog-dialog-title"
    >
      <header class="terrain-catalog-dialog__header">
        <div>
          <h3 id="terrain-catalog-dialog-title" class="terrain-catalog-dialog__title">
            {{ $t('levelBuilder.terrainCatalog.title') }}
          </h3>
        </div>
        <button
          type="button"
          class="terrain-catalog-dialog__icon-button"
          :aria-label="$t('levelBuilder.terrainCatalog.close')"
          @click="$emit('close')"
        >
          <PhX :size="18" weight="bold" aria-hidden="true" />
        </button>
      </header>

      <div class="terrain-catalog-dialog__table-wrap">
        <table class="terrain-catalog-dialog__table">
          <colgroup>
            <col class="terrain-catalog-dialog__color-col" />
            <col class="terrain-catalog-dialog__name-col" />
            <col class="terrain-catalog-dialog__difficulty-col" />
            <col class="terrain-catalog-dialog__additional-col" />
            <col class="terrain-catalog-dialog__action-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{{ $t('levelBuilder.terrainCatalog.color') }}</th>
              <th scope="col">{{ $t('levelBuilder.terrainCatalog.terrainType') }}</th>
              <th scope="col">{{ $t('levelBuilder.terrainCatalog.terrainDifficulty') }}</th>
              <th scope="col">{{ $t('levelBuilder.terrainCatalog.generatorWeightAdditional') }}</th>
              <th scope="col" class="terrain-catalog-dialog__delete-heading">
                <span class="sr-only">{{ $t('levelBuilder.terrainCatalog.remove') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(terrain, index) in draft"
              :key="terrain._rowKey"
              class="terrain-catalog-dialog__row"
            >
              <td class="terrain-catalog-dialog__color-cell">
                <input
                  v-model="terrain.color"
                  type="color"
                  class="terrain-catalog-dialog__color-input"
                  :aria-label="$t('levelBuilder.terrainCatalog.terrainColor')"
                />
              </td>
              <td>
                <input
                  v-model.trim="terrain.name"
                  type="text"
                  class="terrain-catalog-dialog__text-input"
                  :aria-label="$t('levelBuilder.terrainCatalog.terrainName')"
                />
              </td>
              <td>
                <InlineNumberStepper
                  v-model="terrain.terrainDifficulty"
                  :min="0"
                  :step="1"
                  class="terrain-catalog-dialog__number-input"
                  :aria-label="$t('levelBuilder.terrainCatalog.terrainDifficulty')"
                />
              </td>
              <td>
                <div class="terrain-catalog-dialog__additional">
                  <InlineNumberStepper
                    v-model="terrain.generationWeight"
                    :min="0"
                    :step="1"
                    class="terrain-catalog-dialog__number-input"
                    :aria-label="$t('levelBuilder.terrainCatalog.terrainGeneratorWeight')"
                  />
                  <input
                    v-model.trim="terrain.description"
                    type="text"
                    class="terrain-catalog-dialog__text-input"
                    :placeholder="$t('levelBuilder.terrainCatalog.description')"
                    :aria-label="$t('levelBuilder.terrainCatalog.terrainDescription')"
                  />
                </div>
              </td>
              <td class="terrain-catalog-dialog__delete-cell">
                <button
                  type="button"
                  class="terrain-catalog-dialog__icon-button terrain-catalog-dialog__delete-button"
                  :disabled="!canDeleteTerrain(terrain)"
                  :title="canDeleteTerrain(terrain) ? $t('levelBuilder.terrainCatalog.removeTerrainType') : $t('levelBuilder.terrainCatalog.defaultTerrainCannotBeRemoved')"
                  :aria-label="$tf('levelBuilder.terrainCatalog.removeTerrain', `Remove ${terrain.name || terrain.id}`, { name: terrain.name || terrain.id })"
                  @click="removeTerrain(index)"
                >
                  <PhX :size="18" weight="bold" aria-hidden="true" />
                </button>
              </td>
            </tr>
            <tr class="terrain-catalog-dialog__add-row">
              <td colspan="5">
                <button
                  type="button"
                  class="terrain-catalog-dialog__add-button"
                  @click="addTerrain"
                >
                  <PhPlus :size="18" weight="bold" aria-hidden="true" />
                  <span>{{ $t('levelBuilder.terrainCatalog.addTerrainType') }}</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="terrain-catalog-dialog__footer">
        <button
          type="button"
          class="terrain-catalog-dialog__secondary-button"
          @click="$emit('close')"
        >
          {{ $t('levelBuilder.terrainCatalog.cancel') }}
        </button>
        <button
          type="button"
          class="terrain-catalog-dialog__apply-button"
          :disabled="!canApply"
          @click="applyChanges"
        >
          {{ $t('levelBuilder.terrainCatalog.applyChanges') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script>
import { PhPlus, PhX } from '@phosphor-icons/vue'
import InlineNumberStepper from './InlineNumberStepper.vue'
import {
  DEFAULT_TERRAIN_WEIGHTS,
  UNKNOWN_TERRAIN_WEIGHT,
  terrainWeight
} from '../../domain/level/builderPackage'
import { syncDefaultLocalizedLabel } from '../../utils/packageLabels.js'

const DEFAULT_TERRAIN_IDS = Object.freeze(Object.keys(DEFAULT_TERRAIN_WEIGHTS))
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export default {
  name: 'TerrainCatalogDialog',
  components: {
    InlineNumberStepper,
    PhPlus,
    PhX
  },
  props: {
    terrainTypes: {
      type: Array,
      required: true
    }
  },
  emits: ['apply', 'close'],
  data() {
    return {
      draft: [],
      rowKeySequence: 0
    }
  },
  computed: {
    canApply() {
      if (!Array.isArray(this.draft) || this.draft.length === 0) return false
      const ids = new Set()
      return this.draft.every(terrain => {
        if (!terrain || typeof terrain.id !== 'string' || !terrain.id.trim()) return false
        if (ids.has(terrain.id)) return false
        ids.add(terrain.id)
        return (
          typeof terrain.name === 'string' &&
          terrain.name.trim().length > 0 &&
          HEX_COLOR_RE.test(terrain.color) &&
          this.isNonNegativeFinite(terrain.terrainDifficulty) &&
          this.isNonNegativeFinite(terrain.generationWeight)
        )
      })
    }
  },
  watch: {
    terrainTypes: {
      immediate: true,
      handler() {
        this.resetDraft()
      }
    }
  },
  methods: {
    resetDraft() {
      this.draft = this.terrainTypes.map(terrain => this.createDraftEntry(terrain))
    },
    createDraftEntry(terrain) {
      const source = terrain && typeof terrain === 'object' ? terrain : {}
      const id = typeof source.id === 'string' && source.id.trim()
        ? source.id.trim()
        : this.createCustomTerrainId()
      return {
        ...source,
        id,
        name: typeof source.name === 'string' && source.name.trim()
          ? source.name.trim()
          : this.nameFromId(id),
        color: HEX_COLOR_RE.test(source.color) ? source.color : '#CCCCCC',
        terrainDifficulty: this.toNonNegativeNumber(source.terrainDifficulty, 0),
        generationWeight: this.toNonNegativeNumber(
          source.generationWeight,
          terrainWeight(id)
        ),
        description: typeof source.description === 'string' ? source.description : '',
        _rowKey: `${id}-${this.rowKeySequence++}`
      }
    },
    addTerrain() {
      const id = this.createCustomTerrainId()
      this.draft.push(this.createDraftEntry({
        id,
        name: `Custom terrain ${this.draft.length + 1}`,
        color: '#607D3B',
        terrainDifficulty: 1,
        generationWeight: UNKNOWN_TERRAIN_WEIGHT,
        description: ''
      }))
    },
    removeTerrain(index) {
      const terrain = this.draft[index]
      if (!this.canDeleteTerrain(terrain)) return
      this.draft.splice(index, 1)
    },
    canDeleteTerrain(terrain) {
      return !!(
        terrain &&
        typeof terrain.id === 'string' &&
        !DEFAULT_TERRAIN_IDS.includes(terrain.id)
      )
    },
    applyChanges() {
      if (!this.canApply) return
      const terrainTypes = this.draft.map((terrain, index) => {
        const normalized = { ...terrain }
        delete normalized._rowKey
        normalized.id = terrain.id.trim()
        normalized.name = terrain.name.trim() || `Terrain ${index + 1}`
        const labels = syncDefaultLocalizedLabel(terrain.labels, normalized.name)
        if (labels) normalized.labels = labels
        else delete normalized.labels
        normalized.color = HEX_COLOR_RE.test(terrain.color) ? terrain.color : '#CCCCCC'
        normalized.terrainDifficulty = this.toNonNegativeNumber(terrain.terrainDifficulty, 0)
        normalized.generationWeight = this.toNonNegativeNumber(
          terrain.generationWeight,
          UNKNOWN_TERRAIN_WEIGHT
        )
        const description = typeof terrain.description === 'string'
          ? terrain.description.trim()
          : ''
        if (description) {
          normalized.description = description
        } else {
          delete normalized.description
        }
        return normalized
      })
      this.$emit('apply', terrainTypes)
    },
    createCustomTerrainId() {
      const ids = new Set(this.draft.map(terrain => terrain && terrain.id).filter(Boolean))
      let index = ids.size + 1
      let id = `custom_terrain_${index}`
      while (ids.has(id)) {
        index += 1
        id = `custom_terrain_${index}`
      }
      return id
    },
    nameFromId(id) {
      return String(id)
        .replace(/[_-]+/g, ' ')
        .replace(/^\w/, letter => letter.toUpperCase())
    },
    isNonNegativeFinite(value) {
      if (value === '' || value == null) return false
      const n = Number(value)
      return Number.isFinite(n) && n >= 0
    },
    toNonNegativeNumber(value, fallback) {
      if (value === '' || value == null) return fallback
      const n = Number(value)
      return Number.isFinite(n) && n >= 0 ? n : fallback
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

.terrain-catalog-dialog {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;

  &__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
  }

  &__modal {
    position: relative;
    z-index: 1;
    width: min(1040px, calc(100vw - 48px));
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
    min-width: 820px;
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
      color: $text-secondary;
      font-weight: $font-weight-medium;
      background-color: rgba(0, 0, 0, 0.02);
    }

    tbody tr:hover:not(.terrain-catalog-dialog__add-row) {
      background: rgba($primary-color, 0.04);
    }
  }

  &__delete-heading,
  &__delete-cell,
  &__color-cell {
    text-align: center;
  }

  &__color-col,
  &__action-col {
    width: 8%;
  }

  &__name-col {
    width: 22%;
  }

  &__difficulty-col {
    width: 16%;
  }

  &__additional-col {
    width: 46%;
  }

  &__color-input {
    width: 30px;
    height: 30px;
    padding: 0;
    border: $border-width solid $border-dark;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: none;
      border-radius: 5px;
    }
  }

  &__text-input,
  &__number-input {
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

  &__text-input {
    padding: 4px 6px;
  }

  &__number-input {
    height: 30px;
    max-width: 120px;
  }

  &__additional {
    display: grid;
    grid-template-columns: 120px minmax(220px, 1fr);
    gap: 10px;
    align-items: end;
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

  &__delete-button:hover:not(:disabled) {
    border-color: $error-color;
    color: $error-color;
  }

  &__delete-button {
    border: none;
    background: transparent;
    color: $text-muted;

    &:hover:not(:disabled) {
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
  .terrain-catalog-dialog {
    padding: 12px;

    &__modal {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
    }

    &__additional {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
  }
}
</style>
