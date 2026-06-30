<template>
  <div class="review-export-step">
    <p class="review-export-step__intro">
      {{ $t('levelBuilder.reviewExport.introStart') }}
      <em>{{ $t('levelBuilder.reviewExport.levelArchive') }}</em>
      {{ $t('levelBuilder.reviewExport.introMiddle') }}
      <em>{{ $t('levelBuilder.reviewExport.packageValidation') }}</em>.
      {{ $t('levelBuilder.reviewExport.introEnd') }}
    </p>

    <section
      class="review-export-step__readiness"
      :aria-label="$t('levelBuilder.reviewExport.sectionReadiness')"
    >
      <h3 class="review-export-step__section-title">{{ $t('levelBuilder.reviewExport.sectionReadiness') }}</h3>
      <ul class="review-export-step__readiness-list">
        <li
          v-for="section in sectionReadiness"
          :key="section.key"
          class="review-export-step__readiness-item"
        >
          <div class="review-export-step__readiness-row">
            <span class="review-export-step__readiness-name">{{ section.title }}</span>
            <span
              class="review-export-step__readiness-badge"
              :class="`review-export-step__readiness-badge--${section.status}`"
            >{{ section.statusLabel }}</span>
          </div>
          <p
            v-if="section.summary"
            class="review-export-step__readiness-summary"
          >{{ section.summary }}</p>
        </li>
      </ul>
    </section>

    <section
      class="review-export-step__validation"
      :aria-label="$t('levelBuilder.reviewExport.packageValidation')"
    >
      <PackageValidationPanel
        :validation="validation"
        :displayed-errors="displayedErrors"
        :displayed-warnings="displayedWarnings"
        :level-id="levelId"
        :last-action-stage="lastActionStage"
      />
    </section>

    <section class="review-export-step__actions" :aria-label="$t('levelBuilder.reviewExport.actionsAria')">
      <h3 class="review-export-step__section-title">{{ $t('levelBuilder.reviewExport.actions') }}</h3>

      <!-- Block 1: Export level -->
      <div class="review-export-step__block">
        <h4 class="review-export-step__block-heading">{{ $t('levelBuilder.reviewExport.blockExport') }}</h4>
        <label class="review-export-step__level-id">
          <span class="review-export-step__level-id-label">{{ $t('levelBuilder.reviewExport.levelName') }}</span>
          <input
            type="text"
            class="review-export-step__level-id-input"
            :value="levelId"
            spellcheck="false"
            autocomplete="off"
            aria-describedby="review-export-level-id-hint"
            @input="$emit('update:level-id', $event.target.value)"
          />
        </label>
        <p class="review-export-step__export-preview">
          <span class="review-export-step__export-preview-label">{{ $t('levelBuilder.reviewExport.exportId') }}</span>
          <code>{{ displayedExportLevelId }}</code>
        </p>
        <div class="review-export-step__action-row">
          <button
            type="button"
            class="review-export-step__btn review-export-step__btn--primary"
            :disabled="!canExport"
            @click="$emit('export-archive')"
          >
            {{ $t('levelBuilder.reviewExport.exportLevel') }}
          </button>
        </div>
        <div class="review-export-step__hint">
          <p id="review-export-level-id-hint" class="review-export-step__hint-line">
            {{ $t('levelBuilder.reviewExport.hintLevelName') }}
            <code>level_000_2026-06-03_14-25-09</code>.
          </p>
          <p class="review-export-step__hint-line">
            <strong>{{ $t('levelBuilder.reviewExport.exportLevel') }}</strong>
            {{ $t('levelBuilder.reviewExport.hintExportLevelStart') }}
            <code>{{ displayedExportLevelId }}.zip</code>
            {{ $t('levelBuilder.reviewExport.hintExportLevelMiddle') }}
            <code>{{ displayedExportLevelId }}/</code>
            {{ $t('levelBuilder.reviewExport.hintExportLevelEnd') }}
            (<code>_hexmap.json</code>,
            <code>_terrain.json</code>, <code>_units.json</code>,
            <code>_turntable.json</code>).
            {{ $t('levelBuilder.reviewExport.hintExportLevelPublic') }}
            <code>public/</code>
            {{ $t('levelBuilder.reviewExport.hintExportLevelPlayground') }}
          </p>
        </div>
      </div>

      <!-- Block 2: Test level -->
      <div class="review-export-step__block">
        <h4 class="review-export-step__block-heading">{{ $t('levelBuilder.reviewExport.blockTest') }}</h4>
        <div class="review-export-step__action-row">
          <button
            type="button"
            class="review-export-step__btn review-export-step__btn--playtest"
            :disabled="!canExport"
            @click="$emit('test-in-playground')"
          >
            {{ $t('levelBuilder.reviewExport.testManually') }}
          </button>
          <button
            type="button"
            class="review-export-step__btn review-export-step__btn--playtest"
            :disabled="!canExport"
            @click="$emit('test-in-automated-playground')"
          >
            {{ $t('levelBuilder.reviewExport.testInAutomatedPlayground') }}
          </button>
        </div>
        <slot name="automated-playtest" />
        <div class="review-export-step__hint">
          <p class="review-export-step__hint-line">
            <strong>{{ $t('levelBuilder.reviewExport.testManually') }}</strong>
            {{ $t('levelBuilder.reviewExport.hintTestInPlayground') }}
          </p>
          <p class="review-export-step__hint-line">
            <strong>{{ $t('levelBuilder.reviewExport.testInAutomatedPlayground') }}</strong>
            {{ $t('levelBuilder.reviewExport.hintTestInAutomatedPlayground') }}
          </p>
        </div>
      </div>

      <!-- Block 3: Other (split export + import) -->
      <div class="review-export-step__block">
        <h4 class="review-export-step__block-heading">{{ $t('levelBuilder.reviewExport.blockOther') }}</h4>
        <div class="review-export-step__action-row">
          <button
            type="button"
            class="review-export-step__btn"
            :disabled="!canExport"
            @click="$emit('export')"
          >
            {{ $t('levelBuilder.reviewExport.exportSplitDebug') }}
          </button>
          <button
            type="button"
            class="review-export-step__btn"
            @click="onImportClick"
          >
            {{ $t('levelBuilder.reviewExport.importLevel') }}
          </button>
          <input
            ref="fileInput"
            type="file"
            accept=".json,.zip"
            multiple
            class="review-export-step__file-input"
            @change="onFileChange"
          />
        </div>
        <div class="review-export-step__hint">
          <p class="review-export-step__hint-line">
            <strong>{{ $t('levelBuilder.reviewExport.exportSplitDebug') }}</strong>
            {{ $t('levelBuilder.reviewExport.hintExportSplit') }}
          </p>
          <p class="review-export-step__hint-line">
            {{ $t('levelBuilder.reviewExport.hintImportStart') }}
            <code>.zip</code>
            {{ $t('levelBuilder.reviewExport.hintImportArchive') }}
            <strong>{{ $t('levelBuilder.reviewExport.exportLevel') }}</strong>
            {{ $t('levelBuilder.reviewExport.hintImportMiddle') }}
            <em>{{ $t('levelBuilder.reviewExport.hintImportNot') }}</em>
            {{ $t('levelBuilder.reviewExport.hintImportEnd') }}
            <code>.zip</code>
            {{ $t('levelBuilder.reviewExport.hintImportMixed') }}
          </p>
        </div>
      </div>

      <p
        v-if="!canExport"
        class="review-export-step__hint review-export-step__hint--blocked"
      >
        {{ $t('levelBuilder.reviewExport.blocked') }}
      </p>
    </section>
  </div>
