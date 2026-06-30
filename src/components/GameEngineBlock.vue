<template>
  <div class="grid-item grid-item--moves-list">
    <div class="block-header-with-status">
      <h3>{{ $t('gameplay.engine.title') }}</h3>
    </div>
    
    <div class="content-container-flex">
      <TabContainer
        class="engine-tab-container"
        :tabs="tabs"
        :initial-tab="activeTab"
        @tab-change="setActiveTab"
      >
        <template #default="{ activeTab: renderedTab }">
          <div class="engine-scroll">
        <div v-show="renderedTab === 'setup'" data-test="engine-setup-tab" class="engine-tabpanel">
        <!-- Level setup -->
        <section class="engine-section" :class="{ 'is-collapsed': collapsedSections.level }">
          <button
            class="engine-section__header"
            type="button"
            :aria-expanded="String(!collapsedSections.level)"
            aria-controls="engine-section-level"
            @click="toggleSection('level')"
          >
            <span class="engine-section__title">{{ $t('gameplay.engine.levelSetup') }}</span>
            <PhCaretDown
              v-if="collapsedSections.level"
              class="engine-section__chevron"
              :size="13"
              weight="bold"
              aria-hidden="true"
            />
            <PhCaretUp
              v-else
              class="engine-section__chevron"
              :size="13"
              weight="bold"
              aria-hidden="true"
            />
          </button>

          <div v-show="!collapsedSections.level" id="engine-section-level" class="engine-section__body">
            <div class="engine-controls">
              <div class="engine-controls__level-row">
                <label class="engine-controls__field" for="level-id">
                  <span class="engine-controls__label">{{ $t('gameplay.engine.level') }}</span>
                  <select
                    id="level-id"
                    data-test="engine-level-select"
                    class="engine-controls__input engine-controls__select"
                    :value="selectedLevelId"
                    :disabled="isSetupBusy"
                    @change="onLevelSelected"
                  >
                    <option
                      v-for="level in normalizedLevelOptions"
                      :key="level.id"
                      :value="level.id"
                    >
                      {{ level.label }}
                    </option>
                  </select>
                </label>
                <button
                  data-test="engine-upload-button"
                  class="engine-icon-button"
                  type="button"
                  :disabled="isSetupBusy"
                  :title="$t('gameplay.engine.browseLevelZip')"
                  :aria-label="$t('gameplay.engine.browseLevelZip')"
                  @click="onUploadClick"
                >
                  <PhUploadSimple :size="17" weight="bold" aria-hidden="true" />
                  <span>{{ $t('gameplay.engine.browseLevelZip') }}</span>
                </button>
                <input
                  ref="archiveInput"
                  data-test="engine-archive-input"
                  class="engine-controls__file-input"
                  type="file"
                  accept=".zip"
                  @change="onArchiveChange"
                />
              </div>

              <div
                v-if="builderExportLevelId || canDeleteSelectedLevel"
                class="engine-controls__builder-actions"
              >
                <button
                  v-if="builderExportLevelId"
                  data-test="engine-builder-export-button"
                  class="engine-icon-button engine-icon-button--full"
                  type="button"
                  :disabled="isSetupLoadingBusy"
                  :title="$tf('gameplay.engine.exportLevel', `Export ${builderExportLevelId}`, { id: builderExportLevelId })"
                  :aria-label="$tf('gameplay.engine.exportLevel', `Export ${builderExportLevelId}`, { id: builderExportLevelId })"
                  @click="$emit('export-loaded-builder-level')"
                >
                  <PhDownloadSimple :size="17" weight="bold" aria-hidden="true" />
                  <span>{{ $tf('gameplay.engine.exportLevel', `Export ${builderExportLevelId}`, { id: builderExportLevelId }) }}</span>
                </button>
                <button
                  v-if="canDeleteSelectedLevel"
                  data-test="engine-delete-level-button"
                  class="engine-icon-button engine-icon-button--full engine-icon-button--danger"
                  type="button"
                  :disabled="isSetupBusy"
                  :title="$t('gameplay.engine.removeSelectedLevel')"
                  :aria-label="$t('gameplay.engine.removeSelectedLevel')"
                  @click="$emit('delete-selected-level')"
                >
                  <PhTrash :size="17" weight="bold" aria-hidden="true" />
                  <span>{{ $t('gameplay.engine.removeSelectedLevel') }}</span>
                </button>
              </div>

              <div class="engine-doctrine-setup" data-test="engine-doctrine-setup">
                <DoctrineProfilePicker
                  :players="autoPlayPlayers"
                  :disabled="isSetupBusy"
                  @update:player="onDoctrineProfileChange"
                />
                <p class="engine-doctrine-setup__hint">
                  {{ $t('gameplay.doctrine.setupHint') }}
                </p>
              </div>

              <label class="engine-controls__field" for="rng-seed">
                <span class="engine-controls__label">{{ $t('gameplay.engine.seed') }}</span>
                <input
                  id="rng-seed"
                  data-test="engine-seed-input"
                  :value="seed"
                  type="text"
                  class="engine-controls__input"
                  placeholder="level_000-seed-1"
                  :disabled="isSetupBusy"
                  @input="onSeedInput"
                />
              </label>

              <div class="engine-level-summary" :class="{ 'is-empty': !loadedPackage }">
                <template v-if="loadedPackage">
                  <strong>{{ loadedSummary.id }}</strong>
                  <span>{{ loadedSummary.dimensions }}</span>
                  <span>{{ loadedSummary.hexCount }}</span>
                  <span>{{ loadedSummary.source }}</span>
                  <span>{{ loadedSummary.warnings }}</span>
                </template>
                <template v-else>
                  {{ $t('gameplay.engine.noLevelLoaded') }}
                </template>
              </div>

              <div class="engine-controls__load-row">
                <button
                  data-test="engine-load-button"
                  class="btn-primary"
                  :disabled="isLoadSelectedDisabled"
                  @click="$emit('load-selected-level')"
                >
                  <PhCheck v-if="isSelectedLevelLoaded" :size="16" weight="bold" aria-hidden="true" />
                  {{ isSelectedLevelLoaded ? $t('gameplay.engine.loaded') : $t('gameplay.engine.loadSelected') }}
                </button>
              </div>

              <button
                v-if="!gameState"
                data-test="engine-start-button"
                class="btn-primary engine-start-button"
                :disabled="isStartDisabled"
                @click="$emit('start-game')"
              >
                <PhPlay :size="17" weight="bold" aria-hidden="true" />
                {{ $t('gameplay.engine.startGame') }}
              </button>
              <button
                v-else
                data-test="engine-reset-button"
                class="engine-reset-button"
                type="button"
                :disabled="isRestoring || isStartingGame || isInitializingGlobal"
                @click="resetGame"
              >
                <PhSelectionSlash :size="16" weight="bold" aria-hidden="true" />
                {{ $t('gameplay.engine.resetLevel') }}
              </button>
              <template v-if="gameState">
                <div class="engine-setup-divider" role="separator" aria-hidden="true"></div>
                <button
                  data-test="engine-restart-game-button"
                  class="engine-restart-button"
                  type="button"
                  :disabled="isRestartGameDisabled"
                  @click="$emit('restart-game')"
                >
                  <PhArrowsCounterClockwise :size="16" weight="bold" aria-hidden="true" />
                  {{ $t('gameplay.engine.restartGame') }}
                </button>
              </template>
            </div>
          </div>
        </section>

        </div>

        <div v-show="renderedTab === 'turn'" data-test="engine-turn-tab" class="engine-tabpanel engine-turn">
          <template v-if="gameState">
            <div class="turn-step-panel">
              <div class="turn-step-summary" data-test="engine-turn-status">
                <div class="turn-step-metrics">
                  <div class="turn-step-metric">
                    <span class="turn-step-metric__label">{{ $t('gameplay.engine.currentPlayer') }}</span>
                    <span class="turn-step-metric__value">{{ gameState.currentPlayer }}</span>
                  </div>
                  <div class="turn-step-metric">
                    <span class="turn-step-metric__label">{{ $t('gameplay.engine.turn') }}</span>
                    <span class="turn-step-metric__value">{{ $tf('gameplay.engine.turnNumber', `Turn ${gameState.turnNumber}`, { turn: gameState.turnNumber }) }}</span>
                  </div>
                </div>
              </div>

              <section
                class="engine-section engine-autoplay"
                :class="{ 'is-collapsed': collapsedSections.autoPlay }"
                data-test="engine-autoplay-section"
              >
                <button
                  class="engine-section__header"
                  type="button"
                  :aria-expanded="String(!collapsedSections.autoPlay)"
                  aria-controls="engine-section-autoplay"
                  @click="toggleSection('autoPlay')"
                >
                  <span class="engine-section__title">{{ $t('gameplay.autoPlay.title') }}</span>
                  <PhCaretUp
                    v-if="!collapsedSections.autoPlay"
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                  <PhCaretDown
                    v-else
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                </button>
                <div
                  v-show="!collapsedSections.autoPlay"
                  id="engine-section-autoplay"
                  class="engine-section__body engine-autoplay__body"
                >
                  <div class="engine-autoplay__switches">
                    <label class="switch-label engine-autoplay__switch">
                      <input
                        type="checkbox"
                        class="switch-input"
                        data-test="engine-autoplay-player1"
                        :checked="autoPlayEnabled.player1"
                        :disabled="actionsDisabled"
                        @change="onAutoPlayToggle('player1', $event.target.checked)"
                      />
                      <span class="switch-slider"></span>
                      <span class="engine-autoplay__switch-text">
                        <span class="engine-autoplay__side engine-autoplay__side--player">{{ $t('common.player') }}</span>
                        {{ $t('gameplay.autoPlay.playAutomatically') }}
                      </span>
                    </label>
                    <label class="switch-label engine-autoplay__switch">
                      <input
                        type="checkbox"
                        class="switch-input"
                        data-test="engine-autoplay-player2"
                        :checked="autoPlayEnabled.player2"
                        :disabled="actionsDisabled"
                        @change="onAutoPlayToggle('player2', $event.target.checked)"
                      />
                      <span class="switch-slider"></span>
                      <span class="engine-autoplay__switch-text">
                        <span class="engine-autoplay__side engine-autoplay__side--enemy">{{ $t('common.enemy') }}</span>
                        {{ $t('gameplay.autoPlay.playAutomatically') }}
                      </span>
                    </label>
                  </div>

                  <p class="engine-autoplay__hint" data-test="engine-autoplay-hint">
                    {{ autoPlayHintText }}
                  </p>

                  <div class="engine-autoplay__divider" role="separator" aria-hidden="true"></div>

                  <button
                    type="button"
                    class="engine-autoplay__finish-button"
                    data-test="engine-autoplay-finish"
                    :disabled="isAutoPlayFinishDisabled"
                    @click="$emit('auto-play-current-turn')"
                  >
                    <span class="engine-autoplay__finish-label">
                      {{ $t('gameplay.autoPlay.finishTurnPrefix') }}
                      <span class="engine-autoplay__side" :class="activeSideClass">{{ activeSideLabel }}</span>
                    </span>
                  </button>
                  <p class="engine-autoplay__finish-caption">
                    {{ $t('gameplay.autoPlay.finishTurnCaptionPrefix') }}
                    <span class="engine-autoplay__side" :class="activeSideClass">{{ activeSideLabel }}</span>{{ $t('gameplay.autoPlay.finishTurnCaptionSuffix') }}
                  </p>
                </div>
              </section>

              <div class="turn-phase-accordion" data-test="engine-phase-accordion">
              <section class="engine-section" :class="{ 'is-collapsed': collapsedSections.diceRoll }">
                <button
                  class="engine-section__header"
                  type="button"
                  :aria-expanded="String(!collapsedSections.diceRoll)"
                  aria-controls="engine-section-dice-roll"
                  @click="toggleSection('diceRoll')"
                >
                  <span class="engine-section__heading">
                    <span class="engine-section__title">{{ $t('gameplay.engine.phaseDiceRoll') }}</span>
                    <span class="engine-section__subtitle" :class="phaseStatusClass('diceRoll')">
                      {{ phaseStatusText('diceRoll') }}
                    </span>
                  </span>
                  <PhCaretUp
                    v-if="!collapsedSections.diceRoll"
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                  <PhCaretDown
                    v-else
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                </button>
                <div
                  v-show="!collapsedSections.diceRoll"
                  id="engine-section-dice-roll"
                  class="engine-section__body"
                >
                  <div class="turn-step-main">
                    <div class="turn-step-dice">
                      <div class="turn-step-label">{{ $t('gameplay.engine.d6Roll') }}</div>
                      <button
                        data-test="engine-roll-d6-button"
                        type="button"
                        class="dice-roll-trigger dice-roll-trigger--turn"
                        :data-current-player="currentPlayerKey"
                        :data-roll-state="diceRollState"
                        :disabled="isDiceButtonDisabled"
                        :aria-busy="isRolling"
                        :title="diceButtonTitle"
                        @click="onDiceClick"
                        @contextmenu.prevent="onDiceRightClick"
                      >
                        <span class="dice-roll-visual">
                          <img
                            v-if="diceShowPlaceholder"
                            class="dice-placeholder-img"
                            :src="dice0Svg"
                            alt=""
                            width="96"
                            height="96"
                          />
                          <Vue3Lottie
                            v-else
                            :key="diceKey"
                            ref="diceLottieRef"
                            :animation-data="diceAnimations[lottieDiceIndex]"
                            :height="96"
                            :width="96"
                            :loop="false"
                            :auto-play="false"
                            @on-animation-loaded="onDiceLoaded"
                            @on-complete="onDiceComplete"
                          />
                        </span>
                        <span
                          v-if="turnDiceResult !== null"
                          data-test="engine-d6-result"
                          class="dice-roll-action-label"
                        >
                          {{ $tf('gameplay.engine.d6Result', `D6 = ${turnDiceResult}`, { result: turnDiceResult }) }}
                        </span>
                        <span v-else-if="isRolling" class="dice-roll-action-label">{{ $t('gameplay.engine.rolling') }}</span>
                        <span v-else data-test="engine-d6-empty" class="dice-roll-action-label">{{ $t('gameplay.engine.rollD6') }}</span>
                      </button>
                      <div class="dice-roll-caption">{{ $t('gameplay.engine.instantRollCaption') }}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="engine-section" :class="{ 'is-collapsed': collapsedSections.movement }">
                <button
                  class="engine-section__header"
                  type="button"
                  :aria-expanded="String(!collapsedSections.movement)"
                  aria-controls="engine-section-movement"
                  @click="toggleSection('movement')"
                >
                  <span class="engine-section__heading">
                    <span class="engine-section__title">{{ $t('gameplay.engine.phaseMovementAttack') }}</span>
                    <span class="engine-section__subtitle" :class="phaseStatusClass('movement')">
                      {{ phaseStatusText('movement') }}
                    </span>
                  </span>
                  <PhCaretUp
                    v-if="!collapsedSections.movement"
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                  <PhCaretDown
                    v-else
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                </button>
                <div
                  v-show="!collapsedSections.movement"
                  id="engine-section-movement"
                  class="engine-section__body"
                >
                  <div
                    class="engine-unit-grid"
                    :class="{ 'is-empty': activePlayerUnitPreviews.length === 0 }"
                    data-test="engine-active-unit-grid"
                  >
                    <UnitPreviewCard
                      v-for="preview in activePlayerUnitPreviews"
                      :key="preview.id"
                      :preview="preview"
                      :hex-points="unitCardHexPoints"
                      @hover="onUnitPreviewHover"
                      @select="onUnitPreviewSelect($event.unitId, $event.event)"
                      @deselect="onUnitPreviewDeselect($event.event)"
                    />
                    <div v-if="activePlayerUnitPreviews.length === 0" class="engine-muted">
                      {{ $t('gameplay.engine.noActiveUnits') }}
                    </div>
                  </div>

                  <div
                    class="engine-action-subsection engine-action-subsection--available"
                    data-test="engine-available-actions"
                  >
                    <h6 class="engine-action-subsection__title">{{ $t('gameplay.engine.availableActions') }}</h6>
                    <div
                      v-if="turnDiceResult === null"
                      class="attack-target-highlight attack-target-highlight--empty"
                    >
                      {{ $t('gameplay.engine.rollDiceForActions') }}
                    </div>
                    <div
                      v-else-if="availableActionOperations.length === 0"
                      class="attack-target-highlight attack-target-highlight--empty"
                    >
                      {{ $t('gameplay.engine.noAvailableActionsData') }}
                    </div>
                    <div v-else class="engine-available-actions-table-wrap">
                      <AvailableActionsTable
                        :operations="availableActionOperations"
                        :dice-index="availableDiceIndex"
                        :dice-label="availableDiceLabel"
                        :current-player="currentPlayerKey"
                        :show-priority="availableActionsShowPriority"
                        :aria-label="$tf('gameplay.engine.availableActionsAria', `Available actions for ${availableDiceLabel}`, { dice: availableDiceLabel })"
                        :empty-action-label="$t('gameplay.movesTable.noActionAvailable')"
                      />
                    </div>
                  </div>

                  <div class="engine-action-content" :class="{ 'is-inactive': !hasSelectedUnitForActions }">
                    <div class="engine-action-subsection">
                      <h6 class="engine-action-subsection__title">{{ $t('gameplay.inspector.manoeuvre') }}</h6>
                      <div class="engine-action-buttons">
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="movementControlsDisabled || !bridgeCanMoveForward"
                          @click="$emit('move-unit-forward')"
                        >
                          <span aria-hidden="true">&uarr;</span>
                          {{ $t('gameplay.inspector.moveForward') }}
                        </button>
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="movementControlsDisabled || !bridgeCanMoveReverse"
                          @click="$emit('move-unit-reverse')"
                        >
                          <span aria-hidden="true">&darr;</span>
                          {{ $t('gameplay.inspector.reverse') }}
                        </button>
                      </div>
                      <div class="engine-action-buttons">
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="movementControlsDisabled || !bridgeCanRotate"
                          @click="$emit('rotate-unit-counterclockwise')"
                        >
                          {{ $t('gameplay.inspector.ccw') }}
                        </button>
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="movementControlsDisabled || !bridgeCanRotate"
                          @click="$emit('rotate-unit-clockwise')"
                        >
                          {{ $t('gameplay.inspector.cw') }}
                        </button>
                      </div>
                    </div>

                    <div class="engine-action-subsection">
                      <h6 class="engine-action-subsection__title">{{ $t('gameplay.inspector.attack') }}</h6>
                      <div
                        v-if="hasSelectedUnitForActions && bridgeValidAttackTargets.length && currentAttackTarget"
                        class="attack-target-highlight"
                      >
                        {{ targetStatusLabel }}
                      </div>
                      <div
                        v-else-if="hasSelectedUnitForActions && bridgeValidAttackTargets.length"
                        class="attack-target-highlight attack-target-highlight--empty"
                      >
                        {{ $t('gameplay.inspector.fireTargetsInconsistent') }}
                      </div>
                      <div v-else class="attack-target-highlight attack-target-highlight--empty">
                        {{ hasSelectedUnitForActions ? $t('gameplay.inspector.noValidFireTargets') : $t('gameplay.inspector.noUnitSelected') }}
                      </div>

                      <div class="engine-action-buttons engine-action-buttons--attack">
                        <button
                          type="button"
                          class="action-btn action-btn--danger"
                          :disabled="attackControlsDisabled || !bridgeCanFire"
                          @click="$emit('fire')"
                        >
                          {{ $t('gameplay.inspector.fire') }}
                        </button>
                        <button
                          type="button"
                          class="action-btn"
                          :disabled="attackControlsDisabled || !bridgeCanReload"
                          @click="$emit('reload')"
                        >
                          {{ $t('gameplay.inspector.reload') }}
                        </button>
                      </div>
                      <div class="engine-attack-switch">
                        <span class="engine-attack-switch__label">{{ $t('gameplay.inspector.switchTarget') }}</span>
                        <div class="engine-attack-switch__buttons">
                          <button
                            type="button"
                            class="action-btn action-btn--compact"
                            :disabled="attackControlsDisabled || bridgeValidAttackTargets.length === 0"
                            :title="$t('gameplay.inspector.previousTarget')"
                            @click="$emit('attack-target-shift', -1)"
                          >
                            &larr;
                          </button>
                          <button
                            type="button"
                            class="action-btn action-btn--compact"
                            :disabled="attackControlsDisabled || bridgeValidAttackTargets.length === 0"
                            :title="$t('gameplay.inspector.nextTarget')"
                            @click="$emit('attack-target-shift', 1)"
                          >
                            &rarr;
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="engine-action-subsection engine-action-subsection--keyboard">
                      <h6 class="engine-action-subsection__title">{{ $t('gameplay.inspector.keyboardControls') }}</h6>
                      <p class="engine-keyboard-caption">{{ $t('gameplay.inspector.manoeuvre') }}</p>
                      <div class="keyboard-hint">
                        <span class="key">&uarr;</span> {{ $t('gameplay.inspector.moveForward') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">&darr;</span> {{ $t('gameplay.inspector.reverse') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">&larr;</span> {{ $t('gameplay.inspector.turnCcw') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">&rarr;</span> {{ $t('gameplay.inspector.turnCw') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">Tab</span> {{ $t('gameplay.inspector.nextUnit') }}
                      </div>
                      <p class="engine-keyboard-caption">{{ $t('gameplay.inspector.attack') }}</p>
                      <div class="keyboard-hint">
                        <span class="key">Space</span> {{ $t('gameplay.inspector.fire') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">R</span> {{ $t('gameplay.inspector.reload') }}
                      </div>
                      <div class="keyboard-hint">
                        <span class="key">Ctrl</span> + <span class="key">&larr;</span> / <span class="key">&rarr;</span> {{ $t('gameplay.inspector.switchTarget') }}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="engine-section" :class="{ 'is-collapsed': collapsedSections.endStep }">
                <button
                  class="engine-section__header"
                  type="button"
                  :aria-expanded="String(!collapsedSections.endStep)"
                  aria-controls="engine-section-end-step"
                  @click="toggleSection('endStep')"
                >
                  <span class="engine-section__heading">
                    <span class="engine-section__title">{{ $t('gameplay.engine.endOfStep') }}</span>
                    <span class="engine-section__subtitle" :class="phaseStatusClass('endStep')">
                      {{ phaseStatusText('endStep') }}
                    </span>
                  </span>
                  <PhCaretUp
                    v-if="!collapsedSections.endStep"
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                  <PhCaretDown
                    v-else
                    class="engine-section__chevron"
                    :size="13"
                    weight="bold"
                    aria-hidden="true"
                  />
                </button>
                <div
                  v-show="!collapsedSections.endStep"
                  id="engine-section-end-step"
                  class="engine-section__body"
                >
                  <div class="turn-actions">
                    <button
                      data-test="engine-end-turn-button"
                      class="action-btn deselect engine-turn-action-btn--end-turn"
                      type="button"
                      :disabled="isEndTurnDisabled"
                      :aria-label="$tf('gameplay.engine.endTurnAria', `End turn: ${endTurnPlayerLabel}`, { side: endTurnPlayerLabel })"
                      @click="$emit('end-turn')"
                    >
                      <span class="engine-turn-action-btn__main">{{ $t('gameplay.engine.endTurn') }}</span>
                      <span class="engine-turn-action-btn__side">({{ endTurnPlayerLabel }})</span>
                    </button>
                  </div>
                </div>
              </section>
              </div>
            </div>
          </template>

          <div v-else class="placeholder-content engine-placeholder">
            <div class="placeholder-icon">{{ $t('gameplay.engine.gamePlaceholderIcon') }}</div>
            <h4>{{ $t('gameplay.engine.title') }}</h4>
            <p>{{ $t('gameplay.engine.awaitingMatchStart') }}</p>
          </div>
        </div>

        <!-- Map Information (shown only when game is initialized) -->
        <section v-if="gameState && renderedTab === 'setup'" class="engine-section" :class="{ 'is-collapsed': collapsedSections.map }">
          <button
            class="engine-section__header"
            type="button"
            :aria-expanded="String(!collapsedSections.map)"
            aria-controls="engine-section-map"
            @click="toggleSection('map')"
          >
            <span class="engine-section__title">{{ $t('gameplay.engine.mapInformation') }}</span>
            <PhCaretDown
              v-if="collapsedSections.map"
              class="engine-section__chevron"
              :size="13"
              weight="bold"
              aria-hidden="true"
            />
            <PhCaretUp
              v-else
              class="engine-section__chevron"
              :size="13"
              weight="bold"
              aria-hidden="true"
            />
          </button>

          <div v-show="!collapsedSections.map" id="engine-section-map" class="engine-section__body">
            <div v-if="hasValidMapData" class="engine-map">
              <div class="engine-map__stats">
                <div class="engine-map__stat">
                  <span class="engine-map__label">{{ $t('gameplay.engine.dimensions') }}</span>
                  <span class="engine-map__value">{{ mapData.parameters.width }} × {{ mapData.parameters.height }}</span>
                </div>
                <div class="engine-map__stat">
                  <span class="engine-map__label">{{ $t('gameplay.engine.totalHexes') }}</span>
                  <span class="engine-map__value">{{ mapData.map.length }}</span>
                </div>
                <div class="engine-map__stat">
                  <span class="engine-map__label">{{ $t('gameplay.engine.terrainTypes') }}</span>
                  <span class="engine-map__value">{{ uniqueTerrainCount }}</span>
                </div>
              </div>

              <div v-if="terrainLegend.length > 0" class="engine-map__legend">
                <div class="engine-map__legend-title">{{ $t('gameplay.engine.terrainLegend') }}</div>
                <div class="engine-map__legend-items">
                  <div v-for="terrain in terrainLegend" :key="terrain.id" class="engine-map__legend-item">
                    <div class="engine-map__legend-color" :style="{ backgroundColor: terrain.color }"></div>
                    <span class="engine-map__legend-name">{{ terrain.name }}</span>
                    <span class="engine-map__legend-count">({{ terrain.count }})</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="engine-muted">
              {{ $t('gameplay.engine.mapDataUnavailable') }}
            </div>
          </div>
        </section>
          </div>
        </template>
      </TabContainer>
    </div>
  </div>
</template>

<script>
import TabContainer from './TabContainer.vue'
import { getDiceResultForUi, normalizeDiceFaceForUi } from '../utils/diceUi'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'
import dice0Svg from '@/assets/dice_animation/dice0.svg'
import dice1Animation from '@/assets/dice_animation/dice1.json'
import dice2Animation from '@/assets/dice_animation/dice2.json'
import dice3Animation from '@/assets/dice_animation/dice3.json'
import dice4Animation from '@/assets/dice_animation/dice4.json'
import dice5Animation from '@/assets/dice_animation/dice5.json'
import dice6Animation from '@/assets/dice_animation/dice6.json'
import { clampTargetIndex } from '../constants/combat.js'
import { normalizeOperations } from '../utils/uiMoveTable'
import { resolvePackageEntryLabel } from '../utils/packageLabels.js'
import { resolveTerrainColor } from '../utils/terrainColors.js'
import {
  UNIT_CARD_HEX_POINTS,
  isUnitAlive,
  normalizeUnitHealth,
  computeUnitProgress,
  computeUnitPreview
} from '../ui/unitPreview.js'
import UnitPreviewCard from './UnitPreviewCard.vue'
import AvailableActionsTable from './AvailableActionsTable.vue'
import DoctrineProfilePicker from './DoctrineProfilePicker.vue'
import {
  PhArrowsCounterClockwise,
  PhCaretDown,
  PhCaretUp,
  PhCheck,
  PhDownloadSimple,
  PhPlay,
  PhSelectionSlash,
  PhTrash,
  PhUploadSimple
} from '@phosphor-icons/vue'

/** Кадр Lottie, якщо `getDuration` недоступний (типові dice1–6.json ≈ 180 кадрів). */
const DICE_LOTTIE_FALLBACK_LAST_FRAME = 179

function clampDiceFace(n) {
  return Math.min(6, Math.max(1, n))
}

export default {
  name: 'GameEngineBlock',
  mixins: [i18nTextMixin],
  components: {
    TabContainer,
    UnitPreviewCard,
    AvailableActionsTable,
    DoctrineProfilePicker,
    PhArrowsCounterClockwise,
    PhCaretDown,
    PhCaretUp,
    PhCheck,
    PhDownloadSimple,
    PhPlay,
    PhSelectionSlash,
    PhTrash,
    PhUploadSimple
  },
  props: {
    mapData: {
      type: Object,
      default: null
    },
    gameState: {
      type: Object,
      default: null
    },
    movesData: {
      type: Object,
      default: null
    },
    // Глобальні флаги з Playground для блокування кнопок під час ініціалізації/відновлення
    isRestoring: {
      type: Boolean,
      default: false
    },
    isInitializingGlobal: {
      type: Boolean,
      default: false
    },
    /**
     * Single dispatch boundary for engine mutations supplied by
     * `Playground`. Used to commit dice rolls instead of mutating
     * `gameState.rollDice` directly.
     */
    gameController: {
      type: Object,
      default: null
    },
    levelOptions: {
      type: Array,
      default: () => [{ id: 'level_000', label: 'level_000', source: 'default' }]
    },
    selectedLevelId: {
      type: String,
      default: 'level_000'
    },
    seed: {
      type: String,
      default: 'level_000-seed-1'
    },
    loadedPackage: {
      type: Object,
      default: null
    },
    loadedSource: {
      type: String,
      default: null
    },
    loadedWarnings: {
      type: Array,
      default: () => []
    },
    builderExportLevelId: {
      type: String,
      default: null
    },
    canDeleteSelectedLevel: {
      type: Boolean,
      default: false
    },
    isStartingGame: {
      type: Boolean,
      default: false
    },
    externalDiceRolling: {
      type: Boolean,
      default: false
    },
    /**
     * Inbound intent channels from `Playground`. Playground bumps
     * `diceRollIntent.seq` / `diceRollRightIntent.seq` / `diceCancelIntent.seq`
     * instead of calling `$refs.gameEngineBlock.onDiceClick()` etc.
     * directly. Watchers below translate each intent bump into the
     * appropriate local method call.
     */
    diceRollIntent: {
      type: Object,
      default: () => ({ seq: 0 })
    },
    diceRollRightIntent: {
      type: Object,
      default: () => ({ seq: 0 })
    },
    diceCancelIntent: {
      type: Object,
      default: () => ({ seq: 0 })
    },
    selectionInspectorBridge: {
      type: Object,
      default: null
    },
    actionsDisabled: {
      type: Boolean,
      default: false
    },
    /**
     * Doctrine config for the new "auto-play turn" feature, owned by
     * `Playground`. Shape: `{ player1: { profile }, player2: { profile } }`.
     * Fed to the shared `DoctrineProfilePicker` in the Setup tab and used
     * by Playground to instantiate the per-side heuristic strategy.
     */
    autoPlayPlayers: {
      type: Object,
      default: () => ({})
    },
    /**
     * Per-side auto-play toggle state, owned by `Playground`.
     * `{ player1: boolean, player2: boolean }`.
     */
    autoPlayEnabled: {
      type: Object,
      default: () => ({ player1: false, player2: false })
    }
  },
  emits: [
    'level-selected',
    'seed-updated',
    'load-selected-level',
    'upload-archive',
    'export-loaded-builder-level',
    'delete-selected-level',
    'start-game',
    'reset-game',
    'game-state-updated',
    'dice-rolling-changed',
    'end-turn',
    'restart-game',
    'move-unit-forward',
    'move-unit-reverse',
    'rotate-unit-clockwise',
    'rotate-unit-counterclockwise',
    'fire',
    'reload',
    'attack-target-shift',
    'unit-preview-hover',
    'unit-preview-select',
    'update-doctrine-profile',
    'update-auto-play',
    'auto-play-current-turn'
  ],
  data() {
    return {
      activeTab: 'setup',
      tabs: [
        { id: 'setup', labelKey: 'gameplay.engine.tabs.setup', label: 'Setup' },
        { id: 'turn', labelKey: 'gameplay.engine.tabs.turn', label: 'Turn controls' }
      ],
      collapsedSections: {
        level: false,
        map: false,
        autoPlay: false,
        diceRoll: false,
        movement: false,
        endStep: false
      },
      dice0Svg,
      diceAnimations: [
        dice1Animation,
        dice2Animation,
        dice3Animation,
        dice4Animation,
        dice5Animation,
        dice6Animation
      ],
      diceKey: 0,
      diceRollId: 0,
      unitCardHexPoints: UNIT_CARD_HEX_POINTS,
      currentDice: 1,
      isRolling: false,
      diceLoadTimeoutId: null,
      /** Грань без gameState (прев’ю після кидка), скидається при появі gameState. */
      localDicePreview: null,
      diceUiSeq: 0
    }
  },
  methods: {

    packageLabel(entry, fallback = '') {
      const locale = this.$i18n && this.$i18n.locale ? this.$i18n.locale : undefined
      if (typeof this.$localizedLabel === 'function') {
        return this.$localizedLabel(entry, locale, fallback)
      }
      return resolvePackageEntryLabel(entry, locale, fallback)
    },

    setActiveTab(tab) {
      if (tab !== 'setup' && tab !== 'turn') return
      this.activeTab = tab
    },

    onLevelSelected(event) {
      const value = event && event.target ? event.target.value : 'level_000'
      this.$emit('level-selected', value)
    },

    onDoctrineProfileChange({ player, profile } = {}) {
      this.$emit('update-doctrine-profile', { player, profile })
    },

    onAutoPlayToggle(player, enabled) {
      this.$emit('update-auto-play', { player, enabled: enabled === true })
    },

    onSeedInput(event) {
      const value = event && event.target ? event.target.value : ''
      this.$emit('seed-updated', value)
    },

    onUploadClick() {
      if (this.$refs.archiveInput) this.$refs.archiveInput.click()
    },

    onArchiveChange(event) {
      const files = event && event.target ? event.target.files : null
      const file = files && files.length > 0 ? files[0] : null
      if (file) this.$emit('upload-archive', file)
      if (event && event.target) event.target.value = ''
    },

    onUnitPreviewHover(unitId) {
      const normalized = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      this.$emit('unit-preview-hover', normalized)
    },

    releaseUnitPreviewFocus(event) {
      const target = event && event.currentTarget
      if (target && typeof target.blur === 'function') {
        target.blur()
      }
    },

    onUnitPreviewSelect(unitId, event = null) {
      const normalized = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      this.$emit('unit-preview-select', normalized === this.selectedBridgeUnitId ? null : normalized)
      this.releaseUnitPreviewFocus(event)
    },

    onUnitPreviewDeselect(event = null) {
      this.$emit('unit-preview-select', null)
      this.releaseUnitPreviewFocus(event)
    },

    // Per-page title (INTENTIONALLY divergent from AutomatedPlayground's
    // name+facing title): GEB shows the catalog type label + a localized HP
    // label. Do not unify — see Finding #42 "KNOWN DRIFT".
    formatUnitPreviewTitle(unit) {
      if (!unit) return this.uiText('gameplay.engine.unitFallback', 'Unit')
      const id = unit.id != null ? String(unit.id) : this.uiText('gameplay.engine.unitFallback', 'Unit')
      const type = unit.type != null
        ? this.formatUnitTypeLabel(unit.type)
        : this.uiText('gameplay.engine.unknownType', 'unknown')
      const pos = unit.position && Number.isFinite(unit.position.q) && Number.isFinite(unit.position.r)
        ? ` (${unit.position.q}, ${unit.position.r})`
        : ''
      const hp = normalizeUnitHealth(unit)
      const dead = isUnitAlive(unit) ? '' : this.uiText('gameplay.engine.destroyedSuffix', ' - destroyed')
      const hpLabel = this.uiText('gameplay.engine.hpLabel', `HP ${hp.health}/${hp.max}`, {
        health: hp.health,
        max: hp.max
      })
      return `${id} - ${type}${pos} - ${hpLabel}${dead}`
    },

    currentTurnActionList() {
      return Array.isArray(this.gameState && this.gameState.currentTurnActions)
        ? this.gameState.currentTurnActions
        : []
    },

    hasTurnActionType(types) {
      const wanted = new Set(types)
      return this.currentTurnActionList().some(action => {
        const type =
          action && typeof action.actionType === 'string' && action.actionType.trim()
            ? action.actionType.trim().toLowerCase()
            : action && typeof action.type === 'string'
              ? action.type.trim().toLowerCase()
              : ''
        return wanted.has(type)
      })
    },

    phaseStatus(phase) {
      const diceDone = this.diceRollLocked || this.hasTurnActionType(['dice_roll'])
      const actionsDone = this.hasTurnActionType(['move', 'reverse', 'turn', 'fire', 'reload'])

      if (phase === 'diceRoll') return diceDone ? 'finished' : 'current'
      if (phase === 'movement') {
        if (!diceDone) return 'blocked'
        return actionsDone ? 'finished' : 'current'
      }
      if (phase === 'endStep') {
        if (!diceDone || !actionsDone) return 'blocked'
        return 'current'
      }
      return 'blocked'
    },

    phaseStatusText(phase) {
      const status = this.phaseStatus(phase)
      if (status === 'finished') return this.uiText('gameplay.engine.alreadyFinished', 'Already finished')
      if (status === 'current') return this.uiText('gameplay.engine.currentPhase', 'Current phase')
      return this.uiText('gameplay.engine.finishPreviousPhase', 'Finish previous phase to continue')
    },

    phaseStatusClass(phase) {
      return `is-${this.phaseStatus(phase)}`
    },

    /**
     * Ask the engine to draw a D6 from its seeded RNG without committing it.
     * Returns the normalized face on success, or `null` on engine
     * rejection / missing controller (a warning is surfaced via `$notify`
     * when rejection is meaningful — `NO_GAMESTATE` is silent because
     * the dice surface is also used pre-init).
     *
     * @returns {number|null}
     */
    drawDiceFromEngine() {
      if (!this.gameController || typeof this.gameController.drawDiceFromEngine !== 'function') {
        console.warn('Dice roll skipped: no game controller available.')
        return null
      }
      const result = this.gameController.drawDiceFromEngine()
      if (result.ok) {
        const f = normalizeDiceFaceForUi(result.result.face)
        if (f == null) return null
        return f
      }
      if (result.code !== 'NO_GAMESTATE') {
        if (typeof window !== 'undefined' && window.$notify && typeof window.$notify.warning === 'function') {
          window.$notify.warning(
            this.uiText('gameplay.engine.notifications.dice', 'Dice'),
            result.message || this.uiText('gameplay.engine.notifications.diceRejected', 'Dice roll rejected.')
          )
        } else {
          console.warn('Dice roll rejected:', result.message)
        }
      }
      return null
    },

    commitDiceRoll(face) {
      const f = normalizeDiceFaceForUi(face)
      if (f == null || !this.gameState) return false
      if (!this.gameController || typeof this.gameController.commitDiceRoll !== 'function') {
        console.warn('Dice commit skipped: no game controller available.')
        return false
      }
      const result = this.gameController.commitDiceRoll(f)
      if (result.ok) {
        this.$emit('game-state-updated', this.gameState)
        return true
      }
      if (result.code !== 'NO_GAMESTATE') {
        if (typeof window !== 'undefined' && window.$notify && typeof window.$notify.warning === 'function') {
          window.$notify.warning(
            this.uiText('gameplay.engine.notifications.dice', 'Dice'),
            result.message || this.uiText('gameplay.engine.notifications.diceRejected', 'Dice roll rejected.')
          )
        } else {
          console.warn('Dice commit rejected:', result.message)
        }
      }
      return false
    },
    resetGame() {
      // Емітуємо подію для скидання гри в батьківському компоненті
      this.$emit('reset-game')
    },

    toggleSection(key) {
      if (!this.collapsedSections || typeof this.collapsedSections[key] === 'undefined') return
      // Keep Level always available; other sections can be toggled freely
      if (key === 'level') {
        this.collapsedSections.level = !this.collapsedSections.level
        return
      }
      this.collapsedSections[key] = !this.collapsedSections[key]
    },

    expandAllSections() {
      Object.keys(this.collapsedSections).forEach(key => {
        this.collapsedSections[key] = false
      })
    },

    /**
     * Pick a face to display while the game has not been initialized
     * yet. This is a *preview-only* path — no engine state exists, so
     * `Math.random()` is acceptable here; the gameplay-relevant random
     * source is the engine's seeded RNG, consumed via
     * `drawDiceFromEngine` and committed after the reveal animation.
     *
     * @returns {number} 1..6
     */
    pickPreviewDiceFace() {
      return Math.floor(Math.random() * 6) + 1
    },

    onDiceClick() {
      if (this.isRolling || this.externalDiceRolling || this.diceRollLocked || this.isGameEnded) return
      let face
      if (this.gameState) {
        face = this.drawDiceFromEngine()
        if (face == null) return
      } else {
        face = this.pickPreviewDiceFace()
      }
      this.isRolling = true
      this.currentDice = face
      this.diceKey += 1
      this.diceRollId = this.diceKey
      const rollId = this.diceRollId
      if (this.diceLoadTimeoutId) clearTimeout(this.diceLoadTimeoutId)
      this.diceLoadTimeoutId = setTimeout(() => {
        this.finalizeDiceRoll(rollId)
        this.diceLoadTimeoutId = null
      }, 5000)
    },

    /**
     * Right-click instant dice roll.
     * We update the game state immediately and rely on Lottie to jump to the final frame
     * (because we keep `isRolling = false` for this path).
     */
    onDiceRightClick() {
      if (this.isRolling || this.externalDiceRolling || this.diceRollLocked || this.isGameEnded) return

      let face
      if (this.gameState) {
        face = this.drawDiceFromEngine()
        if (face == null) return
      } else {
        face = this.pickPreviewDiceFace()
      }

      this.currentDice = face
      this.diceKey += 1
      this.diceRollId = this.diceKey

      // Cancel any previous safety timers.
      if (this.diceLoadTimeoutId) {
        clearTimeout(this.diceLoadTimeoutId)
        this.diceLoadTimeoutId = null
      }

      // Keep the UI responsive: no waiting for the animation.
      this.isRolling = false

      if (this.gameState) {
        this.commitDiceRoll(face)
      } else {
        const f = normalizeDiceFaceForUi(face)
        if (f != null) this.localDicePreview = f
      }
    },

    onDiceLoaded() {
      if (this.diceLoadTimeoutId) {
        clearTimeout(this.diceLoadTimeoutId)
        this.diceLoadTimeoutId = null
      }
      const lottie = this.$refs.diceLottieRef
      if (!lottie) return
      if (this.isRolling && this.diceKey === this.diceRollId) {
        if (typeof lottie.play === 'function') lottie.play()
      } else {
        const duration = typeof lottie.getDuration === 'function' ? lottie.getDuration(true) : 0
        const lastFrame =
          typeof duration === 'number' && duration > 0 ? duration - 1 : DICE_LOTTIE_FALLBACK_LAST_FRAME
        if (typeof lottie.goToAndStop === 'function') lottie.goToAndStop(lastFrame, true)
      }
    },

    onDiceComplete() {
      const rollId = this.diceRollId
      if (this.diceLoadTimeoutId) {
        clearTimeout(this.diceLoadTimeoutId)
        this.diceLoadTimeoutId = null
      }
      this.finalizeDiceRoll(rollId)
    },

    finalizeDiceRoll(rollId) {
      if (!this.isRolling || rollId !== this.diceKey) return
      if (this.gameState) {
        this.commitDiceRoll(this.currentDice)
      } else {
        const f = normalizeDiceFaceForUi(this.currentDice)
        if (f != null) this.localDicePreview = f
      }
      this.isRolling = false
    },

    cancelDiceRoll() {
      if (this.diceLoadTimeoutId) {
        clearTimeout(this.diceLoadTimeoutId)
        this.diceLoadTimeoutId = null
      }
      this.diceRollId = 0
      this.isRolling = false
    },

    formatTerrainName(terrainId) {
      const id = terrainId == null ? '' : String(terrainId)
      const terrainTypes = this.loadedPackage &&
        this.loadedPackage.terrain &&
        Array.isArray(this.loadedPackage.terrain.terrainTypes)
        ? this.loadedPackage.terrain.terrainTypes
        : []
      const entry = terrainTypes.find(terrain => terrain && terrain.id === id)
      const fallback = id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ')
      return this.packageLabel(entry || { id }, fallback)
    },

    formatUnitTypeLabel(type) {
      const id = type == null ? '' : String(type)
      const catalog = this.gameState && this.gameState.unitCatalogById
      const entry = catalog && typeof catalog.get === 'function' ? catalog.get(id) : null
      return this.packageLabel(entry || { id }, id || this.uiText('gameplay.engine.unknownType', 'unknown'))
    },

    getTerrainColor(terrainId) {
      const packageTerrainTypes = this.loadedPackage &&
        this.loadedPackage.terrain &&
        Array.isArray(this.loadedPackage.terrain.terrainTypes)
        ? this.loadedPackage.terrain.terrainTypes
        : null
      return resolveTerrainColor(packageTerrainTypes, terrainId)
    }
  },
  
  computed: {
    bridge() {
      const b = this.selectionInspectorBridge
      return b && typeof b === 'object' && !Array.isArray(b) ? b : {}
    },
    selectedBridgeUnitId() {
      const id = this.bridge.selectedUnitId
      return typeof id === 'string' && id.trim() ? id.trim() : null
    },
    hasSelectedUnitForActions() {
      return !!this.selectedBridgeUnitId
    },
    bridgeCanMoveForward() {
      return !!this.bridge.canMoveForward
    },
    bridgeCanMoveReverse() {
      return typeof this.bridge.canMoveReverse === 'boolean' ? this.bridge.canMoveReverse : true
    },
    bridgeCanRotate() {
      return !!this.bridge.canRotate
    },
    bridgeCanFire() {
      return !!this.bridge.canFire
    },
    bridgeCanReload() {
      return !!this.bridge.canReload
    },
    bridgeValidAttackTargets() {
      return Array.isArray(this.bridge.validAttackTargets) ? this.bridge.validAttackTargets : []
    },
    bridgeSelectedTargetIndex() {
      const n = Number(this.bridge.selectedTargetIndex)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
    },
    movementControlsDisabled() {
      return this.actionsDisabled || !this.hasSelectedUnitForActions
    },
    attackControlsDisabled() {
      return this.actionsDisabled || !this.hasSelectedUnitForActions
    },
    displayTargetOrdinal() {
      const len = this.bridgeValidAttackTargets.length
      if (len <= 0) return 0
      return clampTargetIndex(this.bridgeSelectedTargetIndex, len) + 1
    },
    currentAttackTarget() {
      const list = this.bridgeValidAttackTargets
      if (!list.length) return null
      const idx = clampTargetIndex(this.bridgeSelectedTargetIndex, list.length)
      const target = list[idx]
      if (target && Number.isFinite(target.q) && Number.isFinite(target.r)) return target
      return null
    },
    attackTargetCoordsText() {
      const target = this.currentAttackTarget
      if (!target) return '-, -'
      return `${target.q}, ${target.r}`
    },
    targetStatusLabel() {
      return this.uiText(
        'gameplay.inspector.targetStatus',
        `[Target ${this.displayTargetOrdinal} / ${this.bridgeValidAttackTargets.length} (${this.attackTargetCoordsText})]`,
        {
          current: this.displayTargetOrdinal,
          total: this.bridgeValidAttackTargets.length,
          coords: this.attackTargetCoordsText
        }
      )
    },
    activePlayerUnits() {
      const gs = this.gameState
      if (!gs) return []
      const player = gs.currentPlayer
      let units = []
      if (typeof gs.getPlayerUnits === 'function') {
        units = gs.getPlayerUnits(player)
      } else if (typeof gs.getAllUnits === 'function') {
        units = gs.getAllUnits().filter(unit => unit && unit.player === player)
      }
      if (!Array.isArray(units)) return []
      return units
        .map((unit, index) => ({ unit, index, alive: isUnitAlive(unit) }))
        .sort((a, b) => {
          if (a.alive !== b.alive) return a.alive ? -1 : 1
          return a.index - b.index
        })
        .map(row => row.unit)
    },
    activePlayerUnitPreviews() {
      const turnState = this.gameState && this.gameState.turnState
      return this.activePlayerUnits
        .filter(unit => unit && typeof unit === 'object' && unit.id != null)
        .map(unit => {
          const progress = computeUnitProgress(unit, turnState)
          return computeUnitPreview(unit, {
            turnState,
            isSelected: String(unit.id) === this.selectedBridgeUnitId,
            title: this.formatUnitPreviewTitle(unit),
            progressLabel: this.uiText('gameplay.engine.actionsProgress', `Actions ${progress.normalizedActions}/${progress.normalizedMovement}`, {
              current: progress.normalizedActions,
              total: progress.normalizedMovement
            })
          })
        })
    },
    /** Результат кидка з геймстейту (поточний хід); diceUiSeq + getDiceResultForUi — реактивність після recordAction/endTurn. */
    lastDiceResult() {
      void this.diceUiSeq
      return getDiceResultForUi(this.gameState, this.diceUiSeq)
    },
    /**
     * Lock the dice button when the engine reports the active player has
     * already rolled this turn. We deliberately delegate to engine state
     * instead of mirroring it locally so disabled-state can never drift
     * from the rule that `rollDice` enforces.
     */
    diceRollLocked() {
      void this.diceUiSeq
      const gs = this.gameState
      if (!gs || typeof gs.hasRolledDice !== 'function') return false
      return gs.hasRolledDice()
    },
    isGameEnded() {
      return !!(
        this.gameState &&
        this.gameState.outcome &&
        this.gameState.outcome.status === 'ended'
      )
    },
    turnDiceResult() {
      return this.lastDiceResult
    },
    endTurnPlayerLabel() {
      const player = this.gameState && this.gameState.currentPlayer
      if (player === 'player2') return this.uiText('common.enemy', 'Enemy')
      return this.uiText('common.player', 'Player')
    },
    /** Label for the active side (Player / Enemy), used by the auto-play finish button. */
    activeSideLabel() {
      // Genitive side word for "Дограти лише поточний хід <side>" — UA needs
      // the genitive ("...хід гравця"), not the nominative the End turn button uses.
      return this.currentPlayerKey === 'player2'
        ? this.uiText('gameplay.autoPlay.sideEnemy', 'Enemy')
        : this.uiText('gameplay.autoPlay.sidePlayer', 'Player')
    },
    /** Color class (blue for player1 / red for player2) for the active-side word. */
    activeSideClass() {
      return this.currentPlayerKey === 'player2'
        ? 'engine-autoplay__side--enemy'
        : 'engine-autoplay__side--player'
    },
    /**
     * Dynamic helper text under the two auto-play switches, keyed on the
     * OFF/OFF, ON/OFF, OFF/ON, ON/ON combination.
     */
    autoPlayHintText() {
      const p1 = !!(this.autoPlayEnabled && this.autoPlayEnabled.player1)
      const p2 = !!(this.autoPlayEnabled && this.autoPlayEnabled.player2)
      if (p1 && p2) return this.uiText('gameplay.autoPlay.hintBoth', 'Starting next turn, both sides will be played automatically. You only need to press "End turn".')
      if (p1) return this.uiText('gameplay.autoPlay.hintPlayer', 'Starting next turn, the Player\'s moves will be played automatically. You only need to press "End turn".')
      if (p2) return this.uiText('gameplay.autoPlay.hintEnemy', 'Starting next turn, the Enemy\'s moves will be played automatically. You only need to press "End turn".')
      return this.uiText('gameplay.autoPlay.hintNone', 'Automatic turn play is off for both sides. All actions on the board must be performed manually.')
    },
    isAutoPlayFinishDisabled() {
      return !this.gameState || this.isRolling || this.externalDiceRolling || this.isGameEnded
    },
    currentPlayerKey() {
      const player = this.gameState && this.gameState.currentPlayer
      return player === 'player2' ? 'player2' : 'player1'
    },
    availableActionsSourceKey() {
      return this.currentPlayerKey === 'player2' ? 'Enemy_operations' : 'Our_operations'
    },
    availableActionsShowPriority() {
      return this.currentPlayerKey === 'player2'
    },
    availableDiceIndex() {
      const face = normalizeDiceFaceForUi(this.turnDiceResult)
      return face == null ? null : face - 1
    },
    availableDiceLabel() {
      return this.availableDiceIndex == null ? 'd?' : `d${this.availableDiceIndex + 1}`
    },
    availableActionOperations() {
      const source =
        this.movesData && typeof this.movesData === 'object'
          ? this.movesData[this.availableActionsSourceKey]
          : null
      return normalizeOperations(source, this.availableActionsSourceKey)
    },
    diceRollState() {
      if (this.turnDiceResult !== null) return 'rolled'
      if (this.isRolling || this.externalDiceRolling) return 'rolling'
      return 'waiting'
    },
    diceButtonTitle() {
      if (this.isGameEnded) return this.uiText('gameplay.engine.gameEndedDiceTitle', 'Game already ended.')
      if (this.diceRollLocked) return this.uiText('gameplay.engine.diceAlreadyRolledTitle', 'Dice already rolled this turn. End turn to roll again.')
      return null
    },
    isDiceButtonDisabled() {
      return this.isRolling || this.externalDiceRolling || this.diceRollLocked || this.isGameEnded
    },
    isEndTurnDisabled() {
      return !this.gameState || this.isRolling || this.externalDiceRolling || this.isGameEnded
    },
    isRestartGameDisabled() {
      return !this.gameState || this.isRolling || this.externalDiceRolling
    },
    /** A: !isRolling і немає ані збереженого кидка, ані локального прев’ю. */
    diceShowPlaceholder() {
      return !this.isRolling && this.lastDiceResult === null && this.localDicePreview === null
    },
    /** Індекс грані 1–6 для Lottie: B — currentDice; C — lastDiceResult або localDicePreview. */
    displayedDice() {
      if (this.isRolling) {
        return clampDiceFace(this.currentDice)
      }
      const fromEngine = this.lastDiceResult
      if (fromEngine != null) return fromEngine
      if (this.localDicePreview != null) return clampDiceFace(this.localDicePreview)
      /* Гілка v-else Lottie недоступна без isRolling/результату/прев’ю; запасний індекс — поточний currentDice. */
      return clampDiceFace(this.currentDice)
    },
    /** Індекс 0–5 у diceAnimations; без -1 / undefined. */
    lottieDiceIndex() {
      return clampDiceFace(this.displayedDice) - 1
    },
    hasValidMapData() {
      const map = this.mapData
      return (
        !!map &&
        !!map.parameters &&
        Number.isFinite(map.parameters.width) &&
        Number.isFinite(map.parameters.height) &&
        Array.isArray(map.map)
      )
    },
    uniqueTerrainCount() {
      if (!this.hasValidMapData) return 0
      const terrainIds = new Set(this.mapData.map.map(hex => hex.terrain))
      return terrainIds.size
    },
    terrainLegend() {
      if (!this.hasValidMapData) return []

      const terrainCounts = {}
      this.mapData.map.forEach(hex => {
        if (!terrainCounts[hex.terrain]) {
          terrainCounts[hex.terrain] = {
            id: hex.terrain,
            name: this.formatTerrainName(hex.terrain),
            color: this.getTerrainColor(hex.terrain),
            count: 0
          }
        }
        terrainCounts[hex.terrain].count++
      })

      return Object.values(terrainCounts)
    },
    hasUnits() {
      return this.gameState && typeof this.gameState.getAllUnits === 'function' && this.gameState.getAllUnits().length > 0
    },
    normalizedLevelOptions() {
      const list = Array.isArray(this.levelOptions) ? this.levelOptions : []
      if (list.length === 0) return [{ id: 'level_000', label: 'level_000', source: 'default' }]
      return list
        .filter(level => level && typeof level.id === 'string' && level.id.trim())
        .map(level => ({
          id: level.id,
          label: level.label || level.id,
          source: level.source || 'default',
          removable: level.removable === true
        }))
    },
    isSetupLoadingBusy() {
      return this.isInitializingGlobal || this.isRestoring || this.isStartingGame
    },
    isSetupBusy() {
      return this.isSetupLoadingBusy || !!this.gameState
    },
    isStartDisabled() {
      return !this.loadedPackage || this.isSetupBusy
    },
    isLoadSelectedDisabled() {
      return this.isSetupBusy || !this.selectedLevelId || this.isSelectedLevelLoaded
    },
    isSelectedLevelLoaded() {
      return !!(
        this.loadedPackage &&
        typeof this.loadedPackage.id === 'string' &&
        this.loadedPackage.id === this.selectedLevelId
      )
    },
    normalizedWarnings() {
      return Array.isArray(this.loadedWarnings) ? this.loadedWarnings : []
    },
    loadedSummary() {
      const pkg = this.loadedPackage || {}
      const hexmap = pkg.hexmap && typeof pkg.hexmap === 'object' ? pkg.hexmap : {}
      const params = hexmap.parameters && typeof hexmap.parameters === 'object'
        ? hexmap.parameters
        : {}
      const cells = Array.isArray(hexmap.map) ? hexmap.map : []
      const id = typeof pkg.id === 'string' && pkg.id.trim() ? pkg.id.trim() : this.uiText('gameplay.engine.unknownLevel', 'Unknown level')
      const dimensions =
        Number.isFinite(params.width) && Number.isFinite(params.height)
          ? `${params.width} x ${params.height}`
          : this.uiText('gameplay.engine.sizeUnknown', 'Size unknown')
      const source = this.loadedSource && this.loadedSource.trim()
        ? this.uiText('gameplay.engine.source', `Source: ${this.loadedSource.trim()}`, { source: this.loadedSource.trim() })
        : this.uiText('gameplay.engine.sourceUnknown', 'Source: unknown')
      const warningCount = this.normalizedWarnings.length
      const hexLabel = cells.length === 1
        ? this.uiText('gameplay.engine.hex', 'hex')
        : this.uiText('gameplay.engine.hexes', 'hexes')
      const warningLabel = warningCount === 1
        ? this.uiText('gameplay.engine.warning', 'warning')
        : this.uiText('gameplay.engine.warnings', 'warnings')

      return {
        id,
        dimensions,
        hexCount: `${cells.length} ${hexLabel}`,
        source,
        warnings: `${warningCount} ${warningLabel}`
      }
    }
  },
  
  watch: {
    gameState: {
      handler(newState) {
        if (newState) {
          this.localDicePreview = null
          this.collapsedSections.level = true
          this.activeTab = 'turn'
        }

        // Reset UI to a safe default on reset
        if (!newState) {
          this.activeTab = 'setup'
          this.expandAllSections()
          this.currentDice = 1
          this.isRolling = false
          this.diceKey = 0
          this.diceRollId = 0
          this.localDicePreview = null
          if (this.diceLoadTimeoutId) {
            clearTimeout(this.diceLoadTimeoutId)
            this.diceLoadTimeoutId = null
          }
        }
      },
      immediate: true
    },
    isRolling(value) {
      this.$emit('dice-rolling-changed', !!value)
    },
    lastDiceResult: {
      handler(newVal) {
        if (newVal != null) {
          this.localDicePreview = null
        } else if (this.gameState) {
          this.localDicePreview = null
        }
      }
    },
    'gameState.currentTurnActions': {
      deep: true,
      handler() {
        this.diceUiSeq++
      }
    },
    diceRollIntent: {
      handler() {
        this.onDiceClick()
      }
    },
    diceRollRightIntent: {
      handler() {
        this.onDiceRightClick()
      }
    },
    diceCancelIntent: {
      handler() {
        this.cancelDiceRoll()
      }
    }
  },

  beforeUnmount() {
    if (this.diceLoadTimeoutId) clearTimeout(this.diceLoadTimeoutId)
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/engine-sections';
@use '../styles/engine-turn-controls';
@use '../styles/level-builder-action-controls' as actionControls;

/* Using universal styles from components.scss and universal-components.scss */
/* All game-specific styles are now in universal-components.scss */

.content-container-flex {
  /* Make the content area scrollable (critical in flex layouts) */
  justify-content: flex-start;
  align-items: stretch;
  min-height: 0;
  padding: 0;
}

.engine-tab-container {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.engine-tab-container :deep(.tab-content) {
  padding: 12px;
}

.engine-scroll {
  flex: 1;
  min-height: 0;
  overflow: visible;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.engine-tabpanel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.engine-turn {
  min-width: 0;
}

.turn-step-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.turn-step-summary {
  min-width: 0;
  padding: 0 2px 2px;
}

.turn-phase-accordion {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background: #f8f9fa;
}

.turn-phase-accordion .engine-section {
  border: none;
  border-radius: 0;
  background: transparent;
}

.turn-phase-accordion .engine-section + .engine-section {
  border-top: 1px solid #e9ecef;
}

.turn-phase-accordion .engine-section__body {
  border-top: 0;
  background: #f8f9fa;
}

.turn-phase-accordion .engine-section__header:hover {
  background: #e8e8e8;
}

.turn-phase-accordion .engine-section:not(.is-collapsed) > .engine-section__header {
  background: linear-gradient(180deg, rgba(237, 237, 237, 1) 0%, rgba(237, 237, 237, 0) 100%);
}

.turn-phase-accordion .engine-section:not(.is-collapsed) > .engine-section__header:hover {
  background: #e8e8e8;
}

.turn-step-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.turn-step-header__title,
.turn-step-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: #4b5563;
}

.turn-step-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.turn-step-metric {
  min-width: 0;
}

.turn-step-metric__label {
  display: block;
  margin-bottom: 3px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
}

.turn-step-metric__value {
  display: block;
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.turn-step-main {
  min-width: 0;
}

.turn-step-dice {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.engine-controls__level-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}

.engine-controls__builder-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-controls__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.engine-controls__label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.engine-controls__input {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 6px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: #fff;
  font: inherit;
  font-size: 13px;
}

.engine-controls__select {
  appearance: none;
  padding-right: 32px;
  background-color: #fff;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.5 1.75L6 6.25L10.5 1.75' stroke='%23334155' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px 8px;
}

.engine-controls__select:disabled {
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1.5 1.75L6 6.25L10.5 1.75' stroke='%239CA3AF' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.engine-icon-button {
  min-width: 38px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: #fff;
  color: #4CAF50;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.engine-icon-button:hover:not(:disabled) {
  border-color: #4CAF50;
  background: #E8F5E8;
}

.engine-icon-button--full {
  width: 100%;
}

.engine-icon-button--danger {
  color: #b42318;
}

.engine-icon-button--danger:hover:not(:disabled) {
  border-color: #dc3545;
  background: #fff1f0;
}

.engine-icon-button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.engine-level-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  padding: 0;
  color: #555;
  font-size: 12px;
}

.engine-level-summary strong {
  color: #222;
}

.engine-level-summary span + span::before,
.engine-level-summary strong + span::before {
  content: "/";
  margin-right: 8px;
  color: #9ca3af;
}

.engine-level-summary.is-empty {
  color: #777;
}

.engine-controls__load-row {
  display: block;
}

.engine-controls__load-row .btn-primary,
.engine-reset-button,
.engine-start-button,
.engine-restart-button {
  width: 100%;
}

.engine-controls__load-row .btn-primary {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.engine-controls__file-input {
  display: none;
}

.engine-start-button,
.engine-reset-button,
.engine-restart-button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.engine-reset-button {
  border: 1px solid rgba(220, 53, 69, 0.28);
  border-radius: 4px;
  background: rgba(220, 53, 69, 0.08);
  color: #b42332;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.engine-reset-button:hover:not(:disabled) {
  border-color: rgba(220, 53, 69, 0.45);
  background: rgba(220, 53, 69, 0.14);
}

.engine-reset-button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.engine-restart-button {
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: #fff;
  color: #4CAF50;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.engine-restart-button:hover:not(:disabled) {
  border-color: #4CAF50;
  background: #E8F5E8;
}

.engine-restart-button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.engine-setup-divider {
  height: 1px;
  margin: 2px 0;
  background: #e5e7eb;
}

.engine-kv {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-kv--compact {
  gap: 6px;
}

.engine-kv__row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.engine-kv__label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  min-width: 0;
}

.engine-kv__value {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.engine-map__stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-map__stat {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.engine-map__label {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  min-width: 0;
}

.engine-map__value {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.engine-map__legend {
  margin-top: 10px;
}

.engine-map__legend-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
}

.engine-map__legend-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-map__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.engine-map__legend-color {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #ddd;
  flex-shrink: 0;
}

.engine-map__legend-name {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.engine-map__legend-count {
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
}

.engine-placeholder {
  width: 100%;
  max-width: 280px;
  margin: 4px auto 0;
  color: #555;
  text-align: center;
}

.engine-placeholder .placeholder-icon {
  display: block;
  margin-bottom: 8px;
  font-size: 20px;
  line-height: 1;
}

.engine-placeholder h4 {
  margin: 0 0 6px;
  color: #333;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.35;
}

.engine-placeholder p {
  margin: 0;
  color: #555;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
}

.engine-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.engine-action-buttons:last-child {
  margin-bottom: 0;
}

.engine-action-buttons .action-btn,
.engine-attack-switch .action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  line-height: 1.1;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.engine-action-buttons .action-btn:hover:not(:disabled),
.engine-attack-switch .action-btn:hover:not(:disabled) {
  background: #eee;
}

.engine-action-buttons .action-btn:disabled,
.engine-attack-switch .action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.engine-action-buttons .action-btn--danger {
  border-color: transparent;
  background: #c62828;
  color: #fff;
}

.engine-action-buttons .action-btn--danger:hover:not(:disabled) {
  background: #b71c1c;
}

.engine-attack-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.engine-attack-switch__label {
  font-size: 13px;
  font-weight: 500;
}

.engine-attack-switch__buttons {
  display: flex;
  gap: 6px;
}

.engine-attack-switch .action-btn--compact {
  min-width: 40px;
  padding: 6px 10px;
}

.engine-keyboard-caption {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.engine-keyboard-caption:not(:first-of-type) {
  margin-top: 10px;
}

.keyboard-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #333;
}

.keyboard-hint .key {
  min-width: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f0f0f0;
  font-size: 11px;
  font-family: inherit;
}

.attack-target-highlight {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid #c5ccd3;
  border-radius: 8px;
  background: linear-gradient(180deg, #f0f4f8 0%, #e8eef4 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  font-size: 13px;
  line-height: 1.35;
  color: #222;
}

.attack-target-highlight--empty {
  font-style: italic;
  color: #666;
  justify-content: center;
}

.attack-target-highlight__coords {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.75);
}

.dice-roll-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 0;
}

.dice-roll-trigger {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}

.dice-roll-trigger--turn {
  --dice-roll-accent: #4CAF50;
  --dice-roll-bg: #E8F5E8;
  --dice-roll-border: #4CAF50;

  width: 100%;
  min-height: 126px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--dice-roll-border);
  border-radius: 8px;
  background: var(--dice-roll-bg);
  color: var(--dice-roll-accent);
  line-height: 1;
}

.dice-roll-trigger--turn[data-roll-state='waiting'][data-current-player='player1'] {
  --dice-roll-accent: #1565c0;
  --dice-roll-bg: #e3f2fd;
  --dice-roll-border: #42a5f5;
}

.dice-roll-trigger--turn[data-roll-state='waiting'][data-current-player='player2'] {
  --dice-roll-accent: #c62828;
  --dice-roll-bg: #ffebee;
  --dice-roll-border: #ef5350;
}

.dice-roll-trigger--turn[data-roll-state='rolled'] {
  --dice-roll-bg: #fff;
  --dice-roll-border: #d4dce6;
}

.dice-roll-trigger--turn[data-roll-state='rolled'][data-current-player='player1'] {
  --dice-roll-accent: #1565c0;
}

.dice-roll-trigger--turn[data-roll-state='rolled'][data-current-player='player2'] {
  --dice-roll-accent: #c62828;
}

.dice-roll-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.85;
}

.dice-roll-visual {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
}

.dice-roll-action-label {
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
}

.dice-roll-caption {
  color: #6b7280;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  text-align: center;
}

.dice-placeholder-img {
  display: block;
  width: 96px;
  height: 96px;
  object-fit: contain;
}

.turn-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.turn-actions .action-btn {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.turn-actions .action-btn.deselect {
  width: 100%;
  justify-content: center;
}

.turn-actions .action-btn:hover:not(:disabled) {
  background: #eee;
}

.turn-actions .action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.turn-actions .engine-turn-action-btn--end-turn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-color: transparent;
  background: #FF5722;
  color: #fff;
}

.turn-actions .action-btn.engine-turn-action-btn--end-turn {
  justify-content: center;
}

.engine-turn-action-btn__main {
  font-weight: 500;
}

.engine-turn-action-btn__side {
  font-weight: 400;
  opacity: 0.7;
}

.turn-actions .engine-turn-action-btn--end-turn:hover:not(:disabled) {
  background: #e64a19;
}

.turn-actions .engine-turn-action-btn--restart {
  width: 100%;
  background: #fff;
  color: #333;
}

@media (max-width: 520px) {
  .turn-step-metrics,
  .turn-actions {
    grid-template-columns: 1fr;
  }
}

/* Doctrine pickers in the Setup tab (between Level and Seed). */
.engine-doctrine-setup {
  display: grid;
  gap: 6px;
}

.engine-doctrine-setup__hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

/* "Automatic turn play" collapsible block in the Turn controls tab. */
.engine-autoplay__body {
  display: grid;
  gap: 10px;
}

.engine-autoplay__switches {
  display: grid;
  gap: 8px;
}

.engine-autoplay__switch {
  gap: 10px;
}

.engine-autoplay__switch-text {
  font-size: 13px;
  color: #333;
}

.engine-autoplay__hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.engine-autoplay__divider {
  height: 1px;
  margin: 2px 0;
  background: #e5e7eb;
}

/* Single-shot finisher styled like the Automated page's white action button
   (`automated-playground__action-button __trace-action`), via the same mixin. */
.engine-autoplay__finish-button {
  @include actionControls.action-button;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 6px;
  text-align: center;
}

.engine-autoplay__finish-caption {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

/* Player = blue, Enemy = red, using the project's player/enemy colour tokens. */
.engine-autoplay__side {
  font-weight: 700;
}

.engine-autoplay__side--player {
  color: var(--overlay-player1-color);
}

.engine-autoplay__side--enemy {
  color: var(--overlay-player2-color);
}
</style>

