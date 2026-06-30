<template>
  <div class="automated-playground">
    <HeaderComponent
      :show-reset-layout="shouldShowLayoutReset"
      @reset-layout="resetLayout"
    />

    <main class="automated-playground__shell">
      <p v-if="importError" class="automated-playground__import-error" role="alert">
        {{ importError }}
      </p>

      <section v-if="traceError" class="automated-playground__empty automated-playground__empty--trace">
        <h2>{{ traceError }}</h2>
        <p>{{ $t('automatedPlayground.emptyInstruction') }}</p>
        <router-link
          class="automated-playground__empty-action"
          :to="{ path: '/LevelBuilder', query: { step: 'review-export' } }"
        >
          {{ $t('automatedPlayground.openBuilderReview') }}
        </router-link>
      </section>

      <template v-else>
        <section class="automated-playground__controls" :aria-label="$t('automatedPlayground.controls')">
          <button
            type="button"
            class="automated-playground__icon-button automated-playground__control-button"
            :disabled="!canStepBack"
            :aria-label="$t('automatedPlayground.first')"
            :title="$t('automatedPlayground.first')"
            @click="firstFrame"
          >
            <PhSkipBack :size="18" weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="automated-playground__icon-button automated-playground__control-button"
            :disabled="!canStepBack"
            :aria-label="$t('automatedPlayground.previous')"
            :title="$t('automatedPlayground.previous')"
            @click="previousFrame"
          >
            <PhRewind :size="18" weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="automated-playground__icon-button automated-playground__icon-button--primary automated-playground__control-button"
            :disabled="frames.length === 0"
            :aria-label="playing ? $t('automatedPlayground.pause') : $t('automatedPlayground.play')"
            :title="playing ? $t('automatedPlayground.pause') : $t('automatedPlayground.play')"
            @click="togglePlayback"
          >
            <PhPause v-if="playing" :size="18" weight="bold" aria-hidden="true" />
            <PhPlay v-else :size="18" weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="automated-playground__icon-button automated-playground__control-button"
            :disabled="!canStepForward"
            :aria-label="$t('automatedPlayground.next')"
            :title="$t('automatedPlayground.next')"
            @click="nextFrame"
          >
            <PhFastForward :size="18" weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="automated-playground__icon-button automated-playground__control-button"
            :disabled="!canStepForward"
            :aria-label="$t('automatedPlayground.last')"
            :title="$t('automatedPlayground.last')"
            @click="lastFrame"
          >
            <PhSkipForward :size="18" weight="bold" aria-hidden="true" />
          </button>

          <label class="automated-playground__speed">
            <span>{{ $t('automatedPlayground.speed') }}</span>
            <select v-model.number="speedMs" class="automated-playground__field-control automated-playground__speed-select">
              <option :value="900">0.75x</option>
              <option :value="500">1x</option>
              <option :value="250">2x</option>
            </select>
          </label>

          <input
            class="automated-playground__range"
            type="range"
            min="0"
            :max="frameSliderMax"
            :value="frameIndex"
            :disabled="frames.length === 0"
            @input="scrubFrameIndex($event.target.valueAsNumber)"
          />
          <span class="automated-playground__frame-counter">
            {{ frameIndex + 1 }} / {{ Math.max(frames.length, 1) }}
          </span>
        </section>

        <section
          ref="workspace"
          class="automated-playground__workspace"
          :style="layoutGridStyle"
        >
          <div
            class="automated-playground__board"
            :aria-label="$t('automatedPlayground.board')"
            @contextmenu.prevent="clearFrameSelection"
          >
            <p
              v-if="isUsingFallbackSnapshot"
              class="automated-playground__board-notice"
              role="status"
            >
              {{ $t('automatedPlayground.boardSnapshotFallback') }}
            </p>
            <GameMapBlock
              v-if="frameGameState"
              :key="frameMapKey"
              class="automated-playground__game-map"
              :game-state="frameGameState"
              :terrain-types="frameTerrainTypes"
              :show-floating-panel="false"
              :actions-disabled="true"
              :unit-preview-hover-intent="unitPreviewHoverIntent"
              read-only
              surface-variant="viewer"
              @hex-selected="onFrameHexSelected"
            />
            <div v-else class="automated-playground__empty">
              {{ $t('automatedPlayground.noBoard') }}
            </div>
          </div>

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

          <aside class="automated-playground__inspector">
            <section
              class="automated-playground__inspector-section engine-section"
              :class="{ 'is-collapsed': collapsedFrameSections.frame }"
            >
              <button
                type="button"
                class="engine-section__header"
                :aria-expanded="String(!collapsedFrameSections.frame)"
                aria-controls="automated-frame-details"
                @click="toggleFrameSection('frame')"
              >
                <span class="engine-section__title">{{ $t('automatedPlayground.currentFrame') }}</span>
                <PhCaretDown
                  v-if="collapsedFrameSections.frame"
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
              <dl
                v-show="!collapsedFrameSections.frame"
                id="automated-frame-details"
                class="engine-section__body automated-playground__facts"
              >
                <div><dt>{{ $t('automatedPlayground.event') }}</dt><dd>{{ currentFrame.event || '-' }}</dd></div>
                <div><dt>{{ $t('automatedPlayground.turn') }}</dt><dd>{{ currentFrame.turnNumber || '-' }}</dd></div>
                <div><dt>{{ $t('automatedPlayground.player') }}</dt><dd>{{ currentFrame.actingPlayer || currentFrame.currentPlayer || '-' }}</dd></div>
                <div><dt>{{ $t('automatedPlayground.command') }}</dt><dd>{{ commandLabel }}</dd></div>
                <div><dt>{{ $t('automatedPlayground.d6') }}</dt><dd>{{ availableDiceLabel }}</dd></div>
              </dl>
            </section>

            <section
              class="automated-playground__inspector-section engine-section"
              :class="{ 'is-collapsed': collapsedFrameSections.units }"
            >
              <button
                type="button"
                class="engine-section__header"
                :aria-expanded="String(!collapsedFrameSections.units)"
                aria-controls="automated-frame-units"
                @click="toggleFrameSection('units')"
              >
                <span class="engine-section__title">{{ $t('automatedPlayground.units') }}</span>
                <PhCaretDown
                  v-if="collapsedFrameSections.units"
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
              <div
                v-show="!collapsedFrameSections.units"
                id="automated-frame-units"
                class="engine-section__body automated-playground__unit-roster"
              >
                <section
                  v-for="group in unitGroups"
                  :key="group.player"
                  class="engine-action-subsection automated-playground__unit-side"
                  :data-player="group.player"
                >
                  <h6 class="engine-action-subsection__title">{{ group.label }}</h6>
                  <div
                    class="engine-unit-grid"
                    :class="{ 'is-empty': group.previews.length === 0 }"
                  >
                    <UnitPreviewCard
                      v-for="preview in group.previews"
                      :key="preview.id"
                      :preview="preview"
                      :hex-points="unitCardHexPoints"
                      @hover="onUnitPreviewHover"
                      @select="selectUnitPreview($event.unit)"
                      @deselect="clearFrameSelection"
                    />
                    <div v-if="group.previews.length === 0" class="engine-muted">
                      {{ $t('gameplay.engine.noActiveUnits') }}
                    </div>
                  </div>
                </section>
              </div>
            </section>

            <section
              class="automated-playground__inspector-section engine-section"
              :class="{ 'is-collapsed': collapsedFrameSections.actions }"
            >
              <button
                type="button"
                class="engine-section__header"
                :aria-expanded="String(!collapsedFrameSections.actions)"
                aria-controls="automated-frame-actions"
                @click="toggleFrameSection('actions')"
              >
                <span class="engine-section__title">{{ $t('automatedPlayground.availableActions') }}</span>
                <PhCaretDown
                  v-if="collapsedFrameSections.actions"
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
              <div
                v-show="!collapsedFrameSections.actions"
                id="automated-frame-actions"
                class="engine-section__body"
              >
              <div v-if="availableDiceIndex === null" class="automated-playground__selection-empty">
                {{ $t('automatedPlayground.noDiceResult') }}
              </div>
              <div v-else-if="availableActionOperations.length === 0" class="automated-playground__selection-empty">
                {{ $t('automatedPlayground.noAvailableActionsData') }}
              </div>
              <div v-else class="engine-available-actions-table-wrap">
                <AvailableActionsTable
                  :operations="availableActionOperations"
                  :dice-index="availableDiceIndex"
                  :dice-label="availableDiceLabel"
                  :current-player="currentPlayerKey"
                  :show-priority="availableActionsShowPriority"
                  :aria-label="$t('automatedPlayground.availableActions')"
                />
              </div>
              </div>
            </section>

            <section
              class="automated-playground__inspector-section engine-section"
              :class="{ 'is-collapsed': collapsedFrameSections.selection }"
            >
              <button
                type="button"
                class="engine-section__header"
                :aria-expanded="String(!collapsedFrameSections.selection)"
                aria-controls="automated-frame-selection"
                @click="toggleFrameSection('selection')"
              >
                <span class="engine-section__title">{{ $t('automatedPlayground.selection') }}</span>
                <PhCaretDown
                  v-if="collapsedFrameSections.selection"
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
              <div
                v-show="!collapsedFrameSections.selection"
                id="automated-frame-selection"
                class="engine-section__body"
              >
              <SelectionInspectorPanel
                v-if="selectedFrameHex"
                variant="engine"
                a11y-instance-id="automated-playground"
                :selected-hex="selectedFrameHex"
                :selected-unit="selectedFrameUnit"
                :show-floating-panel="false"
                :actions-disabled="true"
                :show-actions="false"
                :show-keyboard-hints="false"
                :show-floating-toggle="false"
                @deselect="clearFrameSelection"
              />
              <div v-else class="automated-playground__selection-empty">
                {{ $t('automatedPlayground.noSelection') }}
              </div>
              </div>
            </section>

            <section
              class="automated-playground__inspector-section engine-section"
              :class="{ 'is-collapsed': collapsedFrameSections.terrain }"
            >
              <button
                type="button"
                class="engine-section__header"
                :aria-expanded="String(!collapsedFrameSections.terrain)"
                aria-controls="automated-frame-terrain"
                @click="toggleFrameSection('terrain')"
              >
                <span class="engine-section__title">{{ $t('levelBuilder.mapBuilder.terrainLegend') }}</span>
                <PhCaretDown
                  v-if="collapsedFrameSections.terrain"
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
              <div
                v-show="!collapsedFrameSections.terrain"
                id="automated-frame-terrain"
                class="engine-section__body"
              >
                <TerrainLegendBlock
                  :terrain-types="frameTerrainTypes"
                  :hexes="frameHexEntries"
                  :selected-terrain-id="selectedFrameTerrainId"
                  :show-title="false"
                />
              </div>
            </section>
          </aside>

          <aside ref="runPanel" class="automated-playground__run-panel">
            <section
              class="automated-playground__setup engine-section"
              :class="{ 'is-collapsed': setupCollapsed }"
              :aria-label="$t('automatedPlayground.setup')"
            >
              <button
                type="button"
                class="engine-section__header automated-playground__setup-header"
                :aria-expanded="String(!setupCollapsed)"
                aria-controls="automated-run-setup"
                @click="toggleSetupSection"
              >
                <span class="engine-section__heading">
                  <span class="engine-section__title">{{ $t('automatedPlayground.setup') }}</span>
                  <span v-if="runResult" class="engine-section__subtitle">
                    {{ runResult.winner || '-' }} / {{ outcomeReasonLabel(runResult.reason) }}
                  </span>
                </span>
                <PhCaretDown
                  v-if="setupCollapsed"
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

              <div
                v-show="!setupCollapsed"
                id="automated-run-setup"
                class="engine-section__body automated-playground__setup-body"
              >
              <div class="automated-playground__setup-grid">
                <div class="automated-playground__level-row">
                  <label class="automated-playground__field" for="automated-level-select">
                    <span>{{ $t('automatedPlayground.level') }}</span>
                    <select
                      id="automated-level-select"
                      class="automated-playground__field-control"
                      v-model="selectedLevelKey"
                      :disabled="levelLoading || automationRunning"
                    >
                      <option
                        v-for="level in levelOptions"
                        :key="level.key"
                        :value="level.key"
                      >
                        {{ level.label }} - {{ levelSourceLabel(level.source) }}
                      </option>
                    </select>
                  </label>
                  <button
                    type="button"
                    class="automated-playground__level-upload-button"
                    :disabled="automationRunning"
                    :title="$t('gameplay.engine.browseLevelZip')"
                    :aria-label="$t('gameplay.engine.browseLevelZip')"
                    @click="openLevelArchiveImport"
                  >
                    <PhUploadSimple :size="17" weight="bold" aria-hidden="true" />
                    <span>{{ $t('gameplay.engine.browseLevelZip') }}</span>
                  </button>
                  <input
                    ref="levelArchiveFileInput"
                    class="automated-playground__file-input"
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    @change="handleLevelArchiveImport"
                  />
                </div>
                <label class="automated-playground__field automated-playground__field--wide">
                  <span>{{ $t('automatedPlayground.maxTurns') }}</span>
                  <input
                    class="automated-playground__field-control automated-playground__field-control--number"
                    type="number"
                    min="1"
                    max="999"
                    :value="runConfig.maxTurns"
                    :disabled="automationRunning"
                    @input="updateRunField('maxTurns', $event.target.valueAsNumber)"
                  />
                  <p class="automated-playground__max-turns-hint">
                    {{ $t('automatedPlayground.maxTurnsHint') }}
                  </p>
                </label>
              </div>

              <div
                class="automated-playground__trace-actions"
                role="group"
                :aria-label="$t('automatedPlayground.traceActions')"
              >
                <div class="automated-playground__trace-action-row">
                  <button
                    type="button"
                    class="automated-playground__action-button automated-playground__trace-action"
                    :disabled="!trace"
                    :title="$t('automatedPlayground.exportTraceTitle')"
                    @click="exportTrace"
                  >
                    <PhDownloadSimple :size="17" weight="bold" aria-hidden="true" />
                    <span>{{ $t('automatedPlayground.exportTraceShort') }}</span>
                  </button>
                  <button
                    type="button"
                    class="automated-playground__action-button automated-playground__trace-action"
                    :title="$t('automatedPlayground.importTraceTitle')"
                    @click="openTraceImport"
                  >
                    <PhUploadSimple :size="17" weight="bold" aria-hidden="true" />
                    <span>{{ $t('automatedPlayground.importTraceShort') }}</span>
                  </button>
                </div>
                <p class="automated-playground__trace-hint">
                  {{ $t('automatedPlayground.traceActionsHint') }}
                </p>
                <input
                  ref="traceFileInput"
                  class="automated-playground__file-input"
                  type="file"
                  accept=".json,application/json"
                  @change="handleTraceImport"
                />
              </div>

              <p v-if="levelError" class="automated-playground__setup-error" role="alert">{{ levelError }}</p>
              </div>
            </section>

            <section class="automated-playground__results-panel" :aria-label="$t('automatedPlayground.gameResults')">
              <div class="block-header-with-status">
                <h3>{{ $t('automatedPlayground.gameResults') }}</h3>
                <div class="header-status">
                  <button
                    type="button"
                    class="automated-playground__text-button"
                    :disabled="runHistory.length === 0"
                    :title="$t('automatedPlayground.resetGameResultsTitle')"
                    @click="resetRunHistory"
                  >
                    {{ $t('automatedPlayground.resetGameResults') }}
                  </button>
                </div>
              </div>

              <div class="content-container-flex automated-playground__results-content">
                <TabContainer
                  class="automated-playground__results-tabs"
                  :tabs="resultTabs"
                  :initial-tab="resultsTab"
                  @tab-change="setResultsTab"
                >
                  <template #default="{ activeTab }">
                    <div v-if="activeTab === 'timeline'" class="automated-playground__games-timeline" role="tabpanel">
                      <div class="automated-playground__setup-grid automated-playground__timeline-config">
                        <label class="automated-playground__field">
                          <span>{{ $t('automatedPlayground.blueProfile') }}</span>
                          <select
                            class="automated-playground__field-control"
                            :value="playerProfile('player1')"
                            :disabled="automationRunning"
                            @change="updateRunPlayer('player1', $event.target.value)"
                          >
                            <option v-for="profile in profiles" :key="profile" :value="profile">
                              {{ profileLabel(profile) }}
                            </option>
                          </select>
                        </label>
                        <label class="automated-playground__field">
                          <span>{{ $t('automatedPlayground.redProfile') }}</span>
                          <select
                            class="automated-playground__field-control"
                            :value="playerProfile('player2')"
                            :disabled="automationRunning"
                            @change="updateRunPlayer('player2', $event.target.value)"
                          >
                            <option v-for="profile in profiles" :key="profile" :value="profile">
                              {{ profileLabel(profile) }}
                            </option>
                          </select>
                        </label>
                        <div class="automated-playground__field automated-playground__field--wide">
                          <span>{{ $t('automatedPlayground.seed') }}</span>
                          <div class="automated-playground__seed-row">
                            <input
                              class="automated-playground__seed-input"
                              type="text"
                              :value="runConfig.seed"
                              :disabled="automationRunning"
                              :readonly="seedLocked"
                              @input="updateRunField('seed', $event.target.value)"
                              @change="commitSeedInput($event.target.value)"
                              @keydown.enter.prevent="commitSeedInput($event.target.value)"
                            />
                            <button
                              type="button"
                              class="automated-playground__seed-lock"
                              :class="{ 'automated-playground__seed-lock--locked': seedLocked }"
                              :aria-label="seedLockButtonLabel"
                              :aria-pressed="String(seedLocked)"
                              :title="seedLockButtonLabel"
                              :disabled="automationRunning"
                              @click="toggleSeedLock"
                            >
                              <PhLockKey v-if="seedLocked" :size="17" weight="bold" aria-hidden="true" />
                              <PhLockKeyOpen v-else :size="17" weight="bold" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div v-if="runHistory.length === 0" class="automated-playground__selection-empty">
                        {{ $t('automatedPlayground.noGames') }}
                      </div>
                      <div class="automated-playground__setup-actions">
                        <button
                          type="button"
                          class="automated-playground__action-button automated-playground__action-button--primary"
                          :disabled="!canRunMatch"
                          @click="runAutomatedMatch"
                        >
                          {{ automationRunning ? $t('automatedPlayground.running') : $t('automatedPlayground.runMatch') }}
                        </button>
                        <button
                          v-if="hasActivePlayback"
                          type="button"
                          class="automated-playground__reset-run-button"
                          :disabled="automationRunning"
                          :title="$t('automatedPlayground.clearPlaybackTitle')"
                          @click="resetRunSetup"
                        >
                          <PhSelectionSlash :size="16" weight="bold" aria-hidden="true" />
                          {{ $t('automatedPlayground.clearPlayback') }}
                        </button>
                      </div>
                      <p v-if="runError" class="automated-playground__setup-error" role="alert">{{ runError }}</p>
                      <section
                        v-for="record in timelineRunHistory"
                        :key="record.id"
                        class="automated-playground__run-record engine-section"
                        :class="{ 'is-collapsed': expandedRunId !== record.id }"
                      >
                        <button
                          type="button"
                          class="engine-section__header"
                          :aria-expanded="String(expandedRunId === record.id)"
                          :aria-controls="`automated-run-record-${record.id}`"
                          @click="toggleRunRecord(record.id)"
                        >
                          <span class="engine-section__heading">
                            <span class="engine-section__title">{{ $t('automatedPlayground.gameRun') }} #{{ record.number }}</span>
                            <span class="engine-section__subtitle">{{ formatRunRecordSubtitle(record) }}</span>
                            <span
                              v-if="record.traceId === currentTraceId"
                              class="automated-playground__run-record-badge"
                            >{{ $t('automatedPlayground.nowShowing') }}</span>
                          </span>
                          <span class="automated-playground__run-record-status">
                            <PhCaretDown
                              v-if="expandedRunId !== record.id"
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
                          </span>
                        </button>
                        <div
                          v-show="expandedRunId === record.id"
                          :id="`automated-run-record-${record.id}`"
                          class="engine-section__body"
                        >
                          <dl class="automated-playground__facts automated-playground__facts--compact">
                            <div><dt>{{ $t('automatedPlayground.winner') }}</dt><dd>{{ record.winner || '-' }}</dd></div>
                            <div><dt>{{ $t('automatedPlayground.reason') }}</dt><dd>{{ outcomeReasonLabel(record.reason) }}</dd></div>
                            <div><dt>{{ $t('automatedPlayground.seed') }}</dt><dd>{{ record.seed || '-' }}</dd></div>
                            <div><dt>{{ $t('automatedPlayground.turns') }}</dt><dd>{{ record.turns ?? '-' }}</dd></div>
                            <div><dt>{{ $t('automatedPlayground.frames') }}</dt><dd>{{ record.frames ?? '-' }}</dd></div>
                            <div><dt>{{ $t('automatedPlayground.level') }}</dt><dd>{{ record.levelLabel || record.levelId || '-' }}</dd></div>
                          </dl>
                          <button
                            v-if="record.traceId !== currentTraceId"
                            type="button"
                            class="automated-playground__action-button automated-playground__show-run-button"
                            :disabled="automationRunning"
                            @click="showRunRecord(record)"
                          >
                            {{ $t('automatedPlayground.showRun') }}
                          </button>
                        </div>
                      </section>
                    </div>

                    <div v-else class="automated-playground__summary-table-wrap" role="tabpanel">
                      <table class="automated-playground__summary-table">
                        <tbody>
                          <tr><th>{{ $t('automatedPlayground.gamesRun') }}</th><td>{{ runSummary.games }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.player1Winrate') }}</th><td>{{ runSummary.player1Winrate }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.player2Winrate') }}</th><td>{{ runSummary.player2Winrate }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.draws') }}</th><td>{{ runSummary.draws }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.minTurns') }}</th><td>{{ runSummary.minTurns }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.avgTurns') }}</th><td>{{ runSummary.avgTurns }}</td></tr>
                          <tr><th>{{ $t('automatedPlayground.maxTurns') }}</th><td>{{ runSummary.maxTurns }}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </template>
                </TabContainer>
              </div>
            </section>
          </aside>
        </section>
      </template>
    </main>
  </div>
</template>

<script>
import { markRaw } from 'vue'
import { resizableLayoutMixin } from '../ui/layout/resizableLayoutMixin.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'
import { normalizeDiceFaceForUi } from '../utils/diceUi.js'
import HeaderComponent from '../components/HeaderComponent.vue'
import TabContainer from '../components/TabContainer.vue'
import GameMapBlock from '../components/GameMapBlock.vue'
import SelectionInspectorPanel from '../components/SelectionInspectorPanel.vue'
import TerrainLegendBlock from '../components/TerrainLegendBlock.vue'
import {
  PhCaretDown,
  PhCaretUp,
  PhDownloadSimple,
  PhFastForward,
  PhLockKey,
  PhLockKeyOpen,
  PhPause,
  PhPlay,
  PhRewind,
  PhSelectionSlash,
  PhSkipBack,
  PhSkipForward,
  PhUploadSimple
} from '@phosphor-icons/vue'
import { loadLevelPackage } from '../domain/level/loadLevelPackage.js'
import { loadLevelArchivePackage } from '../domain/level/loadLevelArchivePackage.js'
import {
  BUILDER_PLAYTEST_QUERY_KEY,
  consumeBuilderPlaytestHandoff,
  loadPersistedBuilderPlaytestLevels
} from '../domain/level/builderPlaytestLevels.js'
import { runConfiguredMatch } from '../domain/simulation/runConfiguredMatch.js'
import {
  buildGameStateFromLevelPackage,
  diceFaceFromActions,
  hasEngineDynamicSnapshot,
  hasFrameDynamicSnapshot,
  isSimulationTrace,
  normalizeTraceForPlayback
} from '../domain/simulation/tracePlayback.js'
import {
  removeStoredSimulationTraces,
  TRACE_QUOTA_MESSAGE
} from '../domain/simulation/traceStorage'
import {
  appendTraceToHistory,
  clearTraceHistory,
  readBuilderEpoch,
  readTraceFromHistory,
  readTraceHistoryIndex
} from '../domain/simulation/traceHistory.js'
import { STRATEGY_PROFILES } from '../domain/simulation/strategyProfiles.js'
import { GameState } from '@/domain/engine/gameState.js'
import { normalizeOperations } from '../utils/uiMoveTable.js'
import {
  UNIT_CARD_HEX_POINTS,
  isUnitAlive,
  normalizeUnitHealth,
  computeUnitProgress,
  computeUnitPreview
} from '../ui/unitPreview.js'
import UnitPreviewCard from '../components/UnitPreviewCard.vue'
import AvailableActionsTable from '../components/AvailableActionsTable.vue'

const DEFAULT_LEVEL_ID = 'level_000'
const DEFAULT_MAX_TURNS = 100

function asEntries(value) {
  return Array.isArray(value) ? value : []
}

function normalizePlaybackHexEntries(entries) {
  return asEntries(entries).map(entry => {
    if (!Array.isArray(entry) || entry.length < 2) return entry
    const [key, hex] = entry
    if (!hex || typeof hex !== 'object' || Object.prototype.hasOwnProperty.call(hex, 'passable')) {
      return entry
    }
    return [key, { ...hex, passable: true }]
  })
}

function clampIndex(value, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.trunc(n)))
}

