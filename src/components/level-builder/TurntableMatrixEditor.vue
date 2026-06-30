<template>
  <table class="turntable-matrix-editor" :aria-label="$tf('levelBuilder.turntableMatrix.ariaLabel', 'Turntable D6 action matrix')">
    <thead>
      <tr>
        <th scope="col" class="turntable-matrix-editor__face-header">{{ uiText('levelBuilder.turntableMatrix.d6', 'D6') }}</th>
        <th
          v-for="column in tableColumns"
          :key="column.phase"
          scope="col"
          class="turntable-matrix-editor__column-header"
        >
          {{ column.label }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in combinedRows"
        :key="row.faceIdx"
        class="turntable-matrix-editor__row"
      >
        <th scope="row" class="turntable-matrix-editor__face">{{ row.faceIdx + 1 }}</th>
        <td
          v-for="cell in row.cells"
          :key="cell.phase"
          class="turntable-matrix-editor__cell"
        >
          <div class="turntable-matrix-editor__actions">
            <button
              v-for="action in cell.actions"
              :key="action"
              type="button"
              class="turntable-matrix-editor__chip"
              :class="{
                'turntable-matrix-editor__chip--active': cell.selected.includes(action)
              }"
              :aria-pressed="cell.selected.includes(action) ? 'true' : 'false'"
              :disabled="cell.opIndex < 0"
              @click="$emit('toggle-action', cell.opIndex, row.faceIdx, action)"
            >
              <span
                v-if="selectedActionPriority(cell.selected, action)"
                class="turntable-matrix-editor__chip-indicator turntable-matrix-editor__chip-priority"
              >
                {{ selectedActionPriority(cell.selected, action) }}
              </span>
              <span
                v-else
                class="turntable-matrix-editor__chip-indicator turntable-matrix-editor__chip-indicator--empty"
                aria-hidden="true"
              >
                <PhProhibit :size="16" weight="bold" />
              </span>
              <span class="turntable-matrix-editor__chip-label">{{ action }}</span>
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script>
import { ACTION_TYPES, PHASES } from '@/domain/rules/actionTypes'
import { PhProhibit } from '@phosphor-icons/vue'
import { i18nTextMixin } from '@/ui/i18nTextMixin.js'

const MANOEUVRE_ACTIONS = Object.freeze([
  ACTION_TYPES.MOVE,
  ACTION_TYPES.REVERSE,
  ACTION_TYPES.TURN
])

const ATTACK_ACTIONS = Object.freeze([
  ACTION_TYPES.FIRE,
  ACTION_TYPES.RELOAD
])