</template>

<script>
import PackageValidationPanel from './PackageValidationPanel.vue'

export default {
  name: 'ReviewExportStep',
  components: { PackageValidationPanel },
  props: {
    // Full validator output. Same shape that PackageValidationPanel
    // consumes — passed through so consumers do not have to wire the
    // panel separately.
    validation: {
      type: Object,
      default: () => ({ ok: true, errors: [], warnings: [], package: null })
    },
    displayedErrors: { type: Array, default: () => [] },
    displayedWarnings: { type: Array, default: () => [] },
    levelId: { type: String, default: 'level_000' },
    exportLevelId: { type: String, default: '' },
    lastActionStage: { type: String, default: 'idle' },
    // Per-section readiness rows. Each entry:
    //   { key, title, status: 'ready'|'warnings'|'errors'|'empty',
    //     statusLabel, summary? }
    // Computed by the parent (LevelBuilder) so the validator's path
    // convention is not duplicated here.
    sectionReadiness: { type: Array, required: true }
  },
  emits: ['export', 'export-archive', 'test-in-playground', 'test-in-automated-playground', 'import-files', 'update:level-id'],
  computed: {
    canExport() {
      const errs = this.validation && this.validation.errors
      return !Array.isArray(errs) || errs.length === 0
    },
    displayedExportLevelId() {
      return this.exportLevelId || this.levelId || 'level_000'
    }
  },
  methods: {
    onImportClick() {
      // The hidden `<input type="file">` lives inside this component;
      // the visible Import button just triggers it.
      if (this.$refs.fileInput) this.$refs.fileInput.click()
    },
    onFileChange(event) {
      // Forward the change event to the parent so the page-level
      // `loadMap(event)` keeps its existing contract
      // (`event.target.files` + `event.target.value = ''`).
      this.$emit('import-files', event)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;
@use '@/styles/level-builder-action-controls' as actionControls;

.review-export-step {
  display: flex;
  flex-direction: column;
  gap: $panel-gap;

  &__intro {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-secondary;
    line-height: 1.4;

    em {
      font-style: normal;
      font-weight: $font-weight-medium;
      color: $text-primary;
    }
  }

  &__section-title {
    margin: 0 0 8px;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__readiness,
  &__validation {
    padding: $panel-padding;
    background-color: $surface-color;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    box-shadow: $panel-shadow;
  }

  &__readiness-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__readiness-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: $border-width solid $border-light;
    border-radius: 6px;
  }

  &__readiness-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__readiness-name {
    flex: 1;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__readiness-badge {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;

    &--ready {
      background-color: rgba($success-color, 0.15);
      color: $success-color;
    }

    &--warnings {
      background-color: rgba($warning-color, 0.15);
      color: $warning-color;
    }

    &--errors {
      background-color: rgba($error-color, 0.15);
      color: $error-color;
    }

    &--empty {
      background-color: rgba(0, 0, 0, 0.06);
      color: $text-muted;
    }
  }

  &__readiness-summary {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-secondary;
  }

  &__actions {
    padding: $panel-padding;
    background-color: $surface-color;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    box-shadow: $panel-shadow;
  }

  &__action-row {
    @include actionControls.action-row;
  }

  &__level-id {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 320px;
    margin-bottom: 10px;
  }

  &__level-id-label {
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    color: $text-secondary;
  }

  &__level-id-input {
    @include actionControls.field-input;
  }

  &__export-preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: -2px 0 10px;
    font-size: $font-size-normal;
    color: $text-muted;

    code {
      font-family: monospace;
      font-size: 0.95em;
      color: $text-secondary;
      background-color: rgba(0, 0, 0, 0.05);
      padding: 2px 5px;
      border-radius: 3px;
    }
  }

  &__export-preview-label {
    font-weight: $font-weight-medium;
    color: $text-secondary;
  }

  &__btn {
    @include actionControls.action-button;

    &--primary {
      @include actionControls.action-button-primary;
    }

    &--playtest {
      @include actionControls.action-button-playtest;
    }
  }

  &__file-input {
    display: none;
  }

  &__hint {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0 0;
    font-size: $font-size-normal;
    color: $text-muted;
    line-height: 1.4;

    code {
      font-family: monospace;
      font-size: 0.9em;
      background-color: rgba(0, 0, 0, 0.05);
      padding: 1px 5px;
      border-radius: 3px;
    }

    &--blocked {
      color: $error-color;
    }
  }

  &__hint-line {
    margin: 0;
  }

  &__block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: $panel-padding;
    background-color: $background-color;
    border: $border-width solid $border-light;
    border-radius: $border-radius;
  }

  &__block-heading {
    margin: 0;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    color: $text-secondary;
  }
}
</style>