function timestampForFilename(value) {
  const source = typeof value === 'string' && value ? value : new Date().toISOString()
  return source.slice(0, 19).replace(/[T:]/g, '-')
}

export default {
  name: 'AutomatedPlayground',
  mixins: [resizableLayoutMixin, i18nTextMixin],
  resizableLayoutConfig: {
    storageKey: 'hexWarAutomatedLayout',
    desktopMinWidth: 1181,
    splitterSize: 16,
    reservedRefs: ['runPanel'],
    reservedWidth: 16,
    containerRef: 'workspace',
    columns: {
      board: { min: 520, max: 1080, defaultRatio: 0.62 },
      inspector: { min: 300, max: 800, defaultRatio: 0.38 }
    },
    rows: {},
    splitters: [
      {
        key: 'board-inspector',
        orientation: 'vertical',
        before: 'board',
        after: 'inspector',
        className: 'playground-splitter--board-inspector',
        labelKey: 'automatedPlayground.splitterBoardInspector',
        label: 'Resize board and inspector panels'
      }
    ],
    cssVars: {
      columns: {
        board: '--layout-board-width',
        inspector: '--layout-inspector-width'
      },
      rows: {}
    }
  },
  components: {
    HeaderComponent,
    TabContainer,
    GameMapBlock,
    SelectionInspectorPanel,
    TerrainLegendBlock,
    UnitPreviewCard,
    AvailableActionsTable,
    PhCaretDown,
    PhCaretUp,
    PhDownloadSimple,
    PhFastForward,
    PhLockKey,
    PhLockKeyOpen,
    PhPause,
    PhPlay,
    PhRewind,
    PhSelectionSlash,
    PhSkipBack,
    PhSkipForward,
    PhUploadSimple
  },
  data() {
    return {
      trace: null,
      currentTraceId: '',
      traceError: '',
      importError: '',
      frameIndex: 0,
      playing: false,
      timerId: null,
      speedMs: 500,
      defaultLevelPackage: null,
      builderLevels: [],
      uploadedLevels: [],
      selectedLevelKey: '',
      levelLoading: false,
      levelError: '',
      runConfig: {
        seed: '',
        maxTurns: DEFAULT_MAX_TURNS,
        players: {
          player1: { profile: STRATEGY_PROFILES.BALANCED },
          player2: { profile: STRATEGY_PROFILES.BALANCED }
        },
        trace: true
      },
      seedLocked: false,
      automationRunning: false,
      runResult: null,
      runError: '',
      selectedTraceHex: null,
      unitPreviewHoverIntent: { unitId: null, seq: 0 },
      setupCollapsed: false,
      collapsedFrameSections: {
        frame: false,
        units: false,
        actions: false,
        selection: false,
        terrain: false
      },
      runHistory: [],
      resultsTab: 'timeline',
      expandedRunId: ''
    }
  },
  computed: {
    profiles() {
      return Object.values(STRATEGY_PROFILES)
    },
    resultTabs() {
      return [
        {
          id: 'timeline',
          labelKey: 'automatedPlayground.gamesTimeline',
          label: 'Games timeline'
        },
        {
          id: 'summary',
          labelKey: 'automatedPlayground.summary',
          label: 'Summary'
        }
      ]
    },
    unitCardHexPoints() {
      return UNIT_CARD_HEX_POINTS
    },
    levelOptions() {
      const options = []
      options.push({
        key: `default:${DEFAULT_LEVEL_ID}`,
        id: DEFAULT_LEVEL_ID,
        label: DEFAULT_LEVEL_ID,
        source: 'default',
        package: this.defaultLevelPackage
      })
      for (const level of this.builderLevels) {
        options.push(level)
      }
      for (const level of this.uploadedLevels) {
        options.push(level)
      }
      return options
    },
    selectedLevelOption() {
      return this.levelOptions.find(level => level.key === this.selectedLevelKey) || this.levelOptions[0] || null
    },
    selectedLevelPackage() {
      const option = this.selectedLevelOption
      return option && option.package ? option.package : null
    },
    selectedLevelId() {
      const option = this.selectedLevelOption
      return option && option.id ? option.id : DEFAULT_LEVEL_ID
    },
    canRunMatch() {
      return Boolean(this.selectedLevelPackage) && !this.levelLoading && !this.automationRunning
    },
    hasActivePlayback() {
      return Boolean(this.trace)
    },
    frames() {
      return this.trace && Array.isArray(this.trace.frames) ? this.trace.frames : []
    },
    frameSliderMax() {
      return Math.max(0, this.frames.length - 1)
    },
    currentFrame() {
      return this.frames[this.frameIndex] || {}
    },
    playbackSnapshotFrameIndex() {
      if (this.frames.length === 0) return -1
      if (hasFrameDynamicSnapshot(this.currentFrame)) return this.frameIndex
      for (let i = this.frameIndex - 1; i >= 0; i -= 1) {
        if (hasFrameDynamicSnapshot(this.frames[i])) return i
      }
      if (hasEngineDynamicSnapshot(this.levelPackageSnapshotEngine)) return -1
      for (let i = this.frameIndex + 1; i < this.frames.length; i += 1) {
        if (hasFrameDynamicSnapshot(this.frames[i])) return i
      }
      return -1
    },
    playbackSnapshotFrame() {
      return this.playbackSnapshotFrameIndex >= 0 ? this.frames[this.playbackSnapshotFrameIndex] : {}
    },
    // Static board reconstructed ONCE per trace: depends only on the immutable
    // levelPackage, never on the current frame. Building a full `new GameState`
    // (init hexes, place units, evaluate objectives) is the expensive step, so
    // it must not recompute on every frame step. The board geometry / spawn
    // flags this produces are frame-independent; only the dynamic top-level
    // fields (currentPlayer/turnNumber/dice) vary per frame, and those are
    // overlaid cheaply by `levelPackageSnapshotEngine` below.
    traceBoardSnapshotEngine() {
      if (!this.traceLevelPackage) return {}
      try {
        // Pass the trace's seed so the fallback board's `placeUnitsFromLevel`
        // reproduces the same spawn/unit layout the run used, instead of a fresh
        // Math.random() shuffle on every recompute. Constant per trace, so this
        // does not reintroduce the per-frame rebuild T21 removed.
        const seed = this.traceRunConfig.seed != null ? this.traceRunConfig.seed : undefined
        return buildGameStateFromLevelPackage(this.traceLevelPackage, {}, seed) || {}
      } catch (err) {
        console.warn('AutomatedPlayground: could not build level package board snapshot.', err)
        return {}
      }
    },
    levelPackageSnapshotEngine() {
      const board = this.traceBoardSnapshotEngine
      if (!board || typeof board !== 'object' || Object.keys(board).length === 0) return {}
      // Cheap per-frame overlay: re-derive the same `currentPlayer`/`turnNumber`/
      // dice the old frame-coupled build produced, without rebuilding GameState.
      const frame = this.currentFrame || {}
      const baseActions = Array.isArray(board.currentTurnActions) ? board.currentTurnActions : []
      const diceResult = normalizeDiceFaceForUi(frame.diceResult)
      const currentTurnActions = diceResult != null && !baseActions.some(action => action && action.type === 'dice_roll')
        ? [...baseActions, { type: 'dice_roll', result: diceResult }]
        : baseActions
      return {
        ...board,
        currentPlayer: frame.currentPlayer || frame.actingPlayer || 'player1',
        turnNumber: frame.turnNumber || 1,
        currentTurnActions
      }
    },
    snapshotEngine() {
      return this.playbackSnapshotFrame && this.playbackSnapshotFrame.engine
        ? this.playbackSnapshotFrame.engine
        : this.levelPackageSnapshotEngine
    },
    isUsingFallbackSnapshot() {
      return this.frames.length > 0 && !hasFrameDynamicSnapshot(this.currentFrame) && this.frameHexEntries.length > 0
    },
    currentEngine() {
      return this.currentFrame && this.currentFrame.engine ? this.currentFrame.engine : {}
    },
    traceLevelPackage() {
      return this.trace && this.trace.levelPackage
        ? this.trace.levelPackage
        : this.selectedLevelPackage
    },
    traceResult() {
      return this.trace && this.trace.result ? this.trace.result : {}
    },
    traceRunConfig() {
      return this.trace && this.trace.runConfig ? this.trace.runConfig : {}
    },
    frameHexEntries() {
      // Soft geometry source: legacy (v1) frames embed their own `hexes`, so use
      // them when present. schemaVersion 2 frames carry dynamic state only, so we
      // merge in the static board reconstructed once from trace.levelPackage.
      const frameHexes = this.snapshotEngine && Array.isArray(this.snapshotEngine.hexes)
        ? this.snapshotEngine.hexes
        : null
      const source = frameHexes && frameHexes.length > 0
        ? frameHexes
        : this.traceBoardSnapshotEngine.hexes
      return normalizePlaybackHexEntries(source)
    },
    frameTerrainTypes() {
      const pkgTypes = this.traceLevelPackage &&
        this.traceLevelPackage.terrain &&
        Array.isArray(this.traceLevelPackage.terrain.terrainTypes)
        ? this.traceLevelPackage.terrain.terrainTypes
        : []
      if (pkgTypes.length > 0) return pkgTypes

      const terrainById = new Map()
      for (const [, hex] of this.frameHexEntries) {
        const terrain = hex && hex.terrain
        if (!terrain || typeof terrain !== 'object' || !terrain.id) continue
        if (!terrainById.has(terrain.id)) terrainById.set(terrain.id, terrain)
      }
      return Array.from(terrainById.values())
    },
    frameGameState() {
      if (this.frameHexEntries.length === 0) return null
      try {
        return GameState.fromJSON(this.hydratedFrameEngine)
      } catch (err) {
        console.warn('AutomatedPlayground: could not hydrate frame game state.', err)
        return null
      }
    },
    hydratedFrameEngine() {
      const engine = this.snapshotEngine || {}
      const dimensions = this.deriveFrameDimensions(engine)
      const pkg = this.traceLevelPackage || {}
      return {
        width: engine.width || dimensions.width,
        height: engine.height || dimensions.height,
        currentPlayer: this.playbackCurrentPlayer,
        turnNumber: engine.turnNumber || this.currentFrame.turnNumber || 1,
        gamePhase: engine.gamePhase || 'MANOEUVRE',
        outcome: engine.outcome || null,
        hexes: this.frameHexEntries,
        units: asEntries(engine.units),
        turnState: engine.turnState || {},
        currentTurnActions: engine.currentTurnActions || [],
        turntable: engine.turntable || pkg.turntable || null,
        objectives: engine.objectives || pkg.objectives || null
      }
    },
    playbackCurrentPlayer() {
      const command = this.currentFrame && this.currentFrame.command
      if (command && command.type === 'endTurn' && this.currentFrame.actingPlayer) {
        return this.currentFrame.actingPlayer
      }
      return this.currentFrame.actingPlayer ||
        this.currentFrame.currentPlayer ||
        this.currentEngine.currentPlayer ||
        this.snapshotEngine.currentPlayer ||
        'player1'
    },
    unitRows() {
      return asEntries(this.snapshotEngine.units)
        .map(([, unit]) => unit)
        .filter(unit => unit && unit.id != null)
        .map((unit, index) => ({ unit, index, alive: isUnitAlive(unit) }))
        .sort((a, b) => {
          if (a.alive !== b.alive) return a.alive ? -1 : 1
          return a.index - b.index
        })
        .map(row => row.unit)
    },
    unitGroups() {
      return ['player1', 'player2'].map(player => ({
        player,
        label: player === 'player2'
          ? this.uiText('common.player2', 'Player 2')
          : this.uiText('common.player1', 'Player 1'),
        previews: this.unitRows
          .filter(unit => String(unit.player) === player)
          .map(unit => this.makeUnitPreview(unit))
      }))
    },
    currentPlayerKey() {
      const player = this.currentFrame.actingPlayer ||
        this.currentFrame.currentPlayer ||
        this.currentEngine.currentPlayer ||
        this.snapshotEngine.currentPlayer
      return player === 'player2' ? 'player2' : 'player1'
    },
    availableActionsSourceKey() {
      return this.currentPlayerKey === 'player2' ? 'Enemy_operations' : 'Our_operations'
    },
    availableActionsShowPriority() {
      return this.currentPlayerKey === 'player2'
    },
    currentFrameDiceFace() {
      const frameFace = normalizeDiceFaceForUi(this.currentFrame.diceResult)
      if (frameFace != null) return frameFace
      return diceFaceFromActions(this.hydratedFrameEngine.currentTurnActions)
    },
    availableDiceIndex() {
      const face = this.currentFrameDiceFace
      return face == null ? null : face - 1
    },
    availableDiceLabel() {
      return this.availableDiceIndex == null ? 'd?' : `d${this.availableDiceIndex + 1}`
    },
    availableActionOperations() {
      const table = this.hydratedFrameEngine.turntable || {}
      return normalizeOperations(table[this.availableActionsSourceKey], this.availableActionsSourceKey)
    },
    seedLockButtonLabel() {
      return this.seedLocked
        ? this.uiText('automatedPlayground.unlockSeed', 'Unlock seed')
        : this.uiText('automatedPlayground.lockSeed', 'Lock seed')
    },
    frameMapKey() {
      // Stable PER TRACE (no frameIndex): remounting GameMapBlock every frame
      // would rebuild all SVG geometry each tick. Instead the map updates via
      // its `gameState` prop watcher — `frameGameState` is a fresh GameState
      // instance per frame, so the prop reference changes and the watcher
      // re-syncs the board without a remount.
      return this.currentTraceId || (this.trace && this.trace.createdAt) || 'trace'
    },
    timelineRunHistory() {
      return [...this.runHistory].reverse()
    },
    runSummary() {
      const games = this.runHistory.length
      if (games === 0) {
        return {
          games: 0,
          player1Winrate: '0%',
          player2Winrate: '0%',
          draws: 0,
          minTurns: '-',
          avgTurns: '-',
          maxTurns: '-'
        }
      }
      const turns = this.runHistory
        .map(record => Number(record.turns))
        .filter(value => Number.isFinite(value))
      const player1Wins = this.runHistory.filter(record => record.winner === 'player1').length
      const player2Wins = this.runHistory.filter(record => record.winner === 'player2').length
      const draws = games - player1Wins - player2Wins
      const pct = count => `${Math.round((count / games) * 100)}%`
      const avg = turns.length > 0 ? turns.reduce((sum, value) => sum + value, 0) / turns.length : null
      return {
        games,
        player1Winrate: pct(player1Wins),
        player2Winrate: pct(player2Wins),
        draws,
        minTurns: turns.length > 0 ? Math.min(...turns) : '-',
        avgTurns: avg == null ? '-' : Number(avg.toFixed(1)),
        maxTurns: turns.length > 0 ? Math.max(...turns) : '-'
      }
    },
    selectedFrameHex() {
      if (!this.selectedTraceHex || !this.frameGameState || typeof this.frameGameState.getHex !== 'function') return null
      const q = Number(this.selectedTraceHex.q)
      const r = Number(this.selectedTraceHex.r)
      if (!Number.isFinite(q) || !Number.isFinite(r)) return null
      const hex = this.frameGameState.getHex(q, r)
      if (!hex) return null
      return {
        q,
        r,
        terrain: hex.terrain,
        player1Spawn: hex.player1Spawn === true,
        player1Base: hex.player1Base === true,
        player2Spawn: hex.player2Spawn === true,
        player2Base: hex.player2Base === true
      }
    },
    selectedFrameUnit() {
      if (!this.selectedFrameHex || !this.frameGameState || typeof this.frameGameState.getHex !== 'function') return null
      const hex = this.frameGameState.getHex(this.selectedFrameHex.q, this.selectedFrameHex.r)
      return hex && hex.unit ? hex.unit : null
    },
    selectedFrameTerrainId() {
      return this.selectedFrameHex &&
        this.selectedFrameHex.terrain &&
        this.selectedFrameHex.terrain.id
        ? this.selectedFrameHex.terrain.id
        : null
    },
    commandLabel() {
      if (this.currentFrame.event === 'diceRoll') return `roll:${this.availableDiceLabel}`
      const command = this.currentFrame.command
      if (!command || typeof command !== 'object') return '-'
      if (command.type === 'endTurn') return 'endTurn'
      if (command.unitId) return `${command.type}:${command.unitId}`
      return command.type || '-'
    },
    canStepBack() {
      return this.frames.length > 0 && this.frameIndex > 0
    },
    canStepForward() {
      return this.frames.length > 0 && this.frameIndex < this.frames.length - 1
    }
  },
  watch: {
    '$route.query.trace': 'loadTrace',
    selectedLevelKey() {
      // Skip the mount-time set (initializeLevelSetup assigns the default key),
      // which would otherwise reset + clear the just-hydrated history store
      // before mounted() reads it. Only a genuine post-setup level change runs
      // the reset.
      if (!this._levelSetupReady) return
      this.levelError = ''
      this.runError = ''
      this.resetRunHistory()
      if (!this.seedLocked) {
        this.applyDefaultSeedForSelectedLevel()
      }
    },
    speedMs() {
      if (this.playing) {
        this.stopPlayback()
        this.startPlayback()
      }
    }
  },
  created() {
    // Non-reactive teardown handles — intentionally NOT in data() so Vue
    // does not make them reactive; set here for clarity / lint-safety.
    this._isUnmounted = false
    this._activeTraceReader = null
    // rAF coalescing for the slider scrub (#6a): non-reactive scratch fields.
    this._pendingFrameIndex = null
    this._scrubRafHandle = null
    // Gates the selectedLevelKey watcher so the mount-time default-key
    // assignment does not reset/clear the hydrated history store.
    this._levelSetupReady = false
  },
  async mounted() {
    await this.initializeLevelSetup()
    // Hydrate the unified run history from the capped store so a remount shows
    // every prior run, not just the one referenced by ?trace=. Index entries
    // already carry the run-record shape, so they are used directly.
    if (typeof sessionStorage !== 'undefined') {
      this.runHistory = readTraceHistoryIndex(sessionStorage)
    }
    // #5.2: editing the level in the builder bumps the builder epoch. If any
    // stored builder run was recorded on a now-different level (its
    // levelFingerprint != the current builder epoch), the history is stale —
    // clear it so the user isn't shown traces for an old level version.
    if (typeof sessionStorage !== 'undefined') {
      const epoch = readBuilderEpoch(sessionStorage)
      const hasStaleBuilderRun = !!epoch && this.runHistory.some(
        r => r.source === 'builder' && r.levelFingerprint && r.levelFingerprint !== epoch
      )
      if (hasStaleBuilderRun) {
        clearTraceHistory(sessionStorage)
        this.runHistory = []
      }
    }
    this.loadTrace()
    // With no ?trace= in the route, default the board to the most recent run so
    // a remount isn't blank when history exists. Kept explicit here (not in the
    // loadTrace watcher path) so it never interferes with the redundant-reload
    // guard.
    const requestedTraceId = this.$route && this.$route.query ? this.$route.query.trace : ''
    if (!requestedTraceId && this.runHistory.length > 0 && !this.trace && typeof sessionStorage !== 'undefined') {
      const last = this.runHistory[this.runHistory.length - 1]
      const trace = readTraceFromHistory(sessionStorage, last.traceId)
      if (trace) {
        this.displayTrace(trace, last.traceId)
        this.expandedRunId = last.id
      }
    }
  },
  beforeUnmount() {
    // Guard against async FileReader callbacks (handleTraceImport) firing after
    // teardown — they would otherwise force-navigate the user back here.
    this._isUnmounted = true
    if (this._activeTraceReader && typeof this._activeTraceReader.abort === 'function') {
      try {
        this._activeTraceReader.abort()
      } catch (abortError) {
        // abort() can throw if the read already settled; safe to ignore.
      }
      this._activeTraceReader = null
    }
    this.stopPlayback()
    if (this._scrubRafHandle != null) {
      cancelAnimationFrame(this._scrubRafHandle)
      this._scrubRafHandle = null
    }
  },
  methods: {
    /**
     * Yield a real browser frame before the blocking synchronous compute.
     * $nextTick() flushes Vue's microtask queue so reactive bindings (e.g.
     * automationRunning) update their DOM; setTimeout(0) then crosses a task
     * boundary so the browser can actually repaint before the CPU-heavy match
     * engine runs. Both awaits are required — one alone is insufficient.
     */
    async awaitPaint() {
      await this.$nextTick()
      await new Promise(resolve => setTimeout(resolve))
    },
    toggleSetupSection() {
      this.setupCollapsed = !this.setupCollapsed
    },
    toggleFrameSection(section) {
      if (!section || !Object.prototype.hasOwnProperty.call(this.collapsedFrameSections, section)) return
      this.collapsedFrameSections = {
        ...this.collapsedFrameSections,
        [section]: !this.collapsedFrameSections[section]
      }
    },
    deriveFrameDimensions(engine) {
      const hexes = asEntries(engine && engine.hexes)
      let maxQ = -1
      let maxR = -1
      for (const [, hex] of hexes) {
        const q = Number(hex && hex.q)
        const r = Number(hex && hex.r)
        if (Number.isFinite(q)) maxQ = Math.max(maxQ, q)
        if (Number.isFinite(r)) maxR = Math.max(maxR, r)
      }
      return {
        width: maxQ >= 0 ? maxQ + 1 : 0,
        height: maxR >= 0 ? maxR + 1 : 0
      }
    },
    onFrameHexSelected(hex) {
      this.selectedTraceHex = hex && Number.isFinite(Number(hex.q)) && Number.isFinite(Number(hex.r))
        ? { q: Number(hex.q), r: Number(hex.r) }
        : null
    },
    clearFrameSelection() {
      this.selectedTraceHex = null
    },
    selectUnitPreview(unit) {
      const pos = unit && unit.position
      if (!pos || !Number.isFinite(Number(pos.q)) || !Number.isFinite(Number(pos.r))) return
      this.selectedTraceHex = { q: Number(pos.q), r: Number(pos.r) }
    },
    onUnitPreviewHover(unitId) {
      const normalized = typeof unitId === 'string' && unitId.trim() ? unitId.trim() : null
      this.unitPreviewHoverIntent = {
        unitId: normalized,
        seq: this.unitPreviewHoverIntent.seq + 1
      }
    },
    resetRunHistory() {
      this.runHistory = []
      this.expandedRunId = ''
      this.runResult = null
      if (typeof sessionStorage !== 'undefined') {
        clearTraceHistory(sessionStorage)
      }
    },
    resetRunSetup() {
      this.stopPlayback()
      this.trace = null
      this.currentTraceId = ''
      this.traceError = ''
      this.importError = ''
      this.runResult = null
      this.runError = ''
      this.frameIndex = 0
      this.selectedTraceHex = null
      // Reclaim the session-storage budget: only one playback trace is kept at a
      // time, so clearing the prefix frees what this page occupies (the source of
      // the "session storage is full" message).
      if (typeof sessionStorage !== 'undefined') {
        removeStoredSimulationTraces(sessionStorage)
      }
      if (this.$router && typeof this.$router.replace === 'function') {
        const navigation = this.$router.replace({ path: '/AutomatedPlayground' })
        if (navigation && typeof navigation.catch === 'function') navigation.catch(() => {})
      }
    },
    formatRunRecordSubtitle(record) {
      const winner = record && record.winner != null ? String(record.winner).trim() : ''
      const rawReason = record && record.reason != null ? String(record.reason).trim() : ''
      const reason = rawReason ? this.outcomeReasonLabel(rawReason) : ''
      const parts = [winner, reason].filter(Boolean)
      return parts.length > 0 ? parts.join(' / ') : '-'
    },
    outcomeReasonLabel(reason) {
      return this.uiText('automatedPlayground.reasonLabels.' + reason, reason || '-')
    },
    formatLevelIssues(issues) {
      if (!Array.isArray(issues) || issues.length === 0) return ''
      return issues
        .filter(issue => issue && typeof issue === 'object')
        .map(issue => {
          const path = typeof issue.path === 'string' && issue.path ? `${issue.path}: ` : ''
          const message = typeof issue.message === 'string' ? issue.message : 'unknown issue'
          return `${path}${message}`
        })
        .join('; ')
    },
    defaultSeedForLevelId(levelId) {
      const safe = typeof levelId === 'string' && levelId.trim() ? levelId.trim() : DEFAULT_LEVEL_ID
      const time = Date.now().toString(36)
      const entropy = Math.random().toString(36).slice(2, 8)
      return `automated-${safe}-${time}-${entropy}`
    },
    applyDefaultSeedForSelectedLevel() {
      this.runConfig = {
        ...this.runConfig,
        seed: this.defaultSeedForLevelId(this.selectedLevelId)
      }
    },
    prepareSeedForRun() {
      if (!this.seedLocked || !this.runConfig.seed) {
        this.applyDefaultSeedForSelectedLevel()
      }
      return this.runConfig.seed
    },
    commitSeedInput(value) {
      this.updateRunConfig({ seed: value })
      if (!this.seedLocked && typeof value === 'string' && value.trim()) {
        this.seedLocked = true
      }
    },
    toggleSeedLock() {
      this.seedLocked = !this.seedLocked
      if (!this.seedLocked) {
        this.applyDefaultSeedForSelectedLevel()
      }
    },
    normalizeLevelLabel(record, fallbackSource) {
      const id = record && typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : DEFAULT_LEVEL_ID
      const source = record && typeof record.source === 'string' && record.source
        ? record.source
        : fallbackSource
      const label = record && typeof record.label === 'string' && record.label.trim()
        ? record.label.trim()
        : id
      return { id, label, source }
    },
    makeBuilderLevelOption(record, index = 0) {
      const { id, label, source } = this.normalizeLevelLabel(record, 'builder')
      return {
        key: `builder:${id}:${record.updatedAt || record.createdAt || index}`,
        id,
        label,
        source,
        package: record.package,
        warnings: Array.isArray(record.warnings) ? record.warnings : []
      }
    },
    async initializeLevelSetup() {
      try {
        this.selectedLevelKey = this.selectedLevelKey || `default:${DEFAULT_LEVEL_ID}`
        this.loadBuilderLevelOptions()
        this.consumeBuilderLevelHandoff()
        this.applyDefaultSeedForSelectedLevel()
        await this.loadDefaultLevel()
      } finally {
        // Setup-driven selectedLevelKey assignments are done; from here a level
        // change is user-driven and should reset + clear history. Use finally so
        // a throw during setup can't leave this gate stuck false — that would
        // silently stop clearing history on every later user level change.
        this._levelSetupReady = true
      }
    },
    async loadDefaultLevel() {
      this.levelLoading = true
      try {
        const result = await loadLevelPackage(DEFAULT_LEVEL_ID)
        if (!result.ok) {
          this.defaultLevelPackage = null
          this.levelError = this.formatLevelIssues(result.errors)
          return false
        }
        this.defaultLevelPackage = result.package
        if (!this.selectedLevelKey) this.selectedLevelKey = `default:${DEFAULT_LEVEL_ID}`
        return true
      } catch (err) {
        this.defaultLevelPackage = null
        this.levelError = err && err.message ? err.message : String(err)
        return false
      } finally {
        this.levelLoading = false
      }
    },
    loadBuilderLevelOptions() {
      const records = loadPersistedBuilderPlaytestLevels()
      this.builderLevels = records.map((record, index) => this.makeBuilderLevelOption(record, index))
      if (!this.selectedLevelKey) this.selectedLevelKey = `default:${DEFAULT_LEVEL_ID}`
    },
    consumeBuilderLevelHandoff() {
      const query = this.$route && this.$route.query ? this.$route.query : {}
      const token = query ? query[BUILDER_PLAYTEST_QUERY_KEY] : ''
      if (typeof token !== 'string' || !token.trim()) return
      const record = consumeBuilderPlaytestHandoff(token)
      if (!record) return
      const option = this.makeBuilderLevelOption(record, 0)
      this.builderLevels = [
        option,
        ...this.builderLevels.filter(level => level.id !== option.id)
      ]
      this.selectedLevelKey = option.key
    },
    levelSourceLabel(source) {
      return this.uiText(`automatedPlayground.sources.${source}`, source || 'unknown')
    },
    playerProfile(player) {
      const players = this.runConfig && this.runConfig.players ? this.runConfig.players : {}
      return players[player] && players[player].profile
        ? players[player].profile
        : STRATEGY_PROFILES.BALANCED
    },
    profileLabel(profile) {
      return this.uiText(`levelBuilder.automatedPlaytest.profiles.${profile}`, profile)
    },
    // Per-page title (INTENTIONALLY divergent from GameEngineBlock's type+HP
    // title): AP shows the unit name + facing. Do not unify — see Finding #42
    // "KNOWN DRIFT".
    formatUnitPreviewTitle(unit) {
      if (!unit) return this.uiText('gameplay.engine.unitFallback', 'Unit')
      const label = unit.name || unit.id || this.uiText('gameplay.engine.unitFallback', 'Unit')
      const pos = unit.position && Number.isFinite(unit.position.q) && Number.isFinite(unit.position.r)
        ? `(${unit.position.q}, ${unit.position.r})`
        : ''
      const hp = normalizeUnitHealth(unit)
      const facing = unit.facing == null ? '-' : unit.facing
      const dead = isUnitAlive(unit) ? '' : this.uiText('gameplay.engine.destroyedSuffix', ' - destroyed')
      return `${label} ${pos} - HP ${hp.health}/${hp.max} - Facing ${facing}${dead}`
    },
    makeUnitPreview(unit) {
      const turnState = this.snapshotEngine && this.snapshotEngine.turnState
        ? this.snapshotEngine.turnState
        : {}
      const progress = computeUnitProgress(unit, turnState)
      return computeUnitPreview(unit, {
        turnState,
        isSelected: !!(
          this.selectedTraceHex &&
          unit.position &&
          Number(this.selectedTraceHex.q) === Number(unit.position.q) &&
          Number(this.selectedTraceHex.r) === Number(unit.position.r)
        ),
        title: this.formatUnitPreviewTitle(unit),
        progressLabel: this.uiText('gameplay.engine.actionsProgress', `Actions ${progress.normalizedActions}/${progress.normalizedMovement}`, {
          current: progress.normalizedActions,
          total: progress.normalizedMovement
        })
      })
    },
    updateRunConfig(patch) {
      if (!patch || typeof patch !== 'object') return
      const nextPlayers = patch.players && typeof patch.players === 'object'
        ? {
            ...this.runConfig.players,
            ...patch.players
          }
        : this.runConfig.players
      this.runConfig = {
        ...this.runConfig,
        ...patch,
        players: nextPlayers,
        trace: true
      }
    },
    updateRunPlayer(player, profile) {
      this.updateRunConfig({
        players: {
          [player]: { profile }
        }
      })
    },
    updateRunField(key, value) {
      if (key === 'seed') {
        this.updateRunConfig({ seed: value })
        return
      }
      if (key === 'maxTurns') {
        const next = Math.max(1, Math.min(999, Math.trunc(Number(value) || this.runConfig.maxTurns || 1)))
        this.updateRunConfig({ maxTurns: next })
      }
    },
    openLevelArchiveImport() {
      if (this.$refs.levelArchiveFileInput) this.$refs.levelArchiveFileInput.click()
    },
    async handleLevelArchiveImport(event) {
      const file = event.target && event.target.files ? event.target.files[0] : null
      if (!file) return
      try {
        const buffer = await file.arrayBuffer()
        this.registerUploadedLevel(new Uint8Array(buffer), file.name)
      } catch (err) {
        this.levelError = err && err.message ? err.message : String(err)
      } finally {
        event.target.value = ''
      }
    },
    registerUploadedLevel(bytes, sourceName = 'archive.zip') {
      const result = loadLevelArchivePackage(bytes, { sourceName })
      if (!result.ok) {
        this.levelError = this.formatLevelIssues(result.errors)
        return false
      }
      const pkg = result.package
      const id = pkg && typeof pkg.id === 'string' && pkg.id.trim()
        ? pkg.id.trim()
        : (result.archiveId || DEFAULT_LEVEL_ID)
      const key = `zip:${id}:${Date.now()}`
      const label = sourceName ? `${id} (${sourceName})` : id
      const option = {
        key,
        id,
        label,
        source: 'zip',
        package: pkg,
        warnings: Array.isArray(result.warnings) ? result.warnings : []
      }
      this.uploadedLevels = [
        option,
        ...this.uploadedLevels.filter(level => level.key !== key)
      ]
      this.selectedLevelKey = key
      this.levelError = option.warnings.length > 0 ? this.formatLevelIssues(option.warnings) : ''
      return true
    },
    displayTrace(trace, traceId = '', { replaceRoute = false } = {}) {
      this.stopPlayback()
      // The normalized trace (hundreds of frames, each a full engine snapshot)
      // is never mutated after assignment — displayTrace/loadTrace replace it
      // wholesale. markRaw keeps it out of Vue's deep-reactivity proxying; the
      // `this.trace` field reference swap is still tracked, which is all the
      // computeds need.
      this.trace = markRaw(normalizeTraceForPlayback(trace))
      this.currentTraceId = traceId
      this.traceError = ''
      this.importError = ''
      this.frameIndex = 0
      this.selectedTraceHex = null
      if (replaceRoute && traceId && this.$router && typeof this.$router.replace === 'function') {
        const navigation = this.$router.replace({
          path: '/AutomatedPlayground',
          query: { trace: traceId }
        })
        if (navigation && typeof navigation.catch === 'function') navigation.catch(() => {})
      }
    },
    makeRunRecord(output, traceId) {
      const result = output && output.result ? output.result : {}
      const trace = output && output.trace ? output.trace : {}
      const runConfig = output && output.runConfig ? output.runConfig : this.runConfig
      const option = this.selectedLevelOption || {}
      return {
        id: traceId,
        number: this.runHistory.length + 1,
        traceId,
        createdAt: trace.createdAt || new Date().toISOString(),
        levelId: option.id || this.selectedLevelId,
        levelLabel: option.label || option.id || this.selectedLevelId,
        seed: runConfig.seed || '',
        maxTurns: runConfig.maxTurns,
        levelKey: option.key || '',
        winner: result.winner || '',
        reason: result.reason || '',
        turns: result.turns,
        frames: Array.isArray(trace.frames) ? trace.frames.length : 0,
        player1Profile: runConfig.players && runConfig.players.player1
          ? runConfig.players.player1.profile
          : '',
        player2Profile: runConfig.players && runConfig.players.player2
          ? runConfig.players.player2.profile
          : ''
      }
    },
    addRunHistoryRecord(record) {
      this.runHistory = [...this.runHistory, record]
      this.expandedRunId = record.id
      this.resultsTab = 'timeline'
    },
    async showRunRecord(record) {
      if (this.automationRunning || !record) return
      if (record.traceId && record.traceId === this.currentTraceId) return
      this.runError = ''
      // Prefer the stored trace: builder runs (levelKey:'') and any run whose
      // trace is still in the capped history replay straight from the store —
      // no re-simulation and no false "level unavailable" error. The
      // levelOptions reconstruction below stays as the fallback for traces that
      // were evicted from the history.
      if (typeof sessionStorage !== 'undefined') {
        const stored = readTraceFromHistory(sessionStorage, record.traceId)
        if (stored) {
          this.displayTrace(stored, record.traceId, { replaceRoute: true })
          return
        }
      }
      const option = this.levelOptions.find(level => level.key === record.levelKey)
      if (!option || !option.package) {
        this.runError = this.uiText(
          'automatedPlayground.showRunLevelUnavailable',
          'The level for this game is no longer available.'
        )
        return
      }
      this.automationRunning = true
      // Yield a real frame so the running state paints before the blocking
      // reconstruction compute (mirrors runAutomatedMatch).
      await this.awaitPaint()
      try {
        // Deterministic reconstruction: same seed + config => identical game.
        const output = runConfiguredMatch({
          levelPackage: option.package,
          runConfig: {
            seed: record.seed,
            maxTurns: record.maxTurns,
            players: {
              player1: { profile: record.player1Profile },
              player2: { profile: record.player2Profile }
            },
            trace: true
          }
        })
        if (typeof sessionStorage !== 'undefined') {
          const metadata = { ...record, source: record.source || 'automated' }
          const stored = appendTraceToHistory(sessionStorage, { metadata, trace: output.trace })
          if (!stored.ok && stored.quotaExceeded) {
            this.runError = this.uiText(
              'automatedPlayground.traceStorageQuotaExceeded',
              TRACE_QUOTA_MESSAGE
            )
            return
          }
        }
        // Replaying an existing record upserts its trace (same traceId) — it must
        // NOT call addRunHistoryRecord, which would add a duplicate list entry.
        this.displayTrace(output.trace, record.traceId, { replaceRoute: true })
      } catch (err) {
        this.runError = err && err.message ? err.message : String(err)
      } finally {
        // Resets automationRunning on every path, including the early returns
        // inside the try (quota-exceeded branch, level-gone branch, etc.).
        this.automationRunning = false
      }
    },
    setResultsTab(tabId) {
      if (tabId === 'timeline' || tabId === 'summary') {
        this.resultsTab = tabId
      }
    },
    toggleRunRecord(id) {
      this.expandedRunId = this.expandedRunId === id ? '' : id
    },
    async runAutomatedMatch() {
      if (this.automationRunning) return
      this.runError = ''
      this.levelError = ''
      this.automationRunning = true
      // Yield a real frame so the running state ("Running…", disabled controls)
      // paints BEFORE the synchronous match compute blocks the main thread.
      await this.awaitPaint()
      try {
        if (!this.selectedLevelPackage) {
          this.runError = this.uiText('automatedPlayground.levelNotReady', 'Selected level is not loaded yet.')
          return
        }
        const seed = this.prepareSeedForRun()
        const output = runConfiguredMatch({
          levelPackage: this.selectedLevelPackage,
          runConfig: {
            ...this.runConfig,
            seed,
            trace: true
          }
        })
        this.runConfig = output.runConfig
        this.runResult = output.result

        if (typeof sessionStorage === 'undefined') {
          this.runError = this.uiText(
            'automatedPlayground.traceStorageUnavailable',
            'Playback trace storage is unavailable in this browser.'
          )
          return
        }
        const traceId = `automated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const record = { ...this.makeRunRecord(output, traceId), source: 'automated' }
        const stored = appendTraceToHistory(sessionStorage, { metadata: record, trace: output.trace })
        if (!stored.ok && stored.quotaExceeded) {
          this.runError = this.uiText(
            'automatedPlayground.traceStorageQuotaExceeded',
            TRACE_QUOTA_MESSAGE
          )
          return
        }
        this.displayTrace(output.trace, traceId, { replaceRoute: true })
        this.addRunHistoryRecord(record)
      } catch (err) {
        this.runResult = null
        this.runError = err && err.message ? err.message : String(err)
      } finally {
        this.automationRunning = false
      }
    },
    validateTracePayload(payload) {
      return isSimulationTrace(payload)
    },
    loadTrace() {
      // The `$route.query.trace` watcher re-fires after displayTrace's own
      // $router.replace. displayTrace sets currentTraceId BEFORE replacing, so
      // when the watcher arrives for the trace we just displayed, skip the
      // redundant second parse + normalize. External navigation (direct URL,
      // browser back/forward) targets a DIFFERENT traceId, so currentTraceId
      // differs and the full load below still runs.
      const requestedTraceId = this.$route && this.$route.query ? this.$route.query.trace : ''
      if (requestedTraceId && requestedTraceId === this.currentTraceId && this.trace) return

      this.stopPlayback()
      this.trace = null
      this.currentTraceId = ''
      this.traceError = ''
      this.importError = ''
      this.frameIndex = 0
      this.selectedTraceHex = null

      const traceId = requestedTraceId
      if (!traceId) {
        return
      }

      try {
        const trace = readTraceFromHistory(sessionStorage, traceId)
        if (!trace) {
          this.traceError = this.$t('automatedPlayground.traceMissing')
          return
        }
        if (!this.validateTracePayload(trace)) {
          this.traceError = this.$t('automatedPlayground.traceInvalid')
          return
        }
        this.displayTrace(trace, traceId)
      } catch (err) {
        this.traceError = err && err.message ? err.message : String(err)
      }
    },
    exportTrace() {
      if (!this.trace) return
      const stamp = timestampForFilename(this.trace.createdAt)
      this.downloadJSON(`hexwar-automated-trace-${stamp}.json`, this.trace)
    },
    openTraceImport() {
      if (this.$refs.traceFileInput) this.$refs.traceFileInput.click()
    },
    showTraceImportError(message) {
      const notifier = typeof window !== 'undefined' ? window.$notify : null
      if (notifier && typeof notifier.error === 'function') {
        notifier.error(this.$t('automatedPlayground.traceImportFailedTitle'), message)
        this.importError = ''
        return
      }
      this.importError = message
    },
    handleTraceImport(event) {
      const file = event.target && event.target.files ? event.target.files[0] : null
      if (!file) return

      const reader = new FileReader()
      this._activeTraceReader = reader
      reader.onload = loadEvent => {
        // The read may complete after the user navigated away; do not touch
        // sessionStorage or the (global) router post-unmount.
        if (this._isUnmounted) return
        this._activeTraceReader = null
        try {
          const parsed = JSON.parse(loadEvent.target.result)
          this.applyImportedTrace(parsed)
        } catch (parseError) {
          console.warn('AutomatedPlayground: imported trace could not be parsed.', parseError)
          this.showTraceImportError(this.$t('automatedPlayground.traceImportFailed'))
        } finally {
          event.target.value = ''
        }
      }
      reader.onerror = () => {
        if (this._isUnmounted) return
        this._activeTraceReader = null
        this.showTraceImportError(this.$t('automatedPlayground.traceImportFailed'))
        event.target.value = ''
      }
      reader.readAsText(file)
    },
    applyImportedTrace(payload, traceId = `imported-${Date.now()}`) {
      if (!this.validateTracePayload(payload)) {
        this.showTraceImportError(this.$t('automatedPlayground.traceInvalid'))
        return false
      }

      // Append through the capped history so the import joins the unified run
      // history (matching the run paths) and shares the quota handling. An
      // import that fails to persist still displays the trace in memory with no
      // route id, so the try/catch keeps applyImportedTrace's tolerant
      // semantics even for the non-quota errors appendTraceToHistory rethrows.
      const result = payload && payload.result ? payload.result : {}
      // Imported traces carry no runConfig, so seed/maxTurns/levelKey/profiles
      // are intentionally absent here (unlike makeRunRecord's automated shape).
      const record = {
        id: traceId,
        traceId,
        number: this.runHistory.length + 1,
        source: 'imported',
        createdAt: payload.createdAt,
        winner: result.winner || '',
        reason: result.reason || '',
        turns: result.turns,
        frames: Array.isArray(payload.frames) ? payload.frames.length : 0,
        levelLabel: (payload.levelPackage && payload.levelPackage.label) || '',
        levelId: (payload.levelPackage && payload.levelPackage.id) || ''
      }
      let stored = false
      try {
        const appended = appendTraceToHistory(sessionStorage, { metadata: record, trace: payload })
        stored = appended.ok
        if (!stored) {
          console.warn('AutomatedPlayground: could not persist imported trace (storage quota exceeded).')
        }
      } catch (storageError) {
        console.warn('AutomatedPlayground: could not persist imported trace.', storageError)
      }

      this.displayTrace(payload, stored ? traceId : '', { replaceRoute: stored })

      // Surface the import in the unified run history so the live list matches
      // what a remount would hydrate from the store (the index now holds it).
      if (stored) {
        this.addRunHistoryRecord(record)
      }

      return true
    },
    downloadJSON(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      this.downloadBlob(filename, blob)
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
    setFrameIndex(value) {
      // Cancel any pending slider-scrub rAF so a synchronous jump always wins.
      if (this._scrubRafHandle != null) {
        cancelAnimationFrame(this._scrubRafHandle)
        this._scrubRafHandle = null
        this._pendingFrameIndex = null
      }
      this.frameIndex = clampIndex(value, this.frameSliderMax)
      if (!this.canStepForward) this.stopPlayback()
    },
    scrubFrameIndex(value) {
      // Coalesce high-frequency slider input events into a single rAF commit.
      this._pendingFrameIndex = value
      if (this._scrubRafHandle == null) {
        this._scrubRafHandle = requestAnimationFrame(() => {
          this._scrubRafHandle = null
          const pending = this._pendingFrameIndex
          this._pendingFrameIndex = null
          // Defensive: setFrameIndex cancels this handle before the rAF can fire,
          // so `pending` is normally always set here; the guard just hardens it.
          if (pending != null) {
            this.setFrameIndex(pending)
          }
        })
      }
    },
    firstFrame() {
      this.setFrameIndex(0)
    },
    previousFrame() {
      this.setFrameIndex(this.frameIndex - 1)
    },
    nextFrame() {
      this.setFrameIndex(this.frameIndex + 1)
    },
    lastFrame() {
      this.setFrameIndex(this.frameSliderMax)
    },
    togglePlayback() {
      if (this.playing) {
        this.stopPlayback()
      } else {
        this.startPlayback()
      }
    },
    startPlayback() {
      if (this.frames.length === 0) return
      if (!this.canStepForward) this.firstFrame()
      this.playing = true
      this.timerId = window.setInterval(() => {
        if (!this.canStepForward) {
          this.stopPlayback()
          return
        }
        this.nextFrame()
      }, this.speedMs)
    },
    stopPlayback() {
      if (this.timerId) {
        window.clearInterval(this.timerId)
        this.timerId = null
      }
      this.playing = false
    }
  }
}
</script>

<style lang="scss">
@use '../styles/resizable-splitter' as *;
</style>

<style lang="scss" scoped>
@use '../styles/engine-sections';
@use '../styles/engine-turn-controls';
@use '../styles/level-builder-action-controls' as actionControls;

.automated-playground {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f6f8fb;
  color: #0f172a;
}

.automated-playground__shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  width: calc(100vw - 24px);
  max-width: none;
  margin: 0 auto;
  padding: 12px 0 24px;
  overflow: hidden;
}

.automated-playground__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.automated-playground__title {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.automated-playground__subtitle {
  margin: 6px 0 0;
  color: #475569;
}

.automated-playground__summary,
.automated-playground__controls,
.automated-playground__facts {
  display: flex;
  align-items: center;
  gap: 10px;
}

.automated-playground__header-side {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.automated-playground__summary {
  flex-wrap: wrap;
  justify-content: flex-end;
  color: #334155;
  font-size: 13px;
}

.automated-playground__trace-actions {
  display: grid;
  gap: 6px;
}

.automated-playground__trace-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.automated-playground__trace-action {
  display: inline-flex;
  align-items: center;
  width: 100%;
  gap: 6px;
  justify-content: center;
  white-space: nowrap;
}

.automated-playground__trace-hint,
.automated-playground__max-turns-hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.automated-playground__max-turns-hint {
  font-weight: 400;
}

.automated-playground__file-input {
  display: none;
}

.automated-playground__import-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fef2f2;
  color: #991b1b;
  font-weight: 600;
}

.automated-playground__setup {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(520px, 58vh);
  border-radius: 6px;
  background: #ffffff;
  overflow: hidden;
}

.automated-playground__results-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #d8dee6;
  border-radius: 6px;
  background: #ffffff;
  overflow: hidden;
}

.automated-playground__text-button {
  border: 0;
  background: transparent;
  color: #4CAF50;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 4px 0;
}

.automated-playground__text-button:hover:not(:disabled) {
  color: #2e7d32;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.automated-playground__text-button:disabled {
  color: #9ca3af;
  cursor: not-allowed;
  text-decoration: none;
}

.automated-playground__setup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.automated-playground__setup-body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.automated-playground__run-summary {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.automated-playground__setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
}

.automated-playground__timeline-config {
  margin-bottom: 10px;
}

.automated-playground__level-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}

.automated-playground__field {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.automated-playground__field--wide {
  grid-column: 1 / -1;
}

.automated-playground__field-control,
.automated-playground__seed-input {
  width: 100%;
  min-width: 0;
}

.automated-playground__field-control {
  @include actionControls.field-input;
}

select.automated-playground__field-control,
select.automated-playground__speed-select {
  font-family: inherit;
}

.automated-playground__field-control--number {
  text-align: left;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  appearance: textfield;
  -moz-appearance: textfield;
}

.automated-playground__seed-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 6px;
}

.automated-playground__seed-input {
  @include actionControls.seed-input;
}

.automated-playground__seed-lock {
  @include actionControls.seed-lock-button;
  padding: 0;
}

.automated-playground__seed-lock--locked {
  @include actionControls.seed-lock-button-locked;
}

.automated-playground__setup-actions {
  @include actionControls.action-row;
  justify-content: flex-start;
}

.automated-playground__action-button {
  @include actionControls.action-button;
}

.automated-playground__action-button--primary {
  @include actionControls.action-button-primary;
  flex: 1 1 auto;
}

.automated-playground__action-button--playtest {
  @include actionControls.action-button-playtest;
}

.automated-playground__reset-run-button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid rgba(220, 53, 69, 0.28);
  border-radius: 4px;
  background: rgba(220, 53, 69, 0.08);
  color: #b42332;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.automated-playground__reset-run-button:hover:not(:disabled) {
  border-color: rgba(220, 53, 69, 0.45);
  background: rgba(220, 53, 69, 0.14);
}

.automated-playground__reset-run-button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.automated-playground__level-upload-button {
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

.automated-playground__level-upload-button:hover:not(:disabled) {
  border-color: #4CAF50;
  background: #E8F5E8;
}

.automated-playground__level-upload-button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.automated-playground__setup-error {
  margin: 0;
  color: #b42318;
  font-size: 13px;
  font-weight: 700;
}

.automated-playground__setup-hint {
  margin: -4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.automated-playground__controls {
  flex-wrap: wrap;
  padding: 10px;
  border: 1px solid #d8dee6;
  border-radius: 6px;
  background: #ffffff;
}

.automated-playground__control-button {
  flex: 0 0 36px;
  width: 36px;
  height: 34px;
  padding: 0;
}

.automated-playground__icon-button {
  @include actionControls.seed-lock-button;

  flex-basis: 36px;
  width: 36px;
  min-height: 34px;
  padding: 0;
}

.automated-playground__icon-button--primary {
  @include actionControls.action-button-primary;
}

.automated-playground__speed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: #475569;
  font-size: 13px;
}

.automated-playground__range {
  flex: 1 1 220px;
  min-width: 160px;
}

.automated-playground__frame-counter {
  min-width: 72px;
  color: #475569;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.automated-playground__workspace {
  display: grid;
  grid-template-columns:
    minmax(300px, 360px)
    16px
    minmax(520px, var(--layout-board-width, 1fr))
    var(--automated-splitter-size, 16px)
    minmax(300px, var(--layout-inspector-width, 360px));
  grid-template-areas: "run . board splitter inspector";
  gap: 0;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

.automated-playground__board,
.automated-playground__inspector,
.automated-playground__run-panel,
.automated-playground__empty {
  border-radius: 6px;
}

.automated-playground__board {
  grid-area: board;
  position: relative;
  min-height: 0;
  height: 100%;
  border: 1px solid #d8dee6;
  background: #ffffff;
  overflow: hidden;
}

.automated-playground__board-notice {
  position: absolute;
  z-index: 2;
  top: 10px;
  left: 10px;
  max-width: min(420px, calc(100% - 20px));
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #facc15;
  border-radius: 4px;
  background: #fefce8;
  color: #713f12;
  font-size: 12px;
  font-weight: 700;
}

.automated-playground__game-map {
  height: 100%;
  min-height: 0;
}

.automated-playground__inspector {
  grid-area: inspector;
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 0;
  height: 100%;
  padding: 12px;
  border: 1px solid #d8dee6;
  background: #ffffff;
  overflow-y: auto;
}

// Splitter visuals are shared via styles/_resizable-splitter.scss (imported in
// the unscoped <style> block below). Only grid placement is page-specific here.
.playground-splitter--board-inspector {
  grid-area: splitter;
}

.automated-playground__run-panel {
  grid-area: run;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.automated-playground__facts {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 8px 12px 10px;
}

.automated-playground__facts div {
  display: grid;
  grid-template-columns: minmax(92px, max-content) minmax(0, 1fr);
  column-gap: 14px;
  align-items: baseline;
  min-width: 0;
  padding: 5px 0;
  font-size: 13px;
}

/* Inside a run record the facts list sits in an engine-section__body that
   already provides the 12px inset — drop the list's own padding so the two
   do not stack. */
.automated-playground__run-record .automated-playground__facts {
  padding: 0;
}

.automated-playground__run-record-badge {
  display: inline-block;
  margin-top: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #dcfce7;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
}

.automated-playground__show-run-button {
  margin-top: 8px;
}

.automated-playground__facts dt {
  margin: 0;
  color: var(--text-secondary, #555);
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
}

.automated-playground__facts dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary, #333);
  line-height: 1.35;
  text-align: right;
}

.automated-playground__facts--compact dt {
  min-width: 5.4rem;
}

.automated-playground__unit-roster {
  display: grid;
  gap: 12px;
}

.automated-playground__unit-side {
  padding-bottom: 2px;
  border-bottom: 1px solid #e9ecef;
}

.automated-playground__unit-side:last-child {
  border-bottom: 0;
}

.automated-playground__selection-empty {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.automated-playground__summary-table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

.automated-playground__summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.automated-playground__summary-table th,
.automated-playground__summary-table td {
  padding: 7px 6px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: top;
}

.automated-playground__results-tabs {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.automated-playground__results-content {
  align-items: stretch;
  justify-content: flex-start;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.automated-playground__results-tabs :deep(.tab-content) {
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

.automated-playground__games-timeline {
  display: grid;
  gap: 8px;
}

.automated-playground__run-record-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #334155;
}

.automated-playground__summary-table th {
  width: 62%;
  color: #64748b;
  font-weight: 800;
}

.automated-playground__summary-table td {
  color: #0f172a;
  font-weight: 800;
}

.automated-playground__empty {
  padding: 18px;
  border: 1px solid #d8dee6;
  background: #ffffff;
  color: #475569;
}

.automated-playground__empty--trace {
  display: grid;
  gap: 10px;
  max-width: 620px;
}

.automated-playground__empty--trace h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
}

.automated-playground__empty--trace p {
  margin: 0;
  line-height: 1.45;
}

.automated-playground__empty-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  color: #334155;
  font-weight: 700;
  text-decoration: none;
}

.automated-playground__empty-action:hover {
  border-color: #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.automated-playground__empty-action:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #94a3b8;
}

@media (max-width: 1180px) {
  .automated-playground__workspace {
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    grid-template-areas:
      "run board"
      "inspector inspector";
    align-items: start;
    overflow-y: auto;
  }

  .automated-playground__run-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .playground-splitter {
    display: none;
  }

  .automated-playground__board,
  .automated-playground__game-map {
    min-height: 520px;
    height: auto;
  }
}

@media (max-width: 980px) {
  .automated-playground__setup-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .automated-playground__setup-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .automated-playground__workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "run"
      "board"
      "inspector";
  }

  .automated-playground__run-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .automated-playground__board,
  .automated-playground__game-map {
    min-height: 420px;
    height: auto;
  }
}
</style>
