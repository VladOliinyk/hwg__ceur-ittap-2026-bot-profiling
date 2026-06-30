<template>
  <div class="playground">
    <HeaderComponent
      :show-reset-layout="shouldShowLayoutReset"
      @reset-layout="resetLayout"
    />

    <div
      ref="playgroundGrid"
      class="playground-grid"
      :style="layoutGridStyle"
    >
      <!-- Block 1: Moves Table -->
      <MovesTableBlock 
        :movesData="currentMovesData"
        :gameState="gameState"
        :is-dice-rolling="isDiceRolling"
      />
      
      <!-- Block 2: Game Map -->
      <GameMapBlock
        ref="gameMapBlock"
        :mapData="currentMapData"
        :terrainTypes="terrainTypes"
        :gameState="gameState"
        :gameController="gameController"
        :selectedHexDropdownPosition="selectedHexDropdownPosition"
        :show-floating-panel="showFloatingPanel"
        :commandSeq="commandSeq"
        :attackTargetShiftIntent="attackTargetShiftIntent"
        :deselectIntent="deselectIntent"
        :unitPreviewHoverIntent="unitPreviewHoverIntent"
        :unitPreviewSelectIntent="unitPreviewSelectIntent"
        :actions-disabled="actionsDisabled"
        @hex-selected="onHexSelected"
        @game-state-updated="onGameStateUpdated"
        @update-selected-hex-dropdown-position="updateSelectedHexDropdownPosition"
        @update:showFloatingPanel="onShowFloatingPanelUpdate"
        @selection-inspector-bridge="onSelectionInspectorBridge"
      />

      <!-- Block 3: Timeline -->
      <TimelineBlock
        :gameState="gameState"
        :levelPackage="levelPackage"
        :rngSeed="rngSeed"
        :is-dice-rolling="isDiceRolling"
        @end-turn="onEndTurn"
        @revert-game="onRevertGame"
        @import-history="onImportHistory"
        @show-outcome-dialog="openOutcomeDialog"
        @roll-dice="onTimelineRollDice"
        @instant-roll-dice="onTimelineInstantRollDice"
      />

      <!-- Block 4: Game Engine -->
      <GameEngineBlock
        ref="gameEngineBlock"
        :mapData="currentMapData"
        :gameState="gameState"
        :moves-data="currentMovesData"
        :gameController="gameController"
        :isRestoring="isRestoring"
        :isInitializingGlobal="isInitializing"
        :level-options="levelOptions"
        :selected-level-id="levelIdInput"
        :seed="matchSetupSeed"
        :loaded-package="loadedLevelPackage"
        :loaded-source="loadedLevelSource"
        :loaded-warnings="loadedLevelWarnings"
        :builder-export-level-id="builderExportLevelId"
        :can-delete-selected-level="canDeleteSelectedLevel"
        :is-starting-game="isStartingGame"
        :external-dice-rolling="isDiceRolling"
        :dice-roll-intent="diceRollIntent"
        :dice-roll-right-intent="diceRollRightIntent"
        :dice-cancel-intent="diceCancelIntent"
        :selection-inspector-bridge="selectionInspectorBridge"
        :actions-disabled="actionsDisabled"
        :auto-play-players="autoPlayPlayers"
        :auto-play-enabled="autoPlayEnabled"
        @level-selected="onSetupLevelIdInput"
        @seed-updated="onSetupSeedInput"
        @load-selected-level="onLoadSelectedLevel"
        @upload-archive="onUploadArchive"
        @export-loaded-builder-level="onExportLoadedBuilderLevel"
        @delete-selected-level="onDeleteSelectedLevel"
        @start-game="onStartLoadedLevel"
        @game-state-updated="onEngineGameStateUpdated"
        @reset-game="resetGame"
        @dice-rolling-changed="onDiceRollingChanged"
        @end-turn="onEndTurn"
        @restart-game="onRestartGame"
        @move-unit-forward="onEngineMoveUnitForward"
        @move-unit-reverse="onEngineMoveUnitReverse"
        @rotate-unit-clockwise="onEngineRotateUnitClockwise"
        @rotate-unit-counterclockwise="onEngineRotateUnitCounterclockwise"
        @fire="onEngineFire"
        @reload="onEngineReload"
        @attack-target-shift="onEngineAttackTargetShift"
        @unit-preview-hover="onEngineUnitPreviewHover"
        @unit-preview-select="onEngineUnitPreviewSelect"
        @update-doctrine-profile="onUpdateDoctrineProfile"
        @update-auto-play="onUpdateAutoPlay"
        @auto-play-current-turn="onAutoPlayCurrentTurn"
      />

      <!-- Block 5: Selection -->
      <SelectionBlock
        :selectedHex="selectedHex"
        :gameState="gameState"
        :show-floating-panel="showFloatingPanel"
        :selection-inspector-bridge="selectionInspectorBridge"
        :actions-disabled="actionsDisabled"
        @deselect="onEngineDeselect"
        @update:showFloatingPanel="onShowFloatingPanelUpdate"
        @move-unit-forward="onEngineMoveUnitForward"
        @move-unit-reverse="onEngineMoveUnitReverse"
        @rotate-unit-clockwise="onEngineRotateUnitClockwise"
        @rotate-unit-counterclockwise="onEngineRotateUnitCounterclockwise"
        @fire="onEngineFire"
        @reload="onEngineReload"
        @attack-target-shift="onEngineAttackTargetShift"
      />

      <div
        v-for="splitter in layoutSplitters"
        :key="splitter.key"
        class="playground-splitter"
        :class="[
          splitter.className,
          `playground-splitter--${splitter.orientation}`,
          { 'is-dragging': isLayoutSplitterActive(splitter.key) }
        ]"
        role="separator"
        tabindex="0"
        :aria-orientation="splitter.orientation"
        :aria-label="$tf(splitter.labelKey, splitter.label)"
        @pointerdown="onLayoutSplitterPointerDown($event, splitter)"
        @keydown="onLayoutSplitterKeydown($event, splitter)"
      >
        <span class="playground-splitter__icon" aria-hidden="true"></span>
      </div>
    </div>

    <div
      v-if="isOutcomeDialogVisible"
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-outcome-dialog-title"
      data-test="game-outcome-dialog"
      @click.self="dismissOutcomeDialog"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="game-outcome-dialog-title" class="modal-title">{{ outcomeTitle }}</h5>
            <button
              type="button"
              class="btn-close"
              :aria-label="$t('common.close')"
              data-test="game-outcome-dialog-close"
              @click="dismissOutcomeDialog"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">{{ outcomeMessage }}</p>
            <div class="row g-2" data-test="game-outcome-stats">
              <div
                v-for="stat in outcomeGeneralStatRows"
                :key="stat.label"
                class="col-6"
              >
                <div class="border rounded p-2 h-100">
                  <div class="small text-muted">{{ stat.label }}</div>
                  <div class="fw-semibold text-break">{{ stat.value }}</div>
                </div>
              </div>
            </div>
            <div class="table-responsive mt-3" data-test="game-outcome-player-stats">
              <table class="table table-sm mb-0">
                <thead>
                  <tr>
                    <th scope="col">{{ $t('gameplay.playground.outcome.tableStatistic') }}</th>
                    <th scope="col">{{ $t('common.player1') }}</th>
                    <th scope="col">{{ $t('common.player2') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in outcomePlayerStatRows" :key="row.label">
                    <th scope="row">{{ row.label }}</th>
                    <td>{{ row.player1 }}</td>
                    <td>{{ row.player2 }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="dismissOutcomeDialog">
              {{ $t('common.close') }}
            </button>
            <button type="button" class="btn btn-primary" @click="onRestartGame">
              {{ $t('common.restart') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="isOutcomeDialogVisible"
      class="modal-backdrop fade show"
      data-test="game-outcome-dialog-backdrop"
    ></div>
  </div>
</template>

<script>
import { markRaw } from 'vue'
import HeaderComponent from '../components/HeaderComponent'
import MovesTableBlock from '../components/MovesTableBlock'
import GameMapBlock from '../components/GameMapBlock'
import TimelineBlock from '../components/TimelineBlock'
import GameEngineBlock from '../components/GameEngineBlock'
import SelectionBlock from '../components/SelectionBlock'
import { GameState } from '@/domain/engine/gameState.js'
import { loadLevelPackage } from '../domain/level/loadLevelPackage'
import { loadLevelArchivePackage } from '../domain/level/loadLevelArchivePackage'
import {
  buildLevelArchiveBlob,
  levelArchiveFilename
} from '../domain/level/levelArchive'
import {
  BUILDER_PLAYTEST_QUERY_KEY,
  BUILDER_PLAYTEST_SOURCE,
  consumeBuilderPlaytestHandoff,
  loadPersistedBuilderPlaytestLevels,
  removePersistedBuilderPlaytestLevel
} from '../domain/level/builderPlaytestLevels'
import { LATEST_LEVEL_PACKAGE_SCHEMA_VERSION } from '../domain/level/validateLevelPackage'
import { createRng } from '../domain/simulation/rng'
import {
  STRATEGY_PROFILES,
  createStrategyFromConfig
} from '../domain/simulation/strategyProfiles'
import { autoPlayTurn } from '../domain/simulation/autoPlayTurn'
import { createGameController } from '../ui/playground/gameController'
import {
  reactMoveForward,
  reactMoveReverse,
  reactRotate,
  reactFire,
  reactReload
} from '../ui/playground/commandReactions'
import {
  saveGameState,
  loadGameState,
  clearGameState,
  normalizeBool,
  RESTORE_ERROR_CODES,
  SAVE_ERROR_CODES
} from '../utils/gamePersistence'
import {
  applyGameSnapshot,
  isGameSnapshotEnvelope
} from '../domain/snapshot/gameSnapshot'
import {
  buildDefaultObjectivesForLevelPackage,
  formatOutcomeLabel,
  OUTCOME_STATUS
} from '../domain/objectives/objectives'
import { resizableLayoutMixin } from '../ui/layout/resizableLayoutMixin.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

const DEFAULT_LEVEL_ID = 'level_000'
const SAFE_LEVEL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function normalizeLevelId(value) {
  const raw = value != null ? String(value).trim() : ''
  return raw && SAFE_LEVEL_ID_PATTERN.test(raw) ? raw : DEFAULT_LEVEL_ID
}

function defaultSeedForLevel(value) {
  return `${normalizeLevelId(value)}-seed-1`
}

const OUTCOME_STATS_PLAYERS = Object.freeze(['player1', 'player2'])
const NON_ACTION_RECORD_TYPES = new Set(['startTurn', 'endTurn'])

function emptyPlayerCounts() {
  return { player1: 0, player2: 0 }
}

function normalizeStatsPlayer(player) {
  const raw = player != null ? String(player).trim() : ''
  return OUTCOME_STATS_PLAYERS.includes(raw) ? raw : null
}

function getActionType(action) {
  return action && typeof action.type === 'string' ? action.type : ''
}

function isAttackAction(action) {
  return getActionType(action) === 'attack' || action?.actionType === 'fire'
}

function numericDamage(action) {
  const damage = Number(action && action.damage)
  return Number.isFinite(damage) ? damage : 0
}

function unitIsAlive(unit) {
  if (!unit || typeof unit !== 'object') return false
  if (typeof unit.isAlive === 'function') return unit.isAlive()
  return unit.health > 0 && unit.isActive !== false
}

function flattenRecordedActions(gameState) {
  const out = []
  const history = Array.isArray(gameState && gameState.history) ? gameState.history : []
  for (const turnActions of history) {
    if (Array.isArray(turnActions)) out.push(...turnActions)
  }
  const current = Array.isArray(gameState && gameState.currentTurnActions)
    ? gameState.currentTurnActions
    : []
  out.push(...current)
  return out.filter(action => action && typeof action === 'object')
}

function unitEntriesFromInitialState(gameState) {
  const initialUnits = gameState && gameState.initialState && gameState.initialState.units
  if (!Array.isArray(initialUnits)) return []
  return initialUnits
    .map(entry => Array.isArray(entry) ? entry[1] : null)
    .filter(unit => unit && typeof unit === 'object')
}

function configuredUnitCount(entry) {
  if (!entry || typeof entry !== 'object') return 0
  if (entry.count == null) return 1
  const count = Number(entry.count)
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
}

function countInitialUnitsByPlayer(gameState, unitsData) {
  const counts = emptyPlayerCounts()
  const initialUnits = unitEntriesFromInitialState(gameState)
  if (initialUnits.length > 0) {
    for (const unit of initialUnits) {
      const player = normalizeStatsPlayer(unit.player)
      if (player) counts[player] += 1
    }
    return counts
  }

  for (const player of OUTCOME_STATS_PLAYERS) {
    const list = unitsData && unitsData[player] && Array.isArray(unitsData[player].units)
      ? unitsData[player].units
      : []
    counts[player] = list.reduce((sum, entry) => sum + configuredUnitCount(entry), 0)
  }
  return counts
}

function countAliveUnitsByPlayer(gameState) {
  const counts = emptyPlayerCounts()
  const units = gameState && typeof gameState.getAllUnits === 'function'
    ? gameState.getAllUnits()
    : []
  if (!Array.isArray(units)) return counts
  for (const unit of units) {
    const player = normalizeStatsPlayer(unit && unit.player)
    if (player && unitIsAlive(unit)) counts[player] += 1
  }
  return counts
}

function buildUnitPlayerMap(gameState) {
  const map = new Map()
  const addUnit = unit => {
    if (!unit || unit.id == null) return
    const player = normalizeStatsPlayer(unit.player)
    if (player) map.set(String(unit.id), player)
  }

  unitEntriesFromInitialState(gameState).forEach(addUnit)
  const liveUnits = gameState && typeof gameState.getAllUnits === 'function'
    ? gameState.getAllUnits()
    : []
  if (Array.isArray(liveUnits)) liveUnits.forEach(addUnit)
  return map
}

function playerFromUnitId(unitId, unitPlayerMap) {
  if (unitId == null) return null
  const id = String(unitId)
  // Primary path: unitPlayerMap built from initialState + live units (always present in real games).
  // Foreign history-payloads that lack action.player AND have unknown unit ids simply
  // don't receive per-player damage attribution — that is acceptable.
  if (unitPlayerMap.has(id)) return unitPlayerMap.get(id)
  return null
}

export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Playground',
  mixins: [resizableLayoutMixin, i18nTextMixin],
  resizableLayoutConfig: {
    storageKey: 'hexWarPlaygroundLayout',
    desktopMinWidth: 1201,
    splitterSize: 16,
    containerRef: 'playgroundGrid',
    columns: {
      engine: { min: 240, max: 560, defaultRatio: 0.2 },
      moves: { min: 280, max: 720, defaultRatio: 0.3 },
      map: { min: 320, max: 1080, defaultRatio: 0.33 },
      selection: { min: 180, max: 480, defaultRatio: 0.17 }
    },
    rows: {
      main: { min: 320, max: 1200, defaultRatio: 0.66 },
      timeline: { min: 220, max: 620, defaultRatio: 0.34 }
    },
    splitters: [
      { key: 'engine-moves', orientation: 'vertical', before: 'engine', after: 'moves', className: 'playground-splitter--engine-moves', labelKey: 'gameplay.playground.splitters.engineMoves', label: 'Resize game engine and moves table panels' },
      { key: 'moves-map', orientation: 'vertical', before: 'moves', after: 'map', className: 'playground-splitter--moves-map', labelKey: 'gameplay.playground.splitters.movesMap', label: 'Resize moves table and game map panels' },
      { key: 'map-selection', orientation: 'vertical', before: 'map', after: 'selection', className: 'playground-splitter--map-selection', labelKey: 'gameplay.playground.splitters.mapSelection', label: 'Resize game map and selection panels' },
      { key: 'main-timeline', orientation: 'horizontal', before: 'main', after: 'timeline', className: 'playground-splitter--main-timeline', labelKey: 'gameplay.playground.splitters.upperTimeline', label: 'Resize upper panels and game timeline' }
    ],
    cssVars: {
      columns: { engine: '--layout-engine-width', moves: '--layout-moves-width', map: '--layout-map-width', selection: '--layout-selection-width' },
      rows: { main: '--layout-main-height', timeline: '--layout-timeline-height' }
    }
  },
  components: {
    HeaderComponent,
    MovesTableBlock,
    GameMapBlock,
    TimelineBlock,
    GameEngineBlock,
    SelectionBlock
  },
  data() {
    return {
      currentMapData: null,
      terrainTypes: null,
      currentMovesData: null,
      unitsData: null,
      levelIdInput: DEFAULT_LEVEL_ID,
      availableLevels: [
        { id: DEFAULT_LEVEL_ID, label: DEFAULT_LEVEL_ID, source: 'default', package: null, warnings: [] }
      ],
      levelId: null,
      rngSeed: null,
      loadedLevelPackage: null,
      loadedLevelSource: null,
      loadedLevelWarnings: [],
      isStartingGame: false,
      isDiceRolling: false,
      lastOutcomeKey: null,
      showOutcomeDialog: false,
      selectedHex: null,
      gameState: null,
      /**
       * Single dispatch boundary for engine mutations. Children call
       * methods on `gameController` instead of mutating `gameState`
       * directly so the engine boundary stays explicit. Set in
       * `created()` so the `getGameState` closure binds to the fully
       * initialized reactive instance.
       */
      gameController: null,
      isGameLoaded: false,
      selectedHexDropdownPosition: { x: 100, y: 100 },
      // Флаги для уникнення гонок ініціалізації/відновлення
      isRestoring: false,
      isInitializing: false,
      /** Debounce localStorage writes for dropdown drag (position-only updates). */
      persistUiTimer: null,
      /** Плаваюча панель вибору на карті (× лише ховає панель; вибір лишається). */
      showFloatingPanel: true,
      /**
       * Inbound bridge from `GameMapBlock`. Carries selection identity
       * (`selectedUnitId`), legality flags, derived targets, and dice so
       * the playground can build commands without reaching into the map
       * via `$refs`. Updated whenever `GameMapBlock.selectionInspectorBridgePayload`
       * fires.
       */
      selectionInspectorBridge: {
        selectedUnitId: null,
        canMoveForward: false,
        canMoveReverse: true,
        canRotate: false,
        canFire: false,
        canReload: false,
        validAttackTargets: [],
        selectedTargetIndex: 0,
        moveForwardTarget: null,
        moveReverseTarget: null,
        currentDiceResultForUi: null
      },
      /**
       * Outbound intent channels to `GameMapBlock`. Each is a primitive
       * the map watches for changes. Bumping `commandSeq` asks the map
       * to refresh its derived view state (selected unit/hex) after an
       * engine mutation dispatched from the playground.
       */
      commandSeq: 0,
      attackTargetShiftIntent: { delta: 0, seq: 0 },
      deselectIntent: 0,
      unitPreviewHoverIntent: { unitId: null, seq: 0 },
      unitPreviewSelectIntent: { unitId: null, seq: 0 },
      /**
       * Outbound intent channels to `GameEngineBlock`. Bumping
       * `diceRollIntent` / `diceRollRightIntent` triggers the animated
       * or instant dice roll; bumping `diceCancelIntent` cancels an
       * in-progress animation. Replaces the previous
       * `$refs.gameEngineBlock.onDiceClick()` / `.onDiceRightClick()` /
       * `.cancelDiceRoll()` calls.
       */
      diceRollIntent: { seq: 0 },
      diceRollRightIntent: { seq: 0 },
      diceCancelIntent: { seq: 0 },
      /**
       * Doctrine config for the new "auto-play turn" feature. Mirrors the
       * Automated page's per-player profile shape so the same
       * `createStrategyFromConfig` machinery applies. Only consumed by
       * auto-play; manual play ignores it.
       */
      autoPlayPlayers: {
        player1: { profile: STRATEGY_PROFILES.BALANCED },
        player2: { profile: STRATEGY_PROFILES.BALANCED }
      },
      /** Per-side auto-play toggles. */
      autoPlayEnabled: {
        player1: false,
        player2: false
      },
      /** Re-entrancy guard so a turn is never auto-played twice concurrently. */
      isAutoPlaying: false
    }
  },
  computed: {
    /**
     * Rebuilds the current `LevelPackage` shape from the primitive level
     * fields the Playground keeps on `data()`. Used by `TimelineBlock`
     * to bundle a full `GameSnapshot` on export. Stays in sync with
     * `currentMapData` / `terrainTypes` / `unitsData` / `currentMovesData`
     * automatically — no parallel source of truth.
     */
    levelPackage() {
      if (this.loadedLevelPackage && typeof this.loadedLevelPackage === 'object') {
        return this.loadedLevelPackage
      }
      if (
        !this.levelId ||
        !this.currentMapData ||
        !Array.isArray(this.terrainTypes) ||
        !this.unitsData ||
        !this.currentMovesData
      ) {
        return null
      }
      // Stamp the current schemaVersion at the package top level so any
      // GameSnapshot that embeds this package (TimelineBlock.exportSnapshot)
      // ships a v1 envelope and does not silently fall through the
      // legacy-v0 migration on the receiving side.
      const pkg = {
        id: this.levelId,
        schemaVersion: LATEST_LEVEL_PACKAGE_SCHEMA_VERSION,
        hexmap: this.currentMapData,
        terrain: { terrainTypes: this.terrainTypes },
        units: this.unitsData,
        turntable: this.currentMovesData
      }
      const objectives = this.gameState && this.gameState.objectives
        ? this.gameState.objectives
        : buildDefaultObjectivesForLevelPackage(pkg)
      if (objectives) pkg.objectives = objectives
      return pkg
    },

    gameOutcome() {
      return this.gameState && this.gameState.outcome ? this.gameState.outcome : null
    },

    isGameEnded() {
      return !!(this.gameOutcome && this.gameOutcome.status === OUTCOME_STATUS.ENDED)
    },

    actionsDisabled() {
      return this.isDiceRolling || this.isGameEnded
    },

    isOutcomeDialogVisible() {
      return this.isGameEnded && this.showOutcomeDialog
    },

    outcomeTitle() {
      const outcome = this.gameOutcome
      if (!outcome || outcome.status !== OUTCOME_STATUS.ENDED) return ''
      if (outcome.winner === 'draw') return this.$t('gameplay.playground.outcome.draw')
      return outcome.winner
        ? this.$tf('gameplay.playground.outcome.winnerTitle', `${outcome.winner} wins`, { winner: outcome.winner })
        : this.$t('gameplay.playground.outcome.gameOver')
    },

    outcomeMessage() {
      const outcome = this.gameOutcome
      if (!outcome || outcome.status !== OUTCOME_STATUS.ENDED) return ''
      return outcome.message || formatOutcomeLabel(outcome)
    },

    outcomeStats() {
      const gameState = this.gameState
      const actions = flattenRecordedActions(gameState)
      const meaningfulActions = actions.filter(action => !NON_ACTION_RECORD_TYPES.has(getActionType(action)))
      const unitPlayerMap = buildUnitPlayerMap(gameState)
      const initialUnits = countInitialUnitsByPlayer(gameState, this.unitsData)
      const aliveUnits = countAliveUnitsByPlayer(gameState)

      const damageByPlayer = emptyPlayerCounts()
      for (const action of actions) {
        if (!isAttackAction(action)) continue
        const damage = numericDamage(action)
        const player = normalizeStatsPlayer(action.player) || playerFromUnitId(action.unitId, unitPlayerMap)
        if (player) damageByPlayer[player] += damage
      }

      const turnNumber = Number(gameState && gameState.turnNumber)
      return {
        turnsToVictory: Number.isFinite(turnNumber) ? Math.max(1, Math.trunc(turnNumber)) : '-',
        actionCount: meaningfulActions.length,
        initialUnits,
        aliveUnits,
        damageByPlayer,
        levelId: this.levelId || this.levelIdInput || '-',
        seed: this.rngSeed || '-'
      }
    },

    outcomeGeneralStatRows() {
      const s = this.outcomeStats
      return [
        { label: this.$t('gameplay.playground.outcome.turnsToVictory'), value: s.turnsToVictory },
        { label: this.$t('gameplay.playground.outcome.actions'), value: s.actionCount },
        { label: this.$t('gameplay.playground.outcome.level'), value: s.levelId },
        { label: this.$t('gameplay.playground.outcome.seed'), value: s.seed }
      ]
    },

    outcomePlayerStatRows() {
      const s = this.outcomeStats
      return [
        {
          label: this.$t('gameplay.playground.outcome.unitsAliveAll'),
          player1: `${s.aliveUnits.player1} / ${s.initialUnits.player1}`,
          player2: `${s.aliveUnits.player2} / ${s.initialUnits.player2}`
        },
        {
          label: this.$t('gameplay.playground.outcome.damage'),
          player1: s.damageByPlayer.player1,
          player2: s.damageByPlayer.player2
        }
      ]
    },

    matchSetupSeed() {
      if (this.rngSeed != null && String(this.rngSeed).trim()) {
        return String(this.rngSeed)
      }
      const id =
        this.levelIdInput ||
        this.levelId ||
        (this.loadedLevelPackage && this.loadedLevelPackage.id) ||
        DEFAULT_LEVEL_ID
      return defaultSeedForLevel(id)
    },

    levelOptions() {
      const options = this.availableLevels.map(level => ({
        id: level.id,
        label: level.label || level.id,
        source: level.source || 'default',
        removable: level.removable === true
      }))
      const loadedId = this.loadedLevelPackage && this.loadedLevelPackage.id
      if (loadedId && !options.some(option => option.id === loadedId)) {
        options.push({
          id: loadedId,
          label: loadedId,
          source: this.loadedLevelSource || 'loaded',
          removable: loadedId !== DEFAULT_LEVEL_ID
        })
      }
      return options
    },

    selectedLevelRecord() {
      const id = normalizeLevelId(this.levelIdInput)
      return this.availableLevels.find(level => level.id === id) || null
    },

    canDeleteSelectedLevel() {
      const record = this.selectedLevelRecord
      return !!(
        record &&
        record.id !== DEFAULT_LEVEL_ID &&
        record.removable === true &&
        !this.gameState
      )
    },

    builderExportLevelId() {
      if (
        this.loadedLevelSource !== BUILDER_PLAYTEST_SOURCE ||
        !this.loadedLevelPackage ||
        typeof this.loadedLevelPackage.id !== 'string' ||
        !this.loadedLevelPackage.id.trim()
      ) {
        return null
      }
      return this.loadedLevelPackage.id.trim()
    }
  },
  created() {
    // Plain object with methods; `markRaw` opts out of deep reactivity
    // so the controller is treated as a stable value, not a reactive
    // data graph.
    this.gameController = markRaw(createGameController({
      getGameState: () => this.gameState
    }))
  },
  async mounted() {
    this.loadPersistedBuilderPlaytestLevelOptions()
    const loadedBuilderPlaytest = this.consumeBuilderPlaytestRouteHandoff()
    if (loadedBuilderPlaytest) return
    // Завантажуємо збережений стан при запуску
    this.isRestoring = true
    try {
      await this.loadSavedGameState()
    } finally {
      this.isRestoring = false
    }
  },
  beforeUnmount() {
    this.cancelDiceRollAnimation()
    if (this.persistUiTimer) {
      clearTimeout(this.persistUiTimer)
      this.persistUiTimer = null
    }
    if (this._saveErrorResetTimer) {
      clearTimeout(this._saveErrorResetTimer)
      this._saveErrorResetTimer = null
    }
  },
  methods: {
    loadPersistedBuilderPlaytestLevelOptions() {
      const records = loadPersistedBuilderPlaytestLevels()
      records.forEach(record => {
        this.registerAvailableLevel({
          id: record.id,
          label: record.label || record.id,
          source: BUILDER_PLAYTEST_SOURCE,
          package: record.package,
          warnings: record.warnings,
          removable: true
        })
      })
    },

    routeBuilderPlaytestToken() {
      const query = this.$route && this.$route.query ? this.$route.query : {}
      const raw = query[BUILDER_PLAYTEST_QUERY_KEY]
      const value = Array.isArray(raw) ? raw[0] : raw
      return typeof value === 'string' && value.trim() ? value.trim() : ''
    },

    clearBuilderPlaytestRouteToken() {
      if (!this.$router || typeof this.$router.replace !== 'function') return
      const currentQuery = this.$route && this.$route.query ? this.$route.query : {}
      if (!(BUILDER_PLAYTEST_QUERY_KEY in currentQuery)) return
      const nextQuery = { ...currentQuery }
      delete nextQuery[BUILDER_PLAYTEST_QUERY_KEY]
      const currentPath = this.$route && typeof this.$route.path === 'string'
        ? this.$route.path
        : '/Playground'
      this.$router.replace({ path: currentPath, query: nextQuery }).catch(() => {})
    },

    consumeBuilderPlaytestRouteHandoff() {
      const token = this.routeBuilderPlaytestToken()
      if (!token) return false
      const record = consumeBuilderPlaytestHandoff(token)
      this.clearBuilderPlaytestRouteToken()
      if (!record) {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.builderLevelExpired',
          'Builder level expired',
          this.uiText('gameplay.playground.notifications.builderLevelExpiredBody', 'The playtest handoff could not be found. Select a saved builder level or load a ZIP.')
        )
        return false
      }
      const loaded = this.applyBuilderPlaytestLevel(record, { fromHandoff: true })
      if (loaded) {
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.builderLevelLoaded',
          'Builder level loaded',
          this.uiFormat('gameplay.playground.notifications.levelReadyToTest', `Level ${record.id} is ready to test.`, { levelId: record.id })
        )
      }
      return loaded
    },

    applyBuilderPlaytestLevel(record, { fromHandoff = false } = {}) {
      if (!record || !record.package) return false
      this.registerAvailableLevel({
        id: record.id,
        label: record.label || record.id,
        source: BUILDER_PLAYTEST_SOURCE,
        package: record.package,
        warnings: record.warnings,
        removable: true
      })
      if (fromHandoff) clearGameState()
      return this.applyLoadedLevelPackage(record.package, {
        source: BUILDER_PLAYTEST_SOURCE,
        warnings: record.warnings || [],
        seed: defaultSeedForLevel(record.id)
      })
    },

    onSetupLevelIdInput(value) {
      const previousDefaultSeed = defaultSeedForLevel(this.levelIdInput)
      const nextId = normalizeLevelId(value)
      const currentSeed = this.rngSeed != null ? String(this.rngSeed).trim() : ''
      this.levelIdInput = nextId
      if (!currentSeed || currentSeed === previousDefaultSeed) {
        this.rngSeed = defaultSeedForLevel(nextId)
      }
    },

    onSetupSeedInput(value) {
      this.rngSeed = value != null ? String(value) : ''
    },

    onLoadSelectedLevel() {
      const id = normalizeLevelId(this.levelIdInput)
      const levelRecord = this.availableLevels.find(level => level.id === id)
      if (levelRecord && levelRecord.package) {
        const warnings = Array.isArray(levelRecord.warnings) ? levelRecord.warnings : []
        const loaded = this.applyLoadedLevelPackage(levelRecord.package, {
          source: levelRecord.source || 'loaded',
          warnings,
          seed: this.matchSetupSeed
        })
        if (loaded) {
          this.notifyUser(
            'success',
            'gameplay.playground.notifications.levelLoaded',
            'Level loaded',
            this.uiFormat('gameplay.playground.notifications.levelLoadedReady', `Level ${id} loaded. Start game when ready.`, { levelId: id })
          )
        }
        return loaded
      }
      return this.loadLevelById({
        levelId: id,
        seed: this.matchSetupSeed,
        source: 'default'
      })
    },

    onStartLoadedLevel() {
      return this.startLoadedLevel({ seed: this.matchSetupSeed })
    },

    onExportLoadedBuilderLevel() {
      if (!this.builderExportLevelId || !this.loadedLevelPackage) return false
      const levelId = this.loadedLevelPackage.id || this.builderExportLevelId
      const blob = buildLevelArchiveBlob(this.loadedLevelPackage, levelId)
      this.downloadBlob(levelArchiveFilename(levelId), blob)
      this.notifyUser(
        'success',
        'gameplay.playground.notifications.builderLevelExported',
        'Builder level exported',
        this.uiFormat('gameplay.playground.notifications.archiveDownloaded', `Archive "${levelId}.zip" downloaded.`, { levelId })
      )
      return true
    },

    onDeleteSelectedLevel() {
      const id = normalizeLevelId(this.levelIdInput)
      if (id === DEFAULT_LEVEL_ID || this.gameState) return false
      const record = this.availableLevels.find(level => level.id === id)
      if (!record || record.removable !== true) return false

      removePersistedBuilderPlaytestLevel(id)
      const nextLevels = this.availableLevels.filter(level => level.id !== id)
      this.availableLevels = nextLevels.length > 0
        ? nextLevels
        : [{ id: DEFAULT_LEVEL_ID, label: DEFAULT_LEVEL_ID, source: 'default', package: null, warnings: [], removable: false }]

      if (this.loadedLevelPackage && this.loadedLevelPackage.id === id) {
        this.clearActiveGame({ keepLoadedLevel: false })
      }

      this.onSetupLevelIdInput(DEFAULT_LEVEL_ID)
      this.notifyUser(
        'info',
        'gameplay.playground.notifications.levelRemoved',
        'Level removed',
        this.uiFormat('gameplay.playground.notifications.levelRemovedBody', `Removed ${id} from the local Playground list.`, { levelId: id })
      )
      return true
    },

    async onUploadArchive(file) {
      if (!file) return false
      if (this.isInitializing || this.isRestoring) return false
      this.isInitializing = true
      try {
        if (typeof file.arrayBuffer !== 'function') {
          throw new TypeError('Selected file cannot be read as an ArrayBuffer.')
        }
        const buffer = await file.arrayBuffer()
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
        const sourceName = typeof file.name === 'string' && file.name ? file.name : 'archive.zip'
        const result = loadLevelArchivePackage(bytes, { sourceName })
        if (!result.ok) {
          const summary = this.formatLevelIssues(result.errors)
          console.error('Archive load failed:', result.errors)
          this.notifyUser('error', 'gameplay.playground.notifications.loadArchiveFailed', 'Load archive failed', summary)
          return false
        }

        const warnings = Array.isArray(result.warnings) ? result.warnings : []
        if (warnings.length > 0) {
          const summary = this.formatLevelIssues(warnings)
          console.warn('Archive warnings:', warnings)
          this.notifyUser('warning', 'gameplay.playground.notifications.archiveWarnings', 'Archive warnings', summary)
        }

        const archiveId =
          (result.package && result.package.id) ||
          result.archiveId ||
          normalizeLevelId(this.levelIdInput)
        const pkg = { ...result.package, id: archiveId }
        const previousDefaultSeed = defaultSeedForLevel(this.levelIdInput)
        const currentSeed = this.rngSeed != null ? String(this.rngSeed).trim() : ''
        const seed = currentSeed && currentSeed !== previousDefaultSeed
          ? currentSeed
          : defaultSeedForLevel(archiveId)
        this.registerAvailableLevel({
          id: archiveId,
          label: archiveId,
          source: 'zip',
          package: pkg,
          warnings,
          removable: true
        })
        this.applyLoadedLevelPackage(pkg, { source: 'zip', warnings, seed })
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.archiveLoaded',
          'Archive loaded',
          this.uiFormat('gameplay.playground.notifications.archiveLoadedReady', `Level ${pkg.id} loaded from ${sourceName}. Start game when ready.`, { levelId: pkg.id, sourceName })
        )
        return true
      } catch (err) {
        console.error('Archive read failed:', err)
        this.notifyUser(
          'error',
          'gameplay.playground.notifications.loadArchiveFailed',
          'Load archive failed',
          err && err.message ? err.message : this.uiText('gameplay.playground.notifications.archiveReadFailed', 'Could not read selected ZIP file.')
        )
        return false
      } finally {
        this.isInitializing = false
      }
    },

    registerAvailableLevel({ id, label, source = 'default', package: levelPackage = null, warnings = [], removable = false } = {}) {
      const safeId = normalizeLevelId(id)
      const next = {
        id: safeId,
        label: label || safeId,
        source,
        package: levelPackage,
        warnings: Array.isArray(warnings) ? warnings.slice() : [],
        removable: safeId !== DEFAULT_LEVEL_ID && removable === true
      }
      const index = this.availableLevels.findIndex(level => level.id === safeId)
      if (index >= 0) {
        this.availableLevels.splice(index, 1, {
          ...this.availableLevels[index],
          ...next
        })
      } else {
        this.availableLevels.push(next)
      }
    },

    async loadLevelById({ levelId, seed, source = 'default' } = {}) {
      const id = normalizeLevelId(levelId)
      const seedRaw = seed != null ? String(seed).trim() : ''
      const rngSeed = seedRaw || `${id}-seed-1`
      if (this.isInitializing || this.isRestoring) return
      this.isInitializing = true
      try {
        const result = await loadLevelPackage(id)
        if (!result.ok) {
          const summary = this.formatLevelIssues(result.errors)
          console.error('Level load failed:', result.errors)
          this.notifyUser('error', 'gameplay.playground.notifications.loadLevelFailed', 'Load level failed', summary)
          return
        }
        const warnings = Array.isArray(result.warnings) ? result.warnings : []
        if (warnings.length > 0) {
          const summary = this.formatLevelIssues(result.warnings)
          console.warn('Level warnings:', result.warnings)
          this.notifyUser('warning', 'gameplay.playground.notifications.levelWarnings', 'Level warnings', summary)
        }
        const pkg = { ...result.package, id: result.package.id || id }
        this.registerAvailableLevel({
          id: pkg.id || id,
          label: pkg.id || id,
          source,
          package: pkg,
          warnings
        })
        this.applyLoadedLevelPackage(pkg, { source, warnings, seed: rngSeed })
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.levelLoaded',
          'Level loaded',
          this.uiFormat('gameplay.playground.notifications.levelLoadedReady', `Level ${pkg.id || id} loaded. Start game when ready.`, { levelId: pkg.id || id })
        )
        return true
      } finally {
        this.isInitializing = false
      }
    },

    applyLoadedLevelPackage(pkg, { source = 'default', warnings = [], seed = null } = {}) {
      if (!pkg || typeof pkg !== 'object') return false
      const mapData = pkg.hexmap
      const terrainTypes = pkg.terrain && Array.isArray(pkg.terrain.terrainTypes)
        ? pkg.terrain.terrainTypes
        : []
      const movesData = pkg.turntable
      const unitsData = pkg.units
      const id = typeof pkg.id === 'string' && pkg.id.trim() ? pkg.id.trim() : 'level_000'
      this.currentMapData = mapData
      this.terrainTypes = terrainTypes
      this.currentMovesData = movesData
      this.unitsData = unitsData
      this.levelId = id
      this.levelIdInput = id
      this.rngSeed = seed || this.rngSeed || `${id}-seed-1`
      const levelPackage = {
        id,
        schemaVersion: pkg.schemaVersion || LATEST_LEVEL_PACKAGE_SCHEMA_VERSION,
        hexmap: mapData,
        terrain: { terrainTypes },
        units: unitsData,
        turntable: movesData
      }
      const objectivesData = pkg.objectives || buildDefaultObjectivesForLevelPackage(levelPackage)
      this.loadedLevelPackage = {
        ...levelPackage,
        ...(objectivesData ? { objectives: objectivesData } : {})
      }
      this.loadedLevelSource = source
      this.loadedLevelWarnings = Array.isArray(warnings) ? warnings.slice() : []
      this.clearActiveGame({ keepLoadedLevel: true })
      return true
    },

    clearActiveGame({ keepLoadedLevel = false } = {}) {
      this.cancelDiceRollAnimation()
      this.selectedHex = null
      this.gameState = null
      this.isGameLoaded = false
      this.isDiceRolling = false
      this.lastOutcomeKey = null
      this.showOutcomeDialog = false
      this.selectionInspectorBridge = this.emptySelectionInspectorBridge()
      this.requestMapDeselect()
      if (!keepLoadedLevel) {
        this.currentMapData = null
        this.terrainTypes = null
        this.currentMovesData = null
        this.unitsData = null
        this.levelIdInput = DEFAULT_LEVEL_ID
        this.levelId = null
        this.rngSeed = null
        this.loadedLevelPackage = null
        this.loadedLevelSource = null
        this.loadedLevelWarnings = []
      }
    },

    emptySelectionInspectorBridge() {
      return {
        selectedUnitId: null,
        canMoveForward: false,
        canMoveReverse: true,
        canRotate: false,
        canFire: false,
        canReload: false,
        validAttackTargets: [],
        selectedTargetIndex: 0,
        moveForwardTarget: null,
        moveReverseTarget: null,
        currentDiceResultForUi: null
      }
    },

    startLoadedLevel({ seed, notify = true } = {}) {
      const pkg = this.loadedLevelPackage || this.levelPackage
      if (!pkg) {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.startGame',
          'Start game',
          this.uiText('gameplay.playground.notifications.loadValidLevelFirst', 'Load a valid level first.')
        )
        return false
      }
      const mapData = pkg.hexmap
      const terrainTypes = pkg.terrain.terrainTypes
      const movesData = pkg.turntable
      const unitsData = pkg.units
      const objectivesData = pkg.objectives || buildDefaultObjectivesForLevelPackage(pkg)
      const seedRaw = seed != null ? String(seed).trim() : ''
      const rngSeed = seedRaw || this.rngSeed || `${pkg.id}-seed-1`
      if (this.isStartingGame || this.isRestoring) return false
      this.isStartingGame = true
      this.cancelDiceRollAnimation()
      this.lastOutcomeKey = null
      this.showOutcomeDialog = false
      try {
        this.gameState = new GameState({
          width: mapData.parameters.width,
          height: mapData.parameters.height,
          currentPlayer: 'player1',
          mapData,
          terrainTypes,
          unitsData,
          turntableData: movesData,
          objectivesData,
          rng: createRng(rngSeed)
        })
      } catch (err) {
        console.error('GameState init failed:', err)
        this.notifyUser(
          'error',
          'gameplay.playground.notifications.initFailed',
          'Init failed',
          err.message || this.uiText('gameplay.playground.notifications.initFailedFallback', 'Failed to create game.')
        )
        return false
      } finally {
        this.isStartingGame = false
      }
      this.rngSeed = rngSeed
      this.isGameLoaded = true
      this.onGameStateUpdated(this.gameState)
      if (notify) {
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.gameStarted',
          'Game started',
          this.uiFormat('gameplay.playground.notifications.gameStartedBody', `Level ${pkg.id} initialized.`, { levelId: pkg.id })
        )
      }
      return true
    },

    /**
     * Render the first 3 issues from a validator result into one human-readable
     * string for `$notify`. Falls back to a generic message when the list is empty.
     */
    formatLevelIssues(issues) {
      const list = Array.isArray(issues) ? issues : []
      if (list.length === 0) return this.uiText('gameplay.playground.notifications.issuesFallback', 'Failed to load level.')
      const formatted = list.slice(0, 3).map(issue => {
        const path = issue && issue.path ? `${issue.path}: ` : ''
        return `${path}${issue && issue.message ? issue.message : this.uiText('gameplay.playground.notifications.unknownIssue', 'unknown issue')}`
      })
      const tail = list.length > 3
        ? `\n${this.uiFormat('gameplay.playground.notifications.moreIssues', `...and ${list.length - 3} more`, { count: list.length - 3 })}`
        : ''
      return formatted.join('\n') + tail
    },

    downloadBlob(filename, blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    onHexSelected(hex) {
      console.log('Hex selected:', hex)
      this.selectedHex = hex
    },
    
    onGameStateUpdated(gameState) {
      this.gameState = gameState
      this.saveCurrentGameState()
      this.handleOutcomeChange()
    },

    handleOutcomeChange() {
      const outcome = this.gameOutcome
      if (!outcome || outcome.status !== OUTCOME_STATUS.ENDED) {
        this.showOutcomeDialog = false
        return
      }
      const key = [
        outcome.status,
        outcome.winner || '',
        outcome.reason || '',
        outcome.conditionId || ''
      ].join(':')
      if (this.lastOutcomeKey === key) return
      this.lastOutcomeKey = key
      this.showOutcomeDialog = true

      const notifier = typeof window !== 'undefined' ? window.$notify : null
      const message = this.outcomeMessage || formatOutcomeLabel(outcome)
      if (!notifier) return
      if (outcome.winner === 'draw' && typeof notifier.info === 'function') {
        notifier.info(this.uiText('gameplay.playground.notifications.gameOver', 'Game over'), message)
      } else if (typeof notifier.success === 'function') {
        notifier.success(this.uiText('gameplay.playground.notifications.gameOver', 'Game over'), message)
      }
    },

    dismissOutcomeDialog() {
      this.showOutcomeDialog = false
    },

    openOutcomeDialog() {
      if (!this.isGameEnded) return
      this.showOutcomeDialog = true
    },

    cancelDiceRollAnimation() {
      this.diceCancelIntent = { seq: this.diceCancelIntent.seq + 1 }
      this.isDiceRolling = false
    },

    currentTurnHasDiceRoll() {
      const gs = this.gameState
      if (gs && typeof gs.hasRolledDice === 'function') {
        try {
          return gs.hasRolledDice()
        } catch (err) {
          console.warn('Dice state check failed:', err)
        }
      }
      const actions = Array.isArray(gs && gs.currentTurnActions) ? gs.currentTurnActions : []
      return actions.some(action => action && action.type === 'dice_roll')
    },

    onTimelineRollDice() {
      if (!this.gameState || this.isGameEnded) return
      if (this.isDiceRolling || this.currentTurnHasDiceRoll()) return
      this.diceRollIntent = { seq: this.diceRollIntent.seq + 1 }
    },

    onTimelineInstantRollDice() {
      if (!this.gameState || this.isGameEnded) return
      if (this.isDiceRolling) return
      if (this.currentTurnHasDiceRoll()) return
      this.diceRollRightIntent = { seq: this.diceRollRightIntent.seq + 1 }
    },

    onEngineGameStateUpdated(gameState) {
      this.commandSeq++
      this.onGameStateUpdated(gameState)
    },
    
    // Методи для роботи зі збереженням
    async loadSavedGameState() {
      // Call `loadGameState` directly instead of gating on
      // `hasSavedGameState()`. The latter swallows a `getItem` throw as
      // `false` ("no save found"), which would silently hide a real
      // storage failure that should surface as `STORAGE_UNAVAILABLE`.
      // `loadGameState` already returns `{ ok: true, state: empty }`
      // when there is no save, so the early-return branch below handles
      // the cold-start case without needing the extra guard.
      const result = loadGameState()
      if (!result.ok) {
        this.handleRestoreFailure(result)
        return
      }

      const savedState = result.state
      // "No save" / "storage unsupported (SSR)" both produce an empty
      // state with no engine, no level id, and no `lastSaved` stamp.
      // Skip the apply path so we do not toast warnings or log restore
      // diagnostics for a cold-start mount.
      const hasSavedData = !!(
        savedState && (savedState.gameState != null || savedState.levelId != null || savedState.lastSaved != null)
      )
      if (!hasSavedData) {
        console.log('No saved game state found')
        return
      }

      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        console.warn('Restore warnings:', result.warnings)
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.restoreWarnings',
          'Restore warnings',
          this.formatLevelIssues(result.warnings)
        )
      }

      this.currentMapData = savedState.mapData
      this.terrainTypes = savedState.terrainTypes || null
      this.currentMovesData = savedState.movesData || null
      this.unitsData = savedState.unitsData || null
      this.levelId = savedState.levelId || null
      this.levelIdInput = this.levelId || DEFAULT_LEVEL_ID
      this.rngSeed = savedState.rngSeed || null
      this.selectedHex = savedState.selectedHex
      this.gameState = savedState.gameState
      this.lastOutcomeKey = null
      this.selectedHexDropdownPosition = savedState.selectedHexDropdownPosition || { x: 100, y: 100 }
      this.showFloatingPanel = normalizeBool(savedState.showFloatingPanel, true)
      this.isGameLoaded = !!this.gameState
      if (this.currentMapData && this.unitsData && this.currentMovesData && Array.isArray(this.terrainTypes)) {
        const restoredObjectives = this.gameState && this.gameState.objectives
          ? this.gameState.objectives
          : null
        this.loadedLevelPackage = {
          id: this.levelId || 'level_000',
          schemaVersion: LATEST_LEVEL_PACKAGE_SCHEMA_VERSION,
          hexmap: this.currentMapData,
          terrain: { terrainTypes: this.terrainTypes },
          units: this.unitsData,
          turntable: this.currentMovesData,
          ...(restoredObjectives ? { objectives: restoredObjectives } : {})
        }
        this.loadedLevelSource = 'restore'
        this.loadedLevelWarnings = []
      }

      console.log('Loaded saved dropdown positions:', {
        selectedHexDropdown: this.selectedHexDropdownPosition
      })
      console.log('Saved game state loaded:', {
        hasMap: !!savedState.mapData,
        hasGameState: !!savedState.gameState,
        lastSaved: savedState.lastSaved
      })
      if (savedState.lastSaved) {
        const lastSavedDate = new Date(savedState.lastSaved)
        console.log(`Game state restored from ${lastSavedDate.toLocaleString()}`)
      }
      this.handleOutcomeChange()

      this.$nextTick(() => {
        if (this.selectedHex && typeof this.selectedHex.q === 'number' && typeof this.selectedHex.r === 'number') {
          const hexMapData = this.$refs.gameMapBlock?.hexMapData
          if (Array.isArray(hexMapData)) {
            const found = hexMapData.find(h => h.q === this.selectedHex.q && h.r === this.selectedHex.r)
            this.selectedHex = found ?? null
          }
        }
      })
    },
    
    saveCurrentGameState() {
      const stateToSave = {
        levelId: this.levelId,
        mapData: this.currentMapData,
        terrainTypes: this.terrainTypes,
        unitsData: this.unitsData,
        movesData: this.currentMovesData,
        rngSeed: this.rngSeed,
        gameState: this.gameState,
        selectedHex: this.selectedHex,
        selectedUnit: null, // Буде оновлено з GameMapBlock
        selectedHexDropdownPosition: this.selectedHexDropdownPosition,
        selectedHexDropdownVisible: false, // Буде оновлено з GameMapBlock
        showFloatingPanel: this.showFloatingPanel
      }

      const outcome = saveGameState(stateToSave)
      if (!outcome.ok) {
        this.handleSaveFailure(outcome)
      } else if (this._lastSaveErrorCode) {
        // Storage is healthy again; clear the dedupe lock so a future
        // failure surfaces immediately instead of being silenced.
        this._lastSaveErrorCode = null
      }
    },

    /**
     * Render a structured restore failure to the user. Picks notification
     * copy from `result.code` so the message matches the failure mode
     * (corrupted JSON vs forward version vs engine-restore failure) and
     * appends the first few `details[]` entries for diagnostics.
     *
     * Behavior: every restore failure clears the saved snapshot so the
     * next mount cycle starts clean. `UNSUPPORTED_VERSION` is the one
     * exception — the saved data may be readable by a newer build, so
     * we leave it in place and ask the user to update.
     */
    handleRestoreFailure(result) {
      const code = result && result.code
      const error = result && result.error
      const details = Array.isArray(result && result.details) ? result.details : []
      console.error('Restore failed:', code, error, details)

      const detailSummary = this.formatLevelIssues(details)
      const errorMessage = error == null ? '' : String(error)
      const body =
        details.length > 0
          ? [errorMessage, detailSummary].filter(Boolean).join('\n')
          : errorMessage || this.uiText('gameplay.playground.notifications.restoreFailedFallback', 'Saved game could not be restored.')

      const title =
        code === RESTORE_ERROR_CODES.UNSUPPORTED_VERSION
          ? this.uiText('gameplay.playground.notifications.restoreSavedGameTooNew', 'Saved game too new')
          : code === RESTORE_ERROR_CODES.CORRUPTED_JSON
            ? this.uiText('gameplay.playground.notifications.restoreSavedGameCorrupted', 'Saved game corrupted')
            : code === RESTORE_ERROR_CODES.ENGINE_RESTORE_FAILED
              ? this.uiText('gameplay.playground.notifications.restoreEngineFailed', 'Engine restore failed')
              : code === RESTORE_ERROR_CODES.STORAGE_UNAVAILABLE
                ? this.uiText('gameplay.playground.notifications.storageUnavailable', 'Storage unavailable')
                : this.uiText('gameplay.playground.notifications.restoreFailed', 'Restore failed')

      const api = typeof window !== 'undefined' ? window.$notify : null
      if (api && typeof api.error === 'function') api.error(title, body)

      // Keep the saved blob if a newer-build save just needs the user to
      // update the app; discard it in every other failure mode so the
      // next reload does not re-show the same error.
      if (code !== RESTORE_ERROR_CODES.UNSUPPORTED_VERSION) {
        clearGameState()
      }
    },

    /**
     * Surface a save failure without spamming `$notify` when many saves
     * fail in quick succession (every dropdown drag / engine command
     * triggers a save). The same `code` is silenced after the first hit
     * for ten seconds; a different code or a recovery (`ok: true`) resets
     * the lock.
     */
    handleSaveFailure(outcome) {
      const code = outcome && outcome.code
      console.error('Save failed:', code, outcome && outcome.error)

      if (!window.$notify) return
      if (this._lastSaveErrorCode === code) return

      this._lastSaveErrorCode = code
      if (code === SAVE_ERROR_CODES.QUOTA_EXCEEDED) {
        this.notifyUser(
          'error',
          'gameplay.playground.notifications.saveFailedStorageFull',
          'Save failed (storage full)',
          outcome.error
        )
      } else if (code === SAVE_ERROR_CODES.STORAGE_UNAVAILABLE) {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.saveDisabled',
          'Save disabled',
          outcome.error
        )
      } else {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.saveFailed',
          'Save failed',
          outcome.error || this.uiText('gameplay.playground.notifications.saveFailedFallback', 'Game state could not be saved.')
        )
      }

      if (this._saveErrorResetTimer) clearTimeout(this._saveErrorResetTimer)
      this._saveErrorResetTimer = setTimeout(() => {
        this._lastSaveErrorCode = null
        this._saveErrorResetTimer = null
      }, 10000)
    },

    /** Збереження після зміни лише позиції плаваючих панелей (без сотень записів під час drag). */
    schedulePersistUiState() {
      if (this.persistUiTimer) clearTimeout(this.persistUiTimer)
      this.persistUiTimer = setTimeout(() => {
        this.persistUiTimer = null
        this.saveCurrentGameState()
      }, 450)
    },
    
    resetGame() {
      if (confirm(this.uiText('gameplay.playground.notifications.resetConfirm', 'Reset the current game? The loaded level will stay ready to start again.'))) {
        if (this.persistUiTimer) {
          clearTimeout(this.persistUiTimer)
          this.persistUiTimer = null
        }
        clearGameState()
        this.selectedHexDropdownPosition = { x: 100, y: 100 }
        this.showFloatingPanel = true
        const keepLoadedLevel = !!this.loadedLevelPackage
        this.clearActiveGame({ keepLoadedLevel })

        console.log('Game reset - all data cleared')
        const message = keepLoadedLevel
          ? this.uiText('gameplay.playground.notifications.gameProgressCleared', 'Game progress cleared. Loaded level is ready to start again.')
          : this.uiText('gameplay.playground.notifications.gameResetSuccess', 'Game has been reset successfully!')
        this.notifyUser('success', 'gameplay.playground.notifications.gameReset', 'Game reset', message)
      }
    },
    
    updateSelectedHexDropdownPosition(position) {
      this.selectedHexDropdownPosition = position
      this.schedulePersistUiState()
    },

    onShowFloatingPanelUpdate(value) {
      this.showFloatingPanel = normalizeBool(value, this.showFloatingPanel)
      this.saveCurrentGameState()
    },

    onDiceRollingChanged(value) {
      this.isDiceRolling = normalizeBool(value, false)
    },

    onSelectionInspectorBridge(payload) {
      if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return
      const targets = Array.isArray(payload.validAttackTargets) ? payload.validAttackTargets.slice() : []
      const idxRaw = Number(payload.selectedTargetIndex)
      const idx =
        Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.floor(idxRaw) : 0
      const selectedUnitId =
        typeof payload.selectedUnitId === 'string' && payload.selectedUnitId
          ? payload.selectedUnitId
          : null
      const moveForwardTarget =
        payload.moveForwardTarget && typeof payload.moveForwardTarget === 'object'
          ? { q: payload.moveForwardTarget.q, r: payload.moveForwardTarget.r }
          : null
      const moveReverseTarget =
        payload.moveReverseTarget && typeof payload.moveReverseTarget === 'object'
          ? { q: payload.moveReverseTarget.q, r: payload.moveReverseTarget.r }
          : null
      const dice = Number(payload.currentDiceResultForUi)
      this.selectionInspectorBridge = {
        selectedUnitId,
        canMoveForward: !!payload.canMoveForward,
        canMoveReverse: typeof payload.canMoveReverse === 'boolean' ? payload.canMoveReverse : true,
        canRotate: !!payload.canRotate,
        canFire: !!payload.canFire,
        canReload: !!payload.canReload,
        validAttackTargets: targets,
        selectedTargetIndex: idx,
        moveForwardTarget,
        moveReverseTarget,
        currentDiceResultForUi: Number.isFinite(dice) ? dice : null
      }
    },

    /**
     * Dispatch a controller command and signal the map to refresh its
     * derived view state. Returns the controller result so the caller
     * can decide on notifications.
     */
    dispatchEngineCommand(method, args) {
      if (!this.gameController) return { ok: false, code: 'NO_CONTROLLER', message: 'Game controller is not available.' }
      const fn = this.gameController[method]
      if (typeof fn !== 'function') {
        return { ok: false, code: 'UNKNOWN_COMMAND', message: `Unknown controller command: ${method}` }
      }
      const result = fn.call(this.gameController, args)
      if (result.ok) {
        this.commandSeq++
        this.onGameStateUpdated(this.gameState)
      }
      return result
    },

    /**
     * Standard notification shim used by `commandReactions`. Maps to
     * `window.$notify` if it is registered; otherwise drops the call.
     */
    notifyForCommand(level, title, message) {
      const notifier = typeof window !== 'undefined' ? window.$notify : null
      if (!notifier || typeof notifier[level] !== 'function') return
      notifier[level](title, message)
    },

    /**
     * Build a wrapped controller that bumps `commandSeq` + replays
     * `onGameStateUpdated` after every successful command. This is the
     * controller that `commandReactions` see — it lets them stay free
     * of view-state concerns while keeping the playground's bridge
     * sync invariants intact.
     */
    bridgedController() {
      const playground = this
      const base = playground.gameController
      const wrap = (method) => (args) => {
        if (!base) return { ok: false, code: 'NO_CONTROLLER', message: 'Game controller is not available.' }
        const result = base[method](args)
        if (result.ok) {
          playground.commandSeq++
          playground.onGameStateUpdated(playground.gameState)
        }
        return result
      }
      return {
        moveUnit: wrap('moveUnit'),
        updateUnitFacing: wrap('updateUnitFacing'),
        performAttack: wrap('performAttack'),
        performReload: wrap('performReload'),
        rollDiceFromEngine: wrap('rollDiceFromEngine')
      }
    },

    /**
     * Read current facing for the selected unit out of the engine. The
     * bridge does not carry facing because it is derived in the map
     * from `unit.facing`; the playground reads the same source for
     * sidebar-initiated rotations.
     */
    selectedUnitFacing() {
      const id = this.selectionInspectorBridge && this.selectionInspectorBridge.selectedUnitId
      if (!id || !this.gameState || typeof this.gameState.units?.get !== 'function') return 0
      const unit = this.gameState.units.get(id)
      return unit && Number.isInteger(unit.facing) ? unit.facing : 0
    },

    /**
     * Read `turnState[unitId].isLoaded` for the selected unit. The
     * bridge does not carry this either; it is only needed by the
     * fire/reload reactions to pick the right warning text.
     */
    selectedUnitIsLoaded() {
      const id = this.selectionInspectorBridge && this.selectionInspectorBridge.selectedUnitId
      if (!id || !this.gameState || !this.gameState.turnState) return false
      const row = this.gameState.turnState[id]
      return !!(row && row.isLoaded === true)
    },

    /**
     * Single UI-cleanup channel — the map watches `deselectIntent` and
     * clears its selection when the counter changes. Replaces the
     * previous `$refs.gameMapBlock.deselectHex()` call.
     */
    requestMapDeselect() {
      this.deselectIntent++
    },

    onEngineDeselect() {
      this.requestMapDeselect()
    },

    /**
     * Build the `ctx` object that `commandReactions` consume. Pulls
     * everything from the bridge except `currentFacing` and `isLoaded`,
     * which the bridge does not carry — those come from the engine.
     */
    buildReactionContext() {
      const b = this.selectionInspectorBridge || {}
      return {
        selectedUnitId: b.selectedUnitId || null,
        canMoveForward: !!b.canMoveForward,
        canMoveReverse: !!b.canMoveReverse,
        canRotate: !!b.canRotate,
        canFire: !!b.canFire,
        canReload: !!b.canReload,
        validAttackTargets: Array.isArray(b.validAttackTargets) ? b.validAttackTargets : [],
        selectedTargetIndex: b.selectedTargetIndex || 0,
        moveForwardTarget: b.moveForwardTarget || null,
        moveReverseTarget: b.moveReverseTarget || null,
        dice: b.currentDiceResultForUi == null ? null : b.currentDiceResultForUi,
        currentFacing: this.selectedUnitFacing(),
        isLoaded: this.selectedUnitIsLoaded(),
        uiText: (key, fallback, params) => this.uiText(key, fallback, params)
      }
    },

    onEngineMoveUnitForward() {
      reactMoveForward(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand)
    },

    onEngineMoveUnitReverse() {
      reactMoveReverse(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand)
    },

    onEngineRotateUnitClockwise() {
      reactRotate(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand, 1)
    },

    onEngineRotateUnitCounterclockwise() {
      reactRotate(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand, -1)
    },

    onEngineFire() {
      reactFire(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand)
    },

    onEngineReload() {
      reactReload(this.buildReactionContext(), this.bridgedController(), this.notifyForCommand)
    },

    onEngineAttackTargetShift(delta) {
      // UI-only shift. Signaled through a reactive intent prop so the
      // map applies the shift without the playground calling its
      // methods through `$refs`.
      const d = Number(delta)
      if (!Number.isFinite(d)) return
      this.attackTargetShiftIntent = {
        delta: d,
        seq: this.attackTargetShiftIntent.seq + 1
      }
    },

    onEngineUnitPreviewHover(unitId) {
      const normalized = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      this.unitPreviewHoverIntent = {
        unitId: normalized,
        seq: this.unitPreviewHoverIntent.seq + 1
      }
    },

    onEngineUnitPreviewSelect(unitId) {
      const normalized = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      this.unitPreviewSelectIntent = {
        unitId: normalized,
        seq: this.unitPreviewSelectIntent.seq + 1
      }
    },

    onEndTurn() {
      this.cancelDiceRollAnimation()
      const result = this.dispatchEngineCommand('endTurn')
      if (result.ok) {
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.turnEnded',
          'Turn ended',
          this.uiFormat('gameplay.playground.notifications.turnStarted', `Started turn ${result.result.turnNumber}`, { turnNumber: result.result.turnNumber })
        )
        // "Starting next turn" semantics: now that a new turn has begun,
        // auto-play it if the new active side's toggle is on.
        this.maybeAutoPlayCurrentTurn()
      } else if (result.code !== 'NO_GAMESTATE' && result.code !== 'NO_CONTROLLER' && window.$notify) {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.endTurnFailed',
          'End turn failed',
          result.message || this.uiText('gameplay.playground.notifications.endTurnFailedFallback', 'Could not end turn.')
        )
      }
    },

    /** Setup-tab doctrine picker → update the per-side profile config. */
    onUpdateDoctrineProfile({ player, profile } = {}) {
      if (player !== 'player1' && player !== 'player2') return
      const profiles = Object.values(STRATEGY_PROFILES)
      if (!profiles.includes(profile)) return
      this.autoPlayPlayers = {
        ...this.autoPlayPlayers,
        [player]: { profile }
      }
    },

    /** Turn-controls toggle → enable/disable auto-play for one side. */
    onUpdateAutoPlay({ player, enabled } = {}) {
      if (player !== 'player1' && player !== 'player2') return
      this.autoPlayEnabled = {
        ...this.autoPlayEnabled,
        [player]: enabled === true
      }
    },

    /**
     * One-shot button: auto-play the ACTIVE side's current turn regardless
     * of the toggles. Unlike "End turn" (a hard finish), this spends the
     * side's remaining unit actions via the chosen doctrine and then stops,
     * leaving the human to press "End turn".
     */
    onAutoPlayCurrentTurn() {
      this.runAutoPlayForActiveSide()
    },

    /**
     * If the current active side has its auto-play toggle on, drive its
     * turn automatically. Called after a turn change (end turn / restart).
     */
    maybeAutoPlayCurrentTurn() {
      const player = this.gameState && this.gameState.currentPlayer
      if (player !== 'player1' && player !== 'player2') return
      if (!this.autoPlayEnabled[player]) return
      this.runAutoPlayForActiveSide()
    },

    /**
     * Core auto-play routine. Builds a doctrine strategy for the active
     * side from `autoPlayPlayers` and drives the LIVE gameState with the
     * shared headless `autoPlayTurn` helper (same getObservation →
     * listLegalCommands → applyCommand loop the match runner uses). After
     * it finishes it refreshes the UI bridges exactly like any other
     * engine command and surfaces the result.
     */
    runAutoPlayForActiveSide() {
      if (this.isAutoPlaying) return false
      if (!this.gameState || this.isGameEnded) return false
      if (this.isDiceRolling) this.cancelDiceRollAnimation()

      const player = this.gameState.currentPlayer
      if (player !== 'player1' && player !== 'player2') return false

      const config = this.autoPlayPlayers[player] || { profile: STRATEGY_PROFILES.BALANCED }
      const strategy = createStrategyFromConfig(config, { playerId: player })

      this.isAutoPlaying = true
      let summary
      try {
        summary = autoPlayTurn({
          gameState: this.gameState,
          strategy,
          // Only the `random` doctrine consumes the rng; heuristic/cautious
          // ignore it. Seed varies per turn (commandSeq) so successive random
          // turns differ while staying reproducible for a given seed+turn.
          rng: createRng(`${this.rngSeed || 'auto'}-autoplay-${this.commandSeq}`)
        })
      } catch (err) {
        console.error('Auto-play turn failed:', err)
        this.isAutoPlaying = false
        this.notifyUser(
          'warning',
          'gameplay.autoPlay.notifications.failed',
          'Auto-play failed',
          err && err.message ? err.message : this.uiText('gameplay.autoPlay.notifications.failedFallback', 'Could not auto-play the turn.')
        )
        return false
      }
      this.isAutoPlaying = false

      // Refresh derived view-state + persistence like any engine command.
      this.requestMapDeselect()
      this.selectionInspectorBridge = this.emptySelectionInspectorBridge()
      this.commandSeq++
      this.onGameStateUpdated(this.gameState)

      if (summary && summary.steps > 0) {
        const sideLabel = player === 'player2'
          ? this.uiText('common.enemy', 'Enemy')
          : this.uiText('common.player', 'Player')
        this.notifyUser(
          'info',
          'gameplay.autoPlay.notifications.played',
          'Turn auto-played',
          this.uiFormat(
            'gameplay.autoPlay.notifications.playedBody',
            `Auto-played ${summary.steps} action(s) for ${sideLabel}. Press "End turn" to continue.`,
            { count: summary.steps, side: sideLabel }
          )
        )
      }
      return true
    },

    onRestartGame() {
      if (!this.gameState) return
      const ok = typeof confirm === 'function'
        ? confirm(this.uiText('gameplay.playground.notifications.restartConfirm', 'Restart this game? Current progress will be cleared and the loaded level will start again.'))
        : true
      if (!ok) return

      this.cancelDiceRollAnimation()
      this.selectedHex = null
      this.selectionInspectorBridge = this.emptySelectionInspectorBridge()
      this.requestMapDeselect()

      const restarted = this.startLoadedLevel({
        seed: this.matchSetupSeed,
        notify: false
      })
      if (restarted && window.$notify) {
        const levelId = this.levelId || this.levelIdInput || DEFAULT_LEVEL_ID
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.gameRestarted',
          'Game restarted',
          this.uiFormat('gameplay.playground.notifications.gameRestartedBody', `Restarted level ${levelId}.`, { levelId })
        )
      }
    },

    onRevertGame({ turnIndex, actionIndex }) {
      if (!this.gameController) return
      const result = this.gameController.revertTo({ turnIndex, actionIndex })
      if (result.ok) {
        this.selectedHex = null
        this.requestMapDeselect()
        this.commandSeq++
        this.onGameStateUpdated(this.gameState)
        this.notifyUser(
          'info',
          'gameplay.playground.notifications.timeTravel',
          'Time travel',
          this.uiText('gameplay.playground.notifications.gameStateReverted', 'Game state reverted')
        )
      } else if (result.code !== 'NO_GAMESTATE' && window.$notify) {
        this.notifyUser(
          'warning',
          'gameplay.playground.notifications.revertFailed',
          'Revert failed',
          result.message || this.uiText('gameplay.playground.notifications.revertFailedFallback', 'Could not revert.')
        )
      }
    },

    onImportHistory(json) {
      // The Timeline menu emits one event for both file shapes:
      //   - new `GameSnapshot` envelopes (full level + RNG + engine), and
      //   - legacy history-only payloads (initialState + history + currentTurnActions).
      // The shape is detected here, not in Timeline, so the component
      // stays UI-only.
      let parsed = null
      try {
        parsed = JSON.parse(json)
      } catch (err) {
        // Defer to the legacy import path so the existing engine
        // validator reports the same error class users have always seen.
        const legacy = this.dispatchEngineCommand('importHistory', json)
        if (!legacy.ok && legacy.code !== 'NO_GAMESTATE' && legacy.code !== 'NO_CONTROLLER' && window.$notify) {
          this.notifyUser(
            'error',
            'gameplay.playground.notifications.importFailed',
            'Import failed',
            legacy.message || (err && err.message) || this.uiText('gameplay.playground.notifications.importFileFailed', 'Could not import file.')
          )
        }
        return
      }

      if (isGameSnapshotEnvelope(parsed)) {
        this.importGameSnapshot(parsed)
        return
      }

      const result = this.dispatchEngineCommand('importHistory', json)
      if (result.ok) {
        this.notifyUser(
          'success',
          'gameplay.playground.notifications.historyImported',
          'History imported',
          this.uiText('gameplay.playground.notifications.historyImportedBody', 'Game state restored from file')
        )
      } else if (result.code !== 'NO_GAMESTATE' && result.code !== 'NO_CONTROLLER' && window.$notify) {
        this.notifyUser(
          'error',
          'gameplay.playground.notifications.importFailed',
          'Import failed',
          result.message || this.uiText('gameplay.playground.notifications.importHistoryFailed', 'Could not import history.')
        )
      }
    },

    /**
     * Apply a parsed `GameSnapshot` transactionally. The snapshot's
     * embedded `LevelPackage` is fully re-validated before any field on
     * this page is mutated — a malformed or wrong-level payload leaves
     * the live game untouched and surfaces the validator errors.
     */
    importGameSnapshot(parsedSnapshot) {
      // Wrong-level guard: if a game is already loaded, refuse to swap
      // levels silently. A snapshot from a different level would
      // mismatch the running turntable, terrain catalog, and unit
      // roster.
      const expectedLevelId = this.levelId || null
      const outcome = applyGameSnapshot(parsedSnapshot, { expectedLevelId })
      if (!outcome.ok) {
        const summary = this.formatLevelIssues(outcome.errors)
        console.error('Snapshot import failed:', outcome.errors)
        this.notifyUser('error', 'gameplay.playground.notifications.importFailed', 'Import failed', summary)
        return
      }

      if (Array.isArray(outcome.warnings) && outcome.warnings.length > 0) {
        const summary = this.formatLevelIssues(outcome.warnings)
        console.warn('Snapshot warnings:', outcome.warnings)
        this.notifyUser('warning', 'gameplay.playground.notifications.snapshotWarnings', 'Snapshot warnings', summary)
      }

      const { levelPackage, rngSeed, gameState } = outcome.result
      this.cancelDiceRollAnimation()
      // Commit step — only after validation + GameState.fromJSON have
      // succeeded above. Field order here mirrors `startLoadedLevel`
      // so any downstream watchers see the same sequence of updates.
      this.currentMapData = levelPackage.hexmap
      this.terrainTypes = levelPackage.terrain.terrainTypes
      this.currentMovesData = levelPackage.turntable
      this.unitsData = levelPackage.units
      this.levelId = levelPackage.id
      this.levelIdInput = levelPackage.id || DEFAULT_LEVEL_ID
      this.rngSeed = rngSeed
      this.loadedLevelPackage = levelPackage
      this.loadedLevelSource = 'snapshot'
      this.loadedLevelWarnings = Array.isArray(outcome.warnings) ? outcome.warnings.slice() : []
      this.gameState = gameState
      this.selectedHex = null
      this.isGameLoaded = true
      this.lastOutcomeKey = null
      this.showOutcomeDialog = false
      this.requestMapDeselect()
      this.commandSeq++
      this.onGameStateUpdated(this.gameState)
      this.notifyUser(
        'success',
        'gameplay.playground.notifications.snapshotImported',
        'Snapshot imported',
        this.uiFormat('gameplay.playground.notifications.snapshotImportedBody', `Restored from snapshot (level ${levelPackage.id})`, { levelId: levelPackage.id })
      )
    }
  }
}
</script>

<style lang="scss">
@use '../styles/Playground.scss' as *;
</style>

<style lang="scss" scoped>
.playground {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f5;
}

@media (max-width: 1200px) {
  .playground {
    height: auto;
    min-height: 100vh;
    overflow-y: visible;
  }
}
</style>
