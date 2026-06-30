<template>
  <div class="grid-item grid-item--timeline">
    <div class="block-header-with-status">
      <h3 class="turn-title">{{ $t('gameplay.timeline.title') }}</h3>
      <!-- Turn Stepper -->
      <div v-if="gameState" class="turn-stepper-container">
        <button 
          class="stepper-arrow stepper-arrow-left" 
          v-show="hasOverflow"
          :class="{ inactive: !canScrollLeft }"
          :disabled="!canScrollLeft"
          @click="scrollStepper('left')"
          :aria-label="$t('gameplay.timeline.scrollLeft')"
        >
          ◀
        </button>
        
        <div
          class="turn-stepper"
          :class="{ 'turn-stepper__with-arrows': hasOverflow, 'turn-stepper__dragging': isStepperDragging }"
          ref="stepperScroll"
          @pointerdown="onStepperPointerDown"
          @scroll="checkScrollArrows"
        >
          <div 
            v-for="(turn, index) in timelineTurns" 
            :key="index"
            class="stepper-step"
            :class="{ active: currentViewTurn === index, completed: index < currentViewTurn }"
            :title="$tf('gameplay.timeline.viewTurn', `View turn ${index + 1}`, { turn: index + 1 })"
          >
            <div class="step-circle"
                @click="viewTurn(index)">
                {{ index + 1 }}
            </div>
            <div class="step-line"></div>
          </div>
          <!-- Current/Next Turn Indicator -->
           <div 
            class="stepper-step"
            :class="{ active: !isViewingPastTurn }"
            @click="viewTurn(-1)"
            :title="$tf('gameplay.timeline.viewCurrentTurn', `View current turn ${currentTurnNumber}`, { turn: currentTurnNumber })"
          >
            <div class="step-circle">{{ currentTurnNumber }}</div>
          </div>
            <button 
                class="control-btn end-turn-btn" 
                @click="endTurn"
                :disabled="!canEndTurn"
                :class="{ disabled: !canEndTurn }"
            >
                {{ $t('gameplay.timeline.endTurn') }}
            </button>
        </div>
        
        <button 
          class="stepper-arrow stepper-arrow-right" 
          v-show="hasOverflow"
          :class="{ inactive: !canScrollRight }"
          :disabled="!canScrollRight"
          @click="scrollStepper('right')"
          :aria-label="$t('gameplay.timeline.scrollRight')"
        >
          ▶
        </button>
      </div>
      <div v-if="gameState" class="header-controls">
        <div class="history-menu" ref="historyMenu">
          <button
            class="control-btn history-menu-trigger"
            type="button"
            @click.stop="toggleHistoryMenu"
            :aria-label="$t('gameplay.timeline.historyActions')"
            :title="$t('gameplay.timeline.historyActions')"
          >
            ⋮
          </button>
          <div v-if="showHistoryMenu" class="history-menu-dropdown">
            <button
              class="control-btn history-menu-item"
              type="button"
              @click="onExportClick"
              :title="$t('gameplay.timeline.exportSnapshotTitle')"
            >
              <span class="history-menu-item-text">{{ $t('gameplay.timeline.exportSnapshot') }}</span>
              <span class="history-menu-item-icon">💾</span>
            </button>
            <button
              class="control-btn history-menu-item"
              type="button"
              @click="onImportClick"
              :title="$t('gameplay.timeline.importSnapshotTitle')"
            >
              <span class="history-menu-item-text">{{ $t('gameplay.timeline.importSnapshot') }}</span>
              <span class="history-menu-item-icon">📂</span>
            </button>
          </div>
        </div>
        <input 
          type="file" 
          ref="fileInput" 
          style="display: none" 
          accept=".json" 
          @change="handleImport"
        >
      </div>
    </div>
    
    <div class="timeline-content" v-if="gameState">

      <!-- Turn Actions Display -->
      <div class="actions-header" :title="turnContextSubtitle">
          <span class="turn-context-title">{{ turnContextTitle }}</span>
          <span class="actions-count">
            {{ $tf('gameplay.timeline.actionsCount', `${displayedActions.length} ${displayedActions.length === 1 ? 'action' : 'actions'}`, {
              count: displayedActions.length,
              label: displayedActions.length === 1 ? $t('common.action') : $t('common.actions')
            }) }}
          </span>
      </div>

      <div class="actions-scroll-area">
            <div class="actions-list">
                <template v-for="(action, index) in displayedActions" :key="index">
                <div
                    class="action-card"
                    :class="[
                        getActionClass(action),
                        {
                            'action-card--revert-confirm': isActionRevertPending(index),
                            'action-card--will-revert': isActionAfterPendingRevert(index)
                        }
                    ]"
                    @click="handleActionClick(index)"
                    @contextmenu.prevent="handleActionContextMenu(action, index)"
                    :title="actionCardTitle(index)"
                >
                    <div
                        v-if="isActionRevertPending(index)"
                        class="revert-confirm"
                        data-test="timeline-revert-confirm"
                    >
                        <svg
                            class="revert-confirm__timer"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <circle
                                class="revert-confirm__timer-track"
                                cx="12"
                                cy="12"
                                r="8"
                            />
                            <circle
                                class="revert-confirm__timer-bar"
                                cx="12"
                                cy="12"
                                r="8"
                            />
                        </svg>
                        <span class="revert-confirm__label">{{ $t('gameplay.timeline.clickAgainToRevert') }}</span>
                    </div>
                    <template v-else>
                    <div class="action-header">
                        <span class="unit-name">{{ getActionLabel(action) }}</span>
                        <span v-if="isTurnBoundaryAction(action)" class="turn-side-label">
                            {{ getPlayerSideLabel(action.player) }}
                        </span>
                    </div>
                    <div class="action-details" v-if="action.type === 'dice_roll'">
                        <div class="coord-pair">
                            <span class="action-type">{{ $t('gameplay.timeline.diceRoll') }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="value">{{ $tf('gameplay.timeline.result', `Result: ${formatDiceResult(action.result)}`, { result: formatDiceResult(action.result) }) }}</span>
                        </div>
                    </div>
                    <div class="action-details" v-else-if="action.type === 'startTurn'">
                        <div class="coord-pair">
                            <span class="action-type">{{ $t('gameplay.timeline.startTurn') }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="value">T{{ action.turnNumber }}</span>
                        </div>
                    </div>
                    <div class="action-details" v-else-if="action.type === 'endTurn'">
                        <div class="coord-pair">
                            <span class="action-type">{{ $t('gameplay.timeline.endTurnAction') }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="value">T{{ action.turnNumber }}</span>
                        </div>
                    </div>
                    <div class="action-details" v-else>
                        <div class="coord-pair">
                            <span class="value">{{ formatPos(action.from) }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="action-type">{{ getActionTypeLabel(action) }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="value">{{ formatPos(action.to) }}</span>
                        </div>
                    </div>
                    </template>
                </div>

                <div
                    v-if="shouldShowDicePlaceholderAfter(action, index)"
                    class="action-card action-dice action-dice-placeholder"
                    :class="{ readonly: isDiceRolling }"
                    data-test="timeline-dice-placeholder-card"
                    :title="dicePlaceholderTitle"
                    @click="onDicePlaceholderClick"
                    @contextmenu.prevent="onDicePlaceholderInstantRoll"
                >
                    <span class="dice-roll-placeholder__label">{{ dicePlaceholderLabel }}</span>
                    <span v-if="!isDiceRolling" class="dice-roll-placeholder__hint">{{ $t('gameplay.timeline.instantRollHint') }}</span>
                </div>
                </template>

                <div
                    v-if="showOutcomeCard"
                    class="action-card readonly"
                    data-test="timeline-outcome-card"
                    :title="outcomeCardTitle"
                    @click="$emit('show-outcome-dialog')"
                >
                    <div class="action-header">
                        <span class="unit-name">{{ outcomeCardLabel }}</span>
                    </div>
                    <div class="action-details">
                        <div class="coord-pair">
                            <span class="action-type">{{ $t('gameplay.timeline.gameOver') }}</span>
                        </div>
                        <div class="coord-pair">
                            <span class="value">{{ outcomeCardDetail }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="displayedActions.length === 0 && !showOutcomeCard" class="empty-actions">
                    {{ emptyActionsMessage }}
                </div>
            </div>
      </div>
    </div>
    <div v-else class="content-container">
        <div class="placeholder-content">
            <h4 class="placeholder-title">{{ $t('gameplay.timeline.noActiveGame') }}</h4>
            <p class="placeholder-subtitle">{{ $t('gameplay.timeline.turnHistoryAppears') }}</p>
        </div>
    </div>
  </div>
</template>

<script>
import {
  createGameSnapshot,
  validateGameSnapshot
} from '../domain/snapshot/gameSnapshot.js'
import {
  formatOutcomeLabel,
  OUTCOME_STATUS
} from '../domain/objectives/objectives.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

export default {
  name: 'TimelineBlock',
  mixins: [i18nTextMixin],
  emits: ['end-turn', 'revert-game', 'import-history', 'show-outcome-dialog', 'roll-dice', 'instant-roll-dice'],
  props: {
    gameState: {
      type: Object,
      default: null
    },
    isDiceRolling: {
      type: Boolean,
      default: false
    },
    /**
     * Validated `LevelPackage` the current game was started from. When
     * present the snapshot export bundles it (full replay artifact);
     * when absent the export falls back to the legacy history-only
     * shape so the button still works under partial wiring (tests,
     * old localStorage restore paths without a re-validated package).
     */
    levelPackage: {
      type: Object,
      default: null
    },
    /**
     * Original RNG seed string used to create the engine RNG. Surfaced
     * in the snapshot so a receiver can re-display it after import.
     */
    rngSeed: {
      type: String,
      default: null
    }
  },
  data() {
    return {
      viewingTurnIndex: -1, // -1 means current turn
      hasOverflow: false,
      canScrollLeft: false,
      canScrollRight: false,
      showHistoryMenu: false,
      isStepperDragging: false,
      stepperDragCleanup: null,
      revertConfirmIndex: null
    }
  },
  mounted() {
    this.checkScrollArrows()
    this.scrollToEnd()
    window.addEventListener('resize', this.checkScrollArrows)
    document.addEventListener('click', this.handleHistoryMenuOutsideClick)
    this.observeStepper()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.checkScrollArrows)
    document.removeEventListener('click', this.handleHistoryMenuOutsideClick)
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
    }
    this.cleanupStepperDrag()
    this.clearRevertConfirmation()
  },
  updated() {
    // Check arrows when timeline updates
    this.$nextTick(() => {
      this.checkScrollArrows()
    })
  },
  computed: {
    history() {
        return this.gameState ? this.gameState.history : []
    },
    currentTurnActions() {
        return this.gameState ? this.gameState.currentTurnActions : []
    },
    currentTurnNumber() {
        // Always show the latest active turn number, even when browsing past turns.
        return this.history.length + 1
    },
    timelineTurns() {
        // Returns array of turns from history plus potentially the current one for stepper
        return this.history
    },
    gameOutcome() {
        return this.gameState && this.gameState.outcome ? this.gameState.outcome : null
    },
    isGameEnded() {
        return !!(this.gameOutcome && this.gameOutcome.status === OUTCOME_STATUS.ENDED)
    },
    showOutcomeCard() {
        return this.isGameEnded && !this.isViewingPastTurn
    },
    outcomeCardLabel() {
        const outcome = this.gameOutcome
        if (!outcome || outcome.status !== OUTCOME_STATUS.ENDED) return ''
        if (outcome.winner === 'draw') return this.$t('gameplay.timeline.draw')
        return outcome.winner
          ? this.$tf('gameplay.timeline.gameWonBy', `Game won by ${outcome.winner}`, { winner: outcome.winner })
          : this.$t('gameplay.timeline.gameOverLabel')
    },
    outcomeCardDetail() {
        const outcome = this.gameOutcome
        if (!outcome || outcome.status !== OUTCOME_STATUS.ENDED) return ''
        return outcome.message || formatOutcomeLabel(outcome)
    },
    outcomeCardTitle() {
        return this.outcomeCardDetail
            ? `${this.outcomeCardLabel}: ${this.outcomeCardDetail}`
            : this.outcomeCardLabel
    },
    currentViewTurn() {
        if (this.viewingTurnIndex === -1) {
            return this.history.length
        }
        return this.viewingTurnIndex
    },
    isViewingPastTurn() {
        return this.viewingTurnIndex !== -1 && this.viewingTurnIndex < this.history.length
    },
    displayedActions() {
        if (this.isViewingPastTurn) {
            return this.history[this.viewingTurnIndex] || []
        }
        return this.currentTurnActions
    },
    hasCurrentDiceRoll() {
        return this.currentTurnActions.some(action => action && action.type === 'dice_roll')
    },
    shouldShowDicePlaceholder() {
        return !this.isViewingPastTurn && !this.isGameEnded && !this.hasCurrentDiceRoll
    },
    dicePlaceholderLabel() {
        return this.isDiceRolling ? this.$t('gameplay.timeline.rolling') : this.$t('gameplay.timeline.clickToRollDice')
    },
    dicePlaceholderTitle() {
        return this.isDiceRolling ? this.$t('gameplay.timeline.rollingD6') : this.$t('gameplay.timeline.clickToRollD6')
    },
    canEndTurn() {
        return !this.isViewingPastTurn && !this.isGameEnded && !this.isDiceRolling
    },
    turnContextTitle() {
        if (this.isViewingPastTurn) {
          return this.$tf('gameplay.timeline.turnHistoryTitle', `Turn ${this.currentViewTurn + 1} history`, { turn: this.currentViewTurn + 1 })
        }
        return this.$tf('gameplay.timeline.turnTitle', `Turn ${this.currentTurnNumber}`, { turn: this.currentTurnNumber })
    },
    turnContextSubtitle() {
        if (this.isViewingPastTurn) return this.$t('gameplay.timeline.readOnlyHistory')
        return this.$t('gameplay.timeline.currentTurnActions')
    },
    emptyActionsMessage() {
        if (this.isViewingPastTurn) return this.$t('gameplay.timeline.noRecordedActionsForTurn')
        return this.$t('gameplay.timeline.noActionsCurrentTurn')
    }
  },
  watch: {
    gameState(value) {
      if (!value) {
        this.showHistoryMenu = false
        this.viewingTurnIndex = -1
        this.clearRevertConfirmation()
        this.hasOverflow = false
        this.canScrollLeft = false
        this.canScrollRight = false
        this.disconnectStepperObserver()
        return
      }

      this.$nextTick(() => {
        this.observeStepper()
        this.checkScrollArrows()
        this.scrollToEnd()
      })
    },
    // Reset view to current turn when turn changes
    'gameState.turnNumber'() {
        this.viewingTurnIndex = -1
        this.clearRevertConfirmation()
    },
    // Auto-scroll to end when new turns are added
    'timelineTurns.length'() {
        this.clearRevertConfirmation()
        this.$nextTick(() => {
            this.scrollToEnd()
        })
    }
  },
  methods: {

    observeStepper() {
      if (this._resizeObserver || !this.$refs.stepperScroll || typeof ResizeObserver === 'undefined') return
      const resizeObserver = new ResizeObserver(() => {
        this.checkScrollArrows()
      })
      resizeObserver.observe(this.$refs.stepperScroll)
      this._resizeObserver = resizeObserver
    },
    disconnectStepperObserver() {
      if (!this._resizeObserver) return
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    },
    toggleHistoryMenu() {
      this.showHistoryMenu = !this.showHistoryMenu
    },
    onExportClick() {
      this.showHistoryMenu = false
      this.exportSnapshot()
    },
    onImportClick() {
      this.showHistoryMenu = false
      this.triggerImport()
    },
    handleHistoryMenuOutsideClick(event) {
      if (!this.showHistoryMenu) return
      const menuEl = this.$refs.historyMenu
      if (!menuEl) return
      if (menuEl.contains(event.target)) return
      this.showHistoryMenu = false
    },
    formatPos(pos) {
        if (!pos) return '?'
        return `${pos.q},${pos.r}`
    },
    formatDiceResult(result) {
        if (typeof result !== 'number' || !Number.isFinite(result) || result < 1 || result > 6) return '?'
        return result
    },
    getActionLabel(action) {
        if (!action || typeof action !== 'object') return this.$t('gameplay.timeline.actionLabel')
        if (action.type === 'dice_roll') return 'D6'
        if (action.type === 'startTurn') return this.$t('gameplay.timeline.turnStart')
        if (action.type === 'endTurn') return this.$t('gameplay.timeline.turnEnd')
        return action.unitName || action.unitId || this.$t('gameplay.timeline.actionLabel')
    },
    getActionTypeLabel(action) {
        if (!action || typeof action !== 'object') return ''
        const recorded = typeof action.actionType === 'string' ? action.actionType.trim().toLowerCase() : ''
        if (recorded) return recorded
        // Legacy timeline records used technical mutation types. Display the
        // turntable action name so old saves read like newly recorded turns.
        if (action.type === 'rotate') return 'turn'
        if (action.type === 'attack') return 'fire'
        return typeof action.type === 'string' ? action.type.trim().toLowerCase() : ''
    },
    isTurnBoundaryAction(action) {
        return !!(action && (action.type === 'startTurn' || action.type === 'endTurn'))
    },
    normalizePlayer(value) {
        const player = value != null ? String(value).trim() : ''
        if (player === 'player1' || player === 'player2') return player
        return null
    },
    getPlayerSideLabel(value) {
        return this.normalizePlayer(value) === 'player2' ? this.$t('common.enemy') : this.$t('common.player')
    },
    getActionClass(action) {
        const isTurnBoundary = this.isTurnBoundaryAction(action)
        const turnBoundaryPlayer = isTurnBoundary ? this.normalizePlayer(action.player) : null
        return {
            'action-move': action && action.type === 'move',
            'action-rotate': action && action.type === 'rotate',
            'action-turn-boundary': isTurnBoundary,
            'action-turn-boundary--player1': turnBoundaryPlayer === 'player1',
            'action-turn-boundary--player2': turnBoundaryPlayer === 'player2',
            'action-dice': action && action.type === 'dice_roll',
            'action-dice--rolled': action && action.type === 'dice_roll',
            'readonly': this.isViewingPastTurn
        }
    },
    shouldShowDicePlaceholderAfter(action, index) {
        return this.shouldShowDicePlaceholder && index === 0 && action && action.type === 'startTurn'
    },
    onDicePlaceholderClick() {
        if (this.isDiceRolling || !this.shouldShowDicePlaceholder) return
        this.$emit('roll-dice')
    },
    onDicePlaceholderInstantRoll() {
        if (this.isDiceRolling || !this.shouldShowDicePlaceholder) return
        this.$emit('instant-roll-dice')
    },
    viewTurn(index) {
        // If user was dragging the stepper (not clicking), suppress view changes.
        if (this._suppressNextStepperClick) {
            this._suppressNextStepperClick = false
            return
        }
        this.clearRevertConfirmation()
        this.viewingTurnIndex = index
    },
    onStepperPointerDown(e) {
      // Only left mouse button for mouse
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const stepper = this.$refs.stepperScroll
      if (!stepper) return

      this.cleanupStepperDrag()
      this.isStepperDragging = true
      this._suppressNextStepperClick = false
      this._stepperDragMoved = false
      this._stepperPointerId = e.pointerId
      this._stepperDragStartX = e.clientX
      this._stepperDragStartScrollLeft = stepper.scrollLeft

      // Prevent accidental text selection while dragging
      e.preventDefault()

      const onMove = (ev) => {
        if (ev.pointerId !== this._stepperPointerId) return
        const dx = ev.clientX - this._stepperDragStartX
        if (Math.abs(dx) > 3) this._stepperDragMoved = true
        stepper.scrollLeft = this._stepperDragStartScrollLeft - dx
      }

      const onUp = (ev) => {
        if (ev.pointerId !== this._stepperPointerId) return
        this.isStepperDragging = false
        this.cleanupStepperDrag()

        // Update arrows once after drag ends.
        this.$nextTick(() => {
          this.checkScrollArrows()
        })

        if (this._stepperDragMoved) {
          this._suppressNextStepperClick = true
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      this.stepperDragCleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        this.stepperDragCleanup = null
      }
    },
    cleanupStepperDrag() {
      if (typeof this.stepperDragCleanup !== 'function') return
      this.stepperDragCleanup()
      this.isStepperDragging = false
    },
    scrollStepper(direction) {
      const stepper = this.$refs.stepperScroll
      if (!stepper) return
      
      const scrollAmount = 150 // pixels to scroll
      const targetScroll = direction === 'left' 
        ? stepper.scrollLeft - scrollAmount 
        : stepper.scrollLeft + scrollAmount
      
      stepper.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      })
      
      // Update arrows after scroll animation
      setTimeout(() => {
        this.checkScrollArrows()
      }, 300)
    },
    scrollToEnd() {
      const stepper = this.$refs.stepperScroll
      if (!stepper) return
      
      stepper.scrollTo({
        left: stepper.scrollWidth,
        behavior: 'smooth'
      })
      
      // Update arrows after scroll animation
      setTimeout(() => {
        this.checkScrollArrows()
      }, 300)
    },
    checkScrollArrows() {
      const stepper = this.$refs.stepperScroll
      if (!stepper) return
      // While dragging we update scrollLeft continuously; avoid reactive updates on each scroll tick.
      if (this.isStepperDragging) return
      
      const { scrollLeft, scrollWidth, clientWidth } = stepper
      
      const maxScrollLeft = scrollWidth - clientWidth
      const tolerance = 1 // tolerate sub-pixel rounding/padding/border differences

      // Check if there's overflow content
      this.hasOverflow = maxScrollLeft > tolerance
      
      // Check if we can scroll left
      this.canScrollLeft = scrollLeft > tolerance
      
      // Check if we can scroll right
      this.canScrollRight = scrollLeft < (maxScrollLeft - tolerance)
    },
    actionCardTitle(index) {
        if (this.isViewingPastTurn) return this.$t('gameplay.timeline.completedTurnReadOnly')
        const action = this.displayedActions[index]
        if (action && action.type === 'startTurn') return this.$t('gameplay.timeline.startOfTurnCannotUndo')
        if (this.isActionRevertPending(index)) return this.$t('gameplay.timeline.clickAgainToRevert')
        return this.$t('gameplay.timeline.clickToUndoAction')
    },
    canRevertAction(index) {
        if (this.isViewingPastTurn) return false
        const action = this.displayedActions[index]
        if (!action || action.type === 'startTurn') return false
        return true
    },
    isActionRevertPending(index) {
        return this.revertConfirmIndex === index
    },
    isActionAfterPendingRevert(index) {
        return this.revertConfirmIndex != null && index > this.revertConfirmIndex
    },
    clearRevertConfirmation() {
        if (this._revertConfirmTimer) {
            clearTimeout(this._revertConfirmTimer)
            this._revertConfirmTimer = null
        }
        this.revertConfirmIndex = null
    },
    startRevertConfirmation(index) {
        this.clearRevertConfirmation()
        this.revertConfirmIndex = index
        this._revertConfirmTimer = setTimeout(() => {
            if (this.revertConfirmIndex === index) {
                this.revertConfirmIndex = null
            }
            this._revertConfirmTimer = null
        }, 3000)
    },
    // Click semantics (Batch 1 Task 1.3, Option A): undo the clicked action and every
    // action recorded after it within the same turn. Past turns are intentionally
    // read-only in the UI until full past-turn rollback is covered by dedicated tests.
    handleActionClick(index) {
        if (!this.canRevertAction(index)) return
        if (this.isActionRevertPending(index)) {
            this.clearRevertConfirmation()
            this.$emit('revert-game', { turnIndex: this.history.length, actionIndex: index })
            return
        }
        this.startRevertConfirmation(index)
    },
    handleActionContextMenu() {
        // Recorded cards require explicit rollback before a new dice roll.
    },
    endTurn() {
        if (this.isViewingPastTurn) return
        if (this.isGameEnded) return
        if (this.isDiceRolling) return
        this.$emit('end-turn')
    },
    exportSnapshot() {
        if (!this.gameState) return
        let json = null
        let filename = null
        let snapshotFailure = null

        if (this.levelPackage && typeof this.levelPackage === 'object') {
          // Full snapshot: includes level package, RNG seed, engine state.
          // We re-validate the artifact we just built so that a legacy /
          // rng-less GameState (e.g. restored from a pre-Batch-1 save)
          // does not silently produce a snapshot that the v1 import
          // validator would later reject. Failures fall through to the
          // legacy history-only export so the user still gets a file.
          const snapshot = createGameSnapshot({
            levelPackage: this.levelPackage,
            gameState: this.gameState,
            rngSeed: this.rngSeed
          })
          const validation = validateGameSnapshot(snapshot)
          if (validation.ok) {
            // Serialize the normalized snapshot (validation.snapshot), not
            // the raw input. The normalized snapshot has its embedded
            // levelPackage migrated to canonical field names + current
            // schemaVersion, so the exported file is a clean v1 envelope
            // even when the source levelPackage came from legacy data.
            json = JSON.stringify(validation.snapshot, null, 2)
            filename = `hexwar-snapshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
          } else {
            snapshotFailure = validation.errors
          }
        }

        if (json == null) {
          // Legacy fallback: either no levelPackage prop (pre-snapshot
          // wiring, test stubs) or the snapshot we just built failed
          // its own v1 validator. Either way, ship the legacy
          // history-only payload so the menu still produces a file —
          // import will route it back through GameState.loadHistoryJSON.
          if (snapshotFailure) {
            console.warn(
              'TimelineBlock: snapshot export failed v1 validation; falling back to legacy history export.',
              snapshotFailure
            )
            if (typeof window !== 'undefined' && window.$notify) {
              window.$notify.warning(
                this.uiText('gameplay.timeline.notifications.snapshotExportDowngraded', 'Snapshot export downgraded'),
                this.uiText('gameplay.timeline.notifications.snapshotExportDowngradedBody', 'This game cannot be exported as a v1 snapshot (likely a legacy save without RNG state). Exported history-only instead.')
              )
            }
          }
          json = this.gameState.getHistoryJSON()
          filename = `hexwar-history-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
        }

        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    },
    triggerImport() {
        this.$refs.fileInput.click()
    },
    handleImport(event) {
        const file = event.target.files[0]
        if (!file) return
        
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const json = e.target.result
                this.$emit('import-history', json)
            } catch (err) {
                console.error("Import failed", err)
                const message = this.uiText('gameplay.timeline.notifications.importHistoryFailed', 'Failed to import history file')
                if (typeof alert === 'function') alert(message)
            }
        }
        reader.readAsText(file)
        // Reset input
        event.target.value = ''
    }
  }
}
</script>

<style scoped lang="scss">
@use '../styles/components.scss' as *;

.timeline-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0; // allow children with overflow to calculate height correctly
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    overflow-x: hidden;
}

// These buttons are used both inside `.header-controls` and inside the stepper header.
// Keep them top-level so styles apply regardless of where the button is placed.
.control-btn {
    padding: 4px 8px;
    font-size: 0.8rem;
    background: #eee;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    
    &:hover {
        background: #e0e0e0;
    }
}

.end-turn-btn {
    min-width: fit-content;

    background-color: #FF5722;
    color: white;
    border: none;
    padding: 0 6px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    margin-left: 6px;
    
    &:hover {
        background-color: #d44215;
    }
    
    &.disabled {
        background-color: #ccc;
        cursor: not-allowed;
        opacity: 0.7;
        
        &:hover {
            background-color: #ccc;
        }
    }
}

.header-controls {
    
    min-width: fit-content;
    display: flex;
    gap: 8px;
}

.history-menu {
    position: relative;
    display: flex;
    align-items: center;
}

.history-menu-trigger {
    padding: 4px 8px;
}

.history-menu-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    z-index: 20;
    min-width: 200px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}

