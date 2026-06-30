<template>
  <table
    class="engine-available-actions-table"
    :data-current-player="currentPlayer"
    :aria-label="ariaLabel"
  >
    <thead>
      <tr>
        <th scope="col" class="engine-available-actions-table__face-header">{{ $t('common.d6') }}</th>
        <th
          v-for="operation in operations"
          :key="`${operation.id}-header`"
          scope="col"
        >
          {{ formatOperationTitle(operation.title) }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row" class="engine-available-actions-table__face">
          {{ diceLabel }}
        </th>
        <td
          v-for="operation in operations"
          :key="`${operation.id}-${diceIndex}`"
        >
          <div class="engine-available-action-groups">
            <div
              v-for="group in operationDiceGroups(operation, diceIndex)"
              :key="group.id"
              class="engine-available-action-group"
            >
              <span
                v-if="group.showTitle"
                class="engine-available-action-surface"
              >
                {{ group.title }}
              </span>
              <span
                v-if="group.actions.length > 0"
                class="engine-available-action-list"
              >
                <span
                  v-for="chip in actionChips(group.actions, showPriority)"
                  :key="chip.key"
                  class="engine-available-action-chip"
                  :data-priority="chip.priority || null"
                >
                  <span
                    v-if="chip.priority"
                    class="engine-available-action-chip__priority"
                  >
                    {{ chip.priority }}
                  </span>
                  <span class="engine-available-action-chip__label">{{ chip.label }}</span>
                </span>
              </span>
              <span
                v-else
                class="engine-available-action-chip engine-available-action-chip--empty"
                :aria-label="emptyActionLabel || null"
              >
                -
              </span>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script>
import {
  formatOperationTitle,
  operationDiceGroups,
  actionChips
} from '../ui/unitPreview.js'

/**
 * Shared "available actions" d6 table used by GameEngineBlock (interactive turn
 * controls) and AutomatedPlayground (trace playback). The two pages previously
 * carried structurally identical markup that differed only in the table's
 * aria-label, the empty-cell aria-label, and the i18n key for the d6 header
 * (Finding #42).
 *
 * i18n handling (reported per label):
 *  - d6 header: BOTH pages used the same key `common.d6`, so the call stays in
 *    this component and resolves via each parent's i18n exactly as before.
 *  - table aria-label: DIFFERENT visible text per page (GEB localizes
 *    `gameplay.engine.availableActionsAria` with the dice label; AP uses
 *    `automatedPlayground.availableActions`), so it is passed in via `ariaLabel`.
 *  - empty-cell aria-label: GEB labels empty cells
 *    (`gameplay.movesTable.noActionAvailable`); AP renders no aria-label. Passed
 *    in via `emptyActionLabel` (null = no attribute, matching AP).
 *
 * The cell content (operation titles, dice groups, action chips) is built from
 * the shared pure helpers, so output is identical to the inlined versions.
 *
 * Styling: the table rules live in this component's own scope-LESS style block
 * (`@use '../styles/available-actions-table'`). They were moved out of the
 * parents' scoped `engine-turn-controls.scss` because Vue scoped CSS stamps the
 * parent's data-v attribute only on a child's ROOT element, leaving the nested
 * rows/chips unstyled. Scope-less emits plain selectors that match those
 * descendants; the BEM names are owned solely by this component.
 */
export default {
  name: 'AvailableActionsTable',
  props: {
    operations: {
      type: Array,
      default: () => []
    },
    diceIndex: {
      type: Number,
      default: null
    },
    diceLabel: {
      type: String,
      default: 'd?'
    },
    currentPlayer: {
      type: String,
      default: 'player1'
    },
    showPriority: {
      type: Boolean,
      default: false
    },
    ariaLabel: {
      type: String,
      default: ''
    },
    emptyActionLabel: {
      type: String,
      default: null
    }
  },
  methods: {
    formatOperationTitle,
    operationDiceGroups,
    actionChips
  }
}
</script>

<style lang="scss">
/* Scope-less on purpose: this component renders the moved actions-table markup
 * whose nested elements (rows, action chips) would NOT receive a parent's scoped
 * data-v attribute. These BEM classes are owned solely by this component. */
@use '../styles/available-actions-table';
</style>