export default {
  name: 'TurntableMatrixEditor',
  mixins: [i18nTextMixin],
  components: { PhProhibit },
  props: {
    // Back-compat for defensive computed tests and any single-operation callers.
    operation: { type: Object, default: null },
    operations: { type: Array, default: null }
  },
  emits: ['toggle-action'],
  computed: {
    tableColumns() {
      return [
        {
          label: this.uiText('levelBuilder.turntableMatrix.manoeuvre', 'Manoeuvre'),
          phase: PHASES.MANOEUVRE,
          fallbackIndex: 0,
          actions: MANOEUVRE_ACTIONS
        },
        {
          label: this.uiText('levelBuilder.turntableMatrix.attack', 'Attack'),
          phase: PHASES.ATTACK,
          fallbackIndex: 1,
          actions: ATTACK_ACTIONS
        }
      ]
    },
    operationsList() {
      if (Array.isArray(this.operations)) return this.operations
      return this.operation ? [this.operation] : []
    },
    operationEntries() {
      return this.tableColumns.map(column => {
        const opIndex = this.operationIndexForPhase(column.phase, column.fallbackIndex)
        return {
          ...column,
          opIndex,
          operation: opIndex >= 0 ? this.operationsList[opIndex] : null
        }
      })
    },
    combinedRows() {
      const rows = []
      for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
        rows.push({
          faceIdx,
          cells: this.operationEntries.map(entry => ({
            ...entry,
            selected: this.diceRowFor(entry.operation, faceIdx)
              .filter(action => entry.actions.includes(action))
          }))
        })
      }
      return rows
    },
    // Safe label kept for direct computed tests and legacy single-operation use.
    operationLabel() {
      const title = this.operation && this.operation.title
      return typeof title === 'string' && title.trim()
        ? title
        : this.uiText('levelBuilder.turntableMatrix.operationFallback', 'operation')
    },
    diceRows() {
      // Defensive normalization: the validator requires exactly 6 dice
      // rows of arrays. Padding/clipping here keeps the editor rendering
      // even if a malformed import sneaks past validation.
      const move = this.operation && Array.isArray(this.operation.moves)
        ? this.operation.moves[0]
        : null
      const raw = move && Array.isArray(move.dice) ? move.dice : []
      const out = []
      for (let i = 0; i < 6; i++) {
        const row = raw[i]
        out.push(Array.isArray(row) ? row : [])
      }
      return out
    }
  },
  methods: {
    normalizeOperationPhase(title) {
      if (typeof title !== 'string') return ''
      const normalized = title.trim().toUpperCase()
      if (normalized.startsWith('MANOEUV') || normalized.startsWith('MANEUVER')) {
        return PHASES.MANOEUVRE
      }
      if (normalized.startsWith('ATTACK')) return PHASES.ATTACK
      return ''
    },
    operationIndexForPhase(phase, fallbackIndex) {
      const matchingIndex = this.operationsList.findIndex(op =>
        this.normalizeOperationPhase(op && op.title) === phase
      )
      if (matchingIndex >= 0) return matchingIndex
      if (Array.isArray(this.operations) && this.operationsList[fallbackIndex]) {
        return fallbackIndex
      }
      return -1
    },
    diceRowFor(operation, faceIdx) {
      const move = operation && Array.isArray(operation.moves)
        ? operation.moves[0]
        : null
      const raw = move && Array.isArray(move.dice) ? move.dice : []
      const row = raw[faceIdx]
      return this.uniqueActions(Array.isArray(row) ? row : [])
    },
    uniqueActions(actions) {
      const out = []
      const seen = new Set()
      actions.forEach(action => {
        if (typeof action !== 'string') return
        const key = action.trim().toLowerCase()
        if (!key || seen.has(key)) return
        seen.add(key)
        out.push(key)
      })
      return out
    },
    selectedActionPriority(selected, action) {
      if (!Array.isArray(selected)) return null
      const index = selected.indexOf(action)
      return index >= 0 ? index + 1 : null
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.turntable-matrix-editor {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  border: $border-width solid rgba($border-color, 0.75);
  border-radius: 8px;
  background-color: $surface-color;
  font-size: 15px;

  th,
  td {
    padding: 10px 12px;
    border-bottom: $border-width solid rgba($border-light, 0.65);
    text-align: left;
    vertical-align: middle;
  }

  tbody tr:last-child th,
  tbody tr:last-child td {
    border-bottom: none;
  }

  thead th {
    font-weight: $font-weight-bold;
    color: $text-primary;
    background-color: rgba(0, 0, 0, 0.035);
  }

  &__face-header,
  &__face {
    width: 48px;
  }

  &__face {
    font-weight: $font-weight-bold;
    color: $text-primary;
    text-align: center;
    background-color: rgba(0, 0, 0, 0.018);
  }

  &__column-header {
    min-width: 180px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__chip {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 4px 10px;
    border: $border-width solid rgba(100, 116, 139, 0.48);
    border-radius: 999px;
    background-color: rgba(100, 116, 139, 0.16);
    color: #64748b;
    font-size: $font-size-normal;
    font-family: monospace;
    font-weight: $font-weight-bold;
    line-height: 1.2;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                color $transition-fast $transition-easing;

    &:hover:not(:disabled) {
      border-color: var(--turntable-builder-accent-strong, rgba(100, 116, 139, 0.48));
      background-color: var(--turntable-builder-accent-soft, rgba(100, 116, 139, 0.16));
      color: $text-primary;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    &--active {
      padding-left: 4px;
      background-color: var(--turntable-builder-accent-soft, rgba($primary-color, 0.12));
      border-color: var(--turntable-builder-accent-strong, rgba($primary-color, 0.22));
      color: $text-primary;

      &:hover:not(:disabled) {
        background-color: var(--turntable-builder-accent-soft, rgba($primary-color, 0.12));
        border-color: var(--turntable-builder-accent, #{$primary-color});
        color: $text-primary;
      }
    }
  }

  &__chip-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    line-height: 1;
  }

  &__chip-priority {
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: $border-width solid var(--turntable-builder-accent, #{$primary-color});
    border-radius: 50%;
    background-color: $surface-color;
    color: var(--turntable-builder-accent, #{$primary-color});
    font-family: Avenir, Helvetica, Arial, sans-serif;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    font-weight: $font-weight-bold;
    line-height: 1;
  }

  &__chip-indicator--empty {
    color: #94a3b8;
  }

  &__chip-label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}
</style>