.history-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
}

.history-menu-item-text {
    text-align: left;
}

.history-menu-item-icon {
    text-align: right;
}

@keyframes revert-confirm-countdown {
    to {
        stroke-dashoffset: 50.27;
    }
}

.turn-stepper-container {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    width: 100%;
    flex: 1 1 auto;
    min-width: 0; // important for flex children inside flex parents
}

.stepper-arrow {
    flex: 0 0 auto; // keep arrows from shrinking/compressing the scroller layout
    width: 34px;
    height: 34px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.2s;
    z-index: 2;

    
    padding: 4px;
    background: #f0f0f0;
    color: #333333;

    &-right {
        border-top: 1px solid #ccc;
        border-bottom: 1px solid #ccc;
        border-left: none;
        border-right: none;
        border: 1px solid #ccc;
        border-radius: 0 4px 4px 0; 
    }
    &-left {        
        border-top: 1px solid #ccc;
        border-bottom: 1px solid #ccc;
        border-left: none;
        border-right: none;
        border: 1px solid #ccc;
        border-radius: 4px 0 0 4px; 
    }
    
    &:hover:not(.inactive) {
        background: #e0e0e0;
        color: #4CAF50;
    }
    
    &.inactive {
        background: #ccc;
        color: #999;
        cursor: not-allowed;
        opacity: 0.6;
    }
}

