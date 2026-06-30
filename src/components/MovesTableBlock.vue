<template>
  <div class="grid-item grid-item--moves-table">
    <TabContainer
      ref="tabContainer"
      :tabs="tabs"
      :isLoading="isLoading"
      :loadingText="$t('gameplay.movesTable.loading')"
      @tab-change="onTabChange"
    >
      <template #default="{ activeTab }">
        <div v-if="activeTab === 'table'" class="table-view-content">
          <div v-if="movesData" class="moves-tables">
            <section
              v-for="table in renderTables"
              :key="table.id"
              class="turntable-side"
              :data-scope="table.scope"
              :data-is-active="table.scope === activeHighlight.tableScope ? 'true' : 'false'"
              :data-active-player="table.scope === activeHighlight.tableScope ? currentPlayer : null"
              :data-is-rolling="table.scope === activeHighlight.tableScope && isDiceRolling ? 'true' : 'false'"
            >
              <header class="turntable-side__header">
                <div class="turntable-side__title-group">
                  <h4 class="turntable-side__title">{{ $tf(table.titleKey, table.title) }}</h4>
                  <span class="turntable-side__key">{{ table.sourceKey }}</span>
                </div>
                <span
                  v-if="table.scope === activeHighlight.tableScope && (currentRoll || isDiceRolling)"
                  class="turntable-side__roll"
                  :class="{ 'turntable-side__roll--rolling': isDiceRolling }"
                >
                  {{ isDiceRolling ? $t('gameplay.movesTable.rolling') : `D${currentRoll}` }}
                </span>
              </header>

              <div class="turntable-table-wrap">
                <table class="turntable-table" :aria-label="$tf('gameplay.movesTable.turntableAria', `${table.title} turntable`, { title: $tf(table.titleKey, table.title) })">
                  <thead>
                    <tr>
                      <th scope="col" class="turntable-table__face-header">{{ $t('common.d6') }}</th>
                      <th
                        v-for="operation in table.operations"
                        :key="`${table.id}-${operation.id}-header`"
                        scope="col"
                        class="turntable-table__operation-header"
                      >
                        {{ formatOperationTitle(operation.title) }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="diceIndex in table.maxDiceRows"
                      :key="`${table.id}-dice-${diceIndex}`"
                      class="turntable-table__row"
                      :data-is-highlighted="
                        diceIndex === activeHighlight.rowIndex && table.scope === activeHighlight.tableScope
                          ? 'true'
                          : 'false'
                      "
                      :data-highlight-state="rowHighlightState(table, diceIndex)"
                    >
                      <th scope="row" class="turntable-table__face">{{ getDiceLabel(diceIndex - 1) }}</th>
                      <td
                        v-for="operation in table.operations"
                        :key="`${table.id}-${operation.id}-dice-${diceIndex}`"
                        class="turntable-table__cell"
                      >
                        <div class="turntable-table__action-groups">
                          <div
                            v-for="group in operationDiceGroups(operation, diceIndex - 1)"
                            :key="group.id"
                            class="turntable-table__action-group"
                          >
                            <span
                              v-if="group.showTitle"
                              class="turntable-table__surface-label"
                            >
                              {{ group.title }}
                            </span>
                            <span
                              v-if="group.actions.length > 0"
                              class="turntable-action-list"
                              :data-show-priority="table.showPriority ? 'true' : 'false'"
                            >
                              <span
                                v-for="chip in actionChips(group.actions, table.showPriority)"
                                :key="chip.key"
                                class="turntable-action-chip"
                                :data-priority="chip.priority || null"
                              >
                                <span
                                  v-if="chip.priority"
                                  class="turntable-action-chip__priority"
                                >
                                  {{ chip.priority }}
                                </span>
                                <span class="turntable-action-chip__label">{{ chip.label }}</span>
                              </span>
                            </span>
                            <span
                              v-else
                              class="turntable-action-chip turntable-action-chip--empty"
                              :aria-label="$t('gameplay.movesTable.noActionAvailable')"
                            >
                              <span
                                class="turntable-action-chip__empty-indicator"
                                aria-hidden="true"
                              >
                                <PhProhibit :size="16" weight="bold" />
                              </span>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <p v-if="table.operations.length === 0" class="turntable-side__empty">
                  {{ $t('gameplay.movesTable.noOperations') }}
                </p>
                <p
                  v-else-if="hasMultiSurfaceOperations(table.operations)"
                  class="turntable-side__note"
                >
                  {{ $t('gameplay.movesTable.multiSurfaceNote') }}
                </p>
              </div>
            </section>
          </div>

          <div v-else class="no-data-info">
            <p>{{ $t('gameplay.movesTable.noData') }}</p>
          </div>
        </div>

        <div v-if="activeTab === 'json'" class="json-view-content">
          <div v-if="movesData" class="json-output">
            <pre>{{ JSON.stringify(movesData, null, 2) }}</pre>
          </div>

          <div v-else class="no-data-info">
            <p>{{ $t('gameplay.movesTable.noData') }}</p>
          </div>
        </div>
      </template>
    </TabContainer>
  </div>
</template>

<script>
import TabContainer from './TabContainer.vue'
import {
  normalizeOperations,
  getMaxDiceRows
} from '../utils/uiMoveTable'
import { getDiceResultForUi } from '../utils/diceUi'
import {
  getTableScopeForPlayer,
  calculateActiveHighlight,
  TABLE_SCOPES
} from '@/utils/movesTableScope'
import { PhProhibit } from '@phosphor-icons/vue'

export default {
  name: 'MovesTableBlock',
  components: {
    TabContainer,
    PhProhibit
  },
  props: {
    movesData: {
      type: Object,
      default: null
    },
    gameState: {
      type: Object,
      default: null
    },
    isDiceRolling: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      tabs: [
        { id: 'table', labelKey: 'gameplay.movesTable.tabs.table', label: 'Turntable' },
        { id: 'json', labelKey: 'gameplay.movesTable.tabs.json', label: 'Raw JSON' }
      ],
      isLoading: false,
      diceUiSeq: 0
    }
  },
  computed: {
    currentPlayer() {
      return this.gameState && this.gameState.currentPlayer ? this.gameState.currentPlayer : 'player1'
    },
    currentRoll() {
      void this.diceUiSeq
      return getDiceResultForUi(this.gameState, this.diceUiSeq)
    },
    ourOperations() {
      return this.normalizeOperations(
        this.movesData && this.movesData.Our_operations,
        TABLE_SCOPES.OUR
      )
    },
    enemyOperations() {
      return this.normalizeOperations(
        this.movesData && this.movesData.Enemy_operations,
        TABLE_SCOPES.ENEMY
      )
    },
    renderTables() {
      return [
        {
          id: TABLE_SCOPES.OUR,
          scope: getTableScopeForPlayer('player1'),
          titleKey: 'gameplay.movesTable.playerOperations',
          title: 'Player operations',
          sourceKey: 'Our_operations',
          showPriority: false,
          operations: this.ourOperations,
          maxDiceRows: Math.max(6, this.getMaxDiceRows(this.ourOperations))
        },
        {
          id: TABLE_SCOPES.ENEMY,
          scope: getTableScopeForPlayer('player2'),
          titleKey: 'gameplay.movesTable.enemyOperations',
          title: 'Enemy operations',
          sourceKey: 'Enemy_operations',
          showPriority: true,
          operations: this.enemyOperations,
          maxDiceRows: Math.max(6, this.getMaxDiceRows(this.enemyOperations))
        }
      ]
    },
    activeHighlight() {
      const tableScope = getTableScopeForPlayer(this.currentPlayer)
      const roll = this.currentRoll
      const opsForActiveTable =
        tableScope === TABLE_SCOPES.ENEMY ? this.enemyOperations : this.ourOperations
      const maxRows = Math.max(6, this.getMaxDiceRows(opsForActiveTable))
      const { highlightRowIndex } = calculateActiveHighlight(
        this.currentPlayer,
        roll,
        tableScope,
        maxRows
      )
      return {
        tableScope,
        rowIndex: highlightRowIndex
      }
    }
  },
  methods: {
    normalizeOperations(operations, scope) {
      return normalizeOperations(operations, scope)
    },
    getMaxDiceRows(operations) {
      return getMaxDiceRows(operations)
    },
    getDiceLabel(diceIndex) {
      const idx = Number(diceIndex)
      if (!Number.isInteger(idx) || idx < 0) return 'd?'
      return `d${idx + 1}`
    },
    formatOperationTitle(title) {
      const text = title == null ? '' : String(title).trim()
      if (!text) return ''
      const lower = text.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    },
    getMoveDiceActions(move, diceIndex) {
      if (!move || !Array.isArray(move.dice)) return []
      const list = move.dice[diceIndex]
      return Array.isArray(list) ? list : []
    },
    operationDiceGroups(operation, diceIndex) {
      const moves = operation && Array.isArray(operation.moves) ? operation.moves : []
      if (moves.length === 0) {
        return [{
          id: `${operation && operation.id ? operation.id : 'op'}-empty-${diceIndex}`,
          title: '-',
          showTitle: false,
          actions: []
        }]
      }
      return moves.map((move, moveIndex) => {
        const actions = this.getMoveDiceActions(move, diceIndex)
        return {
          id: `${operation.id || 'op'}-move-${move.id || moveIndex}-${diceIndex}`,
          title: move && move.title ? move.title : '-',
          showTitle: moves.length > 1,
          actions
        }
      })
    },
    actionChips(actions, showPriority) {
      const source = Array.isArray(actions) ? actions : []
      return source
        .map((action, index) => ({
          key: `${index}-${action}`,
          label: action,
          priority: showPriority ? index + 1 : null
        }))
        .sort((a, b) => {
          if (!showPriority) return 0
          return a.priority - b.priority
        })
    },
    hasMultiSurfaceOperations(operations) {
      return Array.isArray(operations) && operations.some(operation => (
        operation &&
        Array.isArray(operation.moves) &&
        operation.moves.length > 1
      ))
    },
    rowHighlightState(table, diceIndex) {
      if (table.scope !== this.activeHighlight.tableScope) return 'none'
      if (this.activeHighlight.rowIndex === null) return 'none'
      if (diceIndex !== this.activeHighlight.rowIndex) return 'inactive'
      return 'result'
    },
    onTabChange() {
      // Handle tab change if needed
    }
  },
  watch: {
    'gameState.currentTurnActions': {
      deep: true,
      handler() {
        this.diceUiSeq++
      }
    }
  }
}
</script>

<style scoped lang="scss">
@use '../styles/universal-components.scss' as *;
@use '../styles/variables' as *;
@use '../styles/components.scss' as *;
@use '../styles/MovesTableBlock.scss' as *;
</style>
