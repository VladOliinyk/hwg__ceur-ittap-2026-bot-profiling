<template>
  <!-- Live validation summary. Renders blocking errors and non-blocking
       warnings for the current LevelPackage. The parent owns the validation
       computation; this panel is purely presentational so it can be reused
       by the future Review & Export step. -->
  <div class="validation-summary">
    <h4>{{ $t('levelBuilder.packageValidation.title') }}</h4>
    <p class="validation-stage">
      <span>{{ $t('levelBuilder.packageValidation.level') }} <strong>{{ levelId || 'level_000' }}</strong></span>
      <span v-if="lastActionStage !== 'idle'">
        &middot; {{ $t('levelBuilder.packageValidation.lastAction') }} <strong>{{ lastActionStage }}</strong>
      </span>
    </p>
    <div v-if="errorCount > 0" class="validation-errors">
      <p class="validation-heading validation-heading-error">
        {{ $tf('levelBuilder.packageValidation.errorsBlocked', `Errors (${errorCount}) - export blocked`, { count: errorCount }) }}
      </p>
      <ul>
        <li v-for="(issue, i) in displayedErrors" :key="'e' + i">
          <code>{{ issue.path || $t('levelBuilder.packageValidation.root') }}</code>: {{ issue.message }}
        </li>
        <li v-if="errorCount > displayedErrors.length" class="validation-more">
          {{ $tf('levelBuilder.packageValidation.more', `...and ${errorCount - displayedErrors.length} more`, { count: errorCount - displayedErrors.length }) }}
        </li>
      </ul>
    </div>
    <div v-if="warningCount > 0" class="validation-warnings">
      <p class="validation-heading validation-heading-warning">
        {{ $tf('levelBuilder.packageValidation.warnings', `Warnings (${warningCount})`, { count: warningCount }) }}
      </p>
      <ul>
        <li v-for="(issue, i) in displayedWarnings" :key="'w' + i">
          <code>{{ issue.path || $t('levelBuilder.packageValidation.root') }}</code>: {{ issue.message }}
        </li>
        <li v-if="warningCount > displayedWarnings.length" class="validation-more">
          {{ $tf('levelBuilder.packageValidation.more', `...and ${warningCount - displayedWarnings.length} more`, { count: warningCount - displayedWarnings.length }) }}
        </li>
      </ul>
    </div>
    <p
      v-if="errorCount === 0 && warningCount === 0"
      class="validation-ok"
    >
      {{ $t('levelBuilder.packageValidation.ok') }}
    </p>
  </div>
</template>

<script>
export default {
  name: 'PackageValidationPanel',
  props: {
    // Full `validateLevelPackage` result for the current builder state.
    // Only `.errors` and `.warnings` are read here; passing the whole
    // object keeps the contract aligned with the validator's return shape.
    validation: {
      type: Object,
      default: () => ({ errors: [], warnings: [] })
    },
    // Subset of `validation.errors` the parent has decided to show
    // (typically capped to keep the panel compact). The panel itself
    // does not slice — it trusts the parent's display policy.
    displayedErrors: {
      type: Array,
      default: () => []
    },
    displayedWarnings: {
      type: Array,
      default: () => []
    },
    levelId: {
      type: String,
      default: 'level_000'
    },
    lastActionStage: {
      type: String,
      default: 'idle'
    }
  },
  computed: {
    errorCount() {
      const errs = this.validation && this.validation.errors
      return Array.isArray(errs) ? errs.length : 0
    },
    warningCount() {
      const warns = this.validation && this.validation.warnings
      return Array.isArray(warns) ? warns.length : 0
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

// Visually neutral panel — no card frame, no surrounding padding/shadow.
// A callsite that wants a card frame (e.g.
// `ReviewExportStep.review-export-step__validation`) supplies it from
// the outside.
.validation-summary {
  font-size: $font-size-normal;

  h4 {
    margin: 0 0 8px;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  .validation-stage {
    margin: 0 0 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: $text-secondary;
  }

  .validation-heading {
    margin: 8px 0 4px;
    font-weight: $font-weight-bold;
  }

  .validation-heading-error {
    color: $error-color;
  }

  .validation-heading-warning {
    color: $warning-color;
  }

  ul {
    list-style: disc;
    padding-left: 18px;
    margin: 0 0 4px;
  }

  li {
    margin-bottom: 2px;
    line-height: 1.3;
    word-break: break-word;
    color: $text-primary;
  }

  code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .validation-more {
    list-style: none;
    margin-left: -18px;
    font-style: italic;
    color: $text-muted;
  }

  .validation-ok {
    margin: 4px 0 0;
    color: $success-color;
  }
}
</style>