.turn-title {
    min-width: fit-content;
}

.turn-stepper {
    width: fit-content;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-x: auto;
    padding: 0;
    flex: 0 1 auto; // don't stretch; grow only until max-width is hit
    min-width: 0;
    max-width: 100%;
    flex-wrap: nowrap;
    scroll-behavior: smooth;

    padding: 4px 4px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: #f0f0f0;
    user-select: none;
    touch-action: pan-y;
    cursor: grab;

    
    
    &::-webkit-scrollbar {
        display: none;
    }
    
    -ms-overflow-style: none;
    scrollbar-width: none;
    
    .stepper-step {
        display: flex;
        align-items: center;
        cursor: default;
        flex: 0 0 auto; // don't allow the step items to shrink; overflow detection should be stable
        opacity: 0.6;
        
        &.active {
            opacity: 1;
            
            .step-circle {
                background-color: #4CAF50;
                color: white;
                border-color: #45a049;
            }
        }
        
        &.completed {
            opacity: 0.8;
            
             .step-circle {
                background-color: #4CAF50;
                color: white;
                border-color: #388E3C;
            }
        }
        
        .step-circle {
            width: 24px;
            height: 24px;
            border-radius: 16%;
            border: 1px solid #999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            background: white;
            transition: all 0.2s;
            cursor: pointer;
            
            &:hover {
                opacity: 0.8;
            }
        }

        .step-line {
            width: 6px;
            height: 2px;
            background-color: #ccc;
            margin: 0 5px;
            pointer-events: none; // allow clicks only on the circle
        }
    }
}

