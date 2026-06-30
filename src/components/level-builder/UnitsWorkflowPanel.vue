<template>
  <section class="units-workflow-panel" :aria-label="$t('levelBuilder.unitsWorkflow.ariaLabel')">
    <h3 class="units-workflow-panel__title">{{ $t('levelBuilder.unitsWorkflow.shortcuts') }}</h3>
    <div class="units-workflow-panel__buttons">
      <button
        type="button"
        class="units-workflow-panel__btn"
        @click="$emit('reset')"
      >{{ $t('levelBuilder.unitsWorkflow.resetDefault') }}</button>
      <button
        type="button"
        class="units-workflow-panel__btn"
        @click="$emit('copy', 'player->enemy')"
      >{{ $t('levelBuilder.unitsWorkflow.copyPlayerEnemy') }}</button>
      <button
        type="button"
        class="units-workflow-panel__btn"
        :disabled="enemySyncLocked"
        @click="$emit('copy', 'enemy->player')"
      >{{ $t('levelBuilder.unitsWorkflow.copyEnemyPlayer') }}</button>
    </div>
    <div class="units-workflow-panel__toggles">
      <label class="units-workflow-panel__toggle">
        <input
          :checked="comparisonAlwaysOn"
          type="checkbox"
          class="units-workflow-panel__toggle-input"
          @change="$emit('update:comparison-always-on', $event.target.checked)"
        />
        <span class="units-workflow-panel__switch" aria-hidden="true"></span>
        <span class="units-workflow-panel__toggle-label">{{ $t('levelBuilder.unitsWorkflow.alwaysCompareStats') }}</span>
      </label>
      <label class="units-workflow-panel__toggle">
        <input
          :checked="enemySyncLocked"
          type="checkbox"
          class="units-workflow-panel__toggle-input"
          @change="$emit('update:enemy-sync-locked', $event.target.checked)"
        />
        <span class="units-workflow-panel__switch" aria-hidden="true"></span>
        <span class="units-workflow-panel__toggle-label">{{ $t('levelBuilder.unitsWorkflow.syncLockEnemyValues') }}</span>
      </label>
    </div>
    <p class="units-workflow-panel__hint">
      {{ $t('levelBuilder.unitsWorkflow.hint') }}
    </p>
  </section>
</template>

<script>
export default {
  name: 'UnitsWorkflowPanel',
  props: {
    comparisonAlwaysOn: { type: Boolean, default: false },
    enemySyncLocked: { type: Boolean, default: false }
  },
  emits: ['reset', 'copy', 'update:comparison-always-on', 'update:enemy-sync-locked']
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.units-workflow-panel {
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

  &__buttons,
  &__toggles {
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

    &:hover:not(:disabled) {
      background-color: $primary-light;
      border-color: $primary-color;
    }

    &:disabled {
      color: $disabled-color;
      cursor: not-allowed;
      background-color: $disabled-background;
      border-color: $disabled-background;
    }
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: $text-secondary;
    font-size: $font-size-normal;
    cursor: pointer;
    user-select: none;
  }

  &__toggle-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  &__switch {
    position: relative;
    width: $switch-width;
    height: $switch-height;
    flex: 0 0 $switch-width;
    border-radius: 999px;
    background-color: $border-dark;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: background-color $transition-fast $transition-easing,
      box-shadow $transition-fast $transition-easing;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: $switch-thumb-size;
      height: $switch-thumb-size;
      border-radius: 50%;
      background-color: $surface-color;
      box-shadow: $switch-shadow;
      transition: transform $transition-fast $transition-easing;
    }
  }

  &__toggle-input:checked + &__switch {
    background-color: $primary-color;

    &::after {
      transform: translateX($switch-width - $switch-thumb-size - 4px);
    }
  }

  &__toggle-input:focus-visible + &__switch {
    box-shadow: 0 0 0 3px rgba($primary-color, 0.2),
      inset 0 1px 2px rgba(0, 0, 0, 0.18);
  }

  &__toggle-label {
    line-height: 1.2;
  }

  &__hint {
    margin: 0;
    font-size: $font-size-normal;
    color: $text-muted;
    line-height: 1.4;
  }
}
</style>
