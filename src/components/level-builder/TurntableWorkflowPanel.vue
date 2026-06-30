<template>
  <section class="turntable-workflow-panel" :aria-label="$t('levelBuilder.turntableWorkflow.ariaLabel')">
    <h3 class="turntable-workflow-panel__title">{{ $t('levelBuilder.turntableWorkflow.shortcuts') }}</h3>
    <div class="turntable-workflow-panel__buttons">
      <button
        type="button"
        class="turntable-workflow-panel__btn"
        @click="$emit('reset')"
      >{{ $t('levelBuilder.turntableWorkflow.resetDefault') }}</button>
      <button
        type="button"
        class="turntable-workflow-panel__btn"
        @click="$emit('mirror', 'our->enemy')"
      >{{ $t('levelBuilder.turntableWorkflow.copyOurEnemy') }}</button>
      <button
        type="button"
        class="turntable-workflow-panel__btn"
        @click="$emit('mirror', 'enemy->our')"
      >{{ $t('levelBuilder.turntableWorkflow.copyEnemyOur') }}</button>
    </div>
    <p class="turntable-workflow-panel__hint">
      {{ $t('levelBuilder.turntableWorkflow.hintStart') }}
      <code>-</code>
      {{ $t('levelBuilder.turntableWorkflow.hintMiddle') }}
      <code>*_turntable.json</code>
      {{ $t('levelBuilder.turntableWorkflow.hintEnd') }}
      <em>{{ $t('levelBuilder.turntableWorkflow.reviewExport') }}</em>.
    </p>
  </section>
</template>

<script>
export default {
  name: 'TurntableWorkflowPanel',
  emits: ['reset', 'mirror']
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.turntable-workflow-panel {
  padding: 0;
  background-color: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__title {
    margin: 0;
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }

  &__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__btn {
    padding: 6px 14px;
    border: $border-width solid $border-color;
    border-radius: 6px;
    background-color: $surface-color;
    color: $text-primary;
    font-size: $font-size-normal;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing;

    &:hover {
      background-color: $primary-light;
      border-color: $primary-color;
    }
  }

  &__hint {
    margin: 0;
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

    em {
      font-style: normal;
      font-weight: $font-weight-medium;
      color: $text-primary;
    }
  }
}
</style>