.turn-stepper__with-arrows {
    border-radius: 0;
    border-left: none;
    border-right: none;
    // When we have overflow, keep scroll geometry consistent:
    // scrollLeft=0 should correspond to the first step being at the left.
    justify-content: flex-start;
    padding-left: 12px;
    padding-right: 12px;
}

.turn-stepper__dragging {
    cursor: grabbing;
    scroll-behavior: auto;
}

.actions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    font-size: 0.8rem;
    color: #555;
}

.turn-context-title {
    min-width: 0;
    font-weight: 700;
    color: #4c5661;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.actions-count {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid #e0e4e8;
    border-radius: 999px;
    background: #fff;
    color: #687383;
    font-size: 0.68rem;
    font-weight: 700;
}

.actions-scroll-area {
    flex: 0 0 auto;
    overflow: visible;
    min-height: 0;
}

.actions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-content: flex-start;
    padding: 0;
}

.action-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 8px;
    width: 140px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s, opacity 0.12s ease, filter 0.12s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    
    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px rgba(0,0,0,0.15);
        border-color: #4CAF50;
    }

    &.action-card--revert-confirm.action-card--revert-confirm {
        min-height: 66px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-color: #f97316;
        background: #fff7ed;
        color: #9a3412;
        text-align: center;

        &:hover {
            border-color: #ea580c;
            box-shadow: 0 4px 8px rgba(234, 88, 12, 0.18);
        }
    }

    &.action-card--will-revert {
        opacity: 0.46;
        filter: saturate(0.72);
    }

    .revert-confirm {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 0;
    }

    .revert-confirm__timer {
        width: 24px;
        height: 24px;
        transform: rotate(-90deg);
        flex: 0 0 auto;
    }

    .revert-confirm__timer-track,
    .revert-confirm__timer-bar {
        fill: none;
        stroke-width: 3;
    }

    .revert-confirm__timer-track {
        stroke: rgba(154, 52, 18, 0.18);
    }

    .revert-confirm__timer-bar {
        stroke: #ea580c;
        stroke-linecap: round;
        stroke-dasharray: 50.27;
        stroke-dashoffset: 0;
        animation: revert-confirm-countdown 3s linear forwards;
    }

    .revert-confirm__label {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.15;
    }

    &.action-turn-boundary {
        --turn-accent: #607d8b;
        --turn-bg: #f7f9fb;
        --turn-border: #cfd8dc;

        background: var(--turn-bg);
        border-color: var(--turn-border);
        border-left: 4px solid var(--turn-accent);

        .action-header {
            border-bottom-color: var(--turn-border);

            .unit-name,
            .turn-side-label {
                color: var(--turn-accent);
            }
        }

        &.action-turn-boundary--player1 {
            --turn-accent: #5f8fc2;
            --turn-bg: #f3f8fe;
            --turn-border: #b8d3ee;
        }

        &.action-turn-boundary--player2 {
            --turn-accent: #b96a6a;
            --turn-bg: #fff6f6;
            --turn-border: #efc2c2;
        }
    }
    
    &.action-dice {
        --dice-accent: #607d8b;
        --dice-bg: #f7f9fb;
        --dice-border: #cfd8dc;

        background: var(--dice-bg);
        border-color: var(--dice-border);
        border-left: 4px solid var(--dice-accent);

        .action-header {
            border-bottom-color: var(--dice-border);

            .unit-name {
                color: var(--dice-accent);
            }
        }

        &.action-dice--pending {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
        }

        &.action-dice-placeholder {
            --dice-accent: #5f666d;
            --dice-bg: #f1f2f4;
            --dice-border: rgba(95, 102, 109, 0.38);

            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            min-height: 44px;
            border: 1px solid var(--dice-border);
            background: var(--dice-bg);
            box-shadow: none;
            color: var(--dice-accent);
            text-align: center;

            &:hover {
                transform: none;
                border-color: rgba(95, 102, 109, 0.52);
                background: #eceef1;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            .dice-roll-placeholder__label {
                width: 100%;
                font-weight: 700;
                line-height: 1.2;
            }

            .dice-roll-placeholder__hint {
                width: 100%;
                color: rgba(95, 102, 109, 0.62);
                font-size: 0.68rem;
                font-weight: 500;
                line-height: 1.1;
            }
        }
    }
    
    &.readonly {
        cursor: default;
        &:hover {
            transform: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
    }
    
    .action-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
        border-bottom: 1px solid #eee;
        padding-bottom: 4px;
        
        .unit-name {
            font-weight: bold;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .turn-side-label {
            flex: 0 0 auto;
            margin-left: 6px;
            color: #687383;
            font-size: 0.7rem;
            font-weight: 700;
            line-height: 1.2;
        }
        
        .action-type {
            color: #777;
            font-size: 0.7rem;
            text-transform: uppercase;
        }
    }
    
    .action-details {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        gap: 2px;
        
        .coord-pair {
            display: flex;
            color: #555;
            
            .label {
                color: #999;
                font-size: 0.7rem;
            }
        }
        
        .arrow {
            text-align: center;
            font-size: 0.7rem;
            color: #ccc;
            line-height: 0.8;
        }
    }
}

.empty-actions {
    width: 100%;
    text-align: center;
    color: #999;
    padding: 20px 0;
    font-style: italic;
}

.placeholder-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.35;
    color: #333;
}

.placeholder-subtitle {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: #555;
}
</style>
