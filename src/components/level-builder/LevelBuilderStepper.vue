<template>
  <nav class="level-builder-stepper" role="tablist" :aria-label="$t('levelBuilder.stepper.ariaLabel')">
    <ol class="level-builder-stepper__list">
      <li
        v-for="(step, idx) in steps"
        :key="step.id"
        class="level-builder-stepper__item"
      >
        <button
          type="button"
          class="level-builder-stepper__step"
          :class="{ 'level-builder-stepper__step--active': step.id === activeStepId }"
          role="tab"
          :aria-selected="step.id === activeStepId"
          @click="onSelect(step.id)"
        >
          <span class="level-builder-stepper__index">{{ idx + 1 }}</span>
          <span class="level-builder-stepper__body">
            <span class="level-builder-stepper__title">{{ $tf(step.titleKey, step.title) }}</span>
          </span>
        </button>
      </li>
    </ol>
  </nav>
</template>

<script>
export default {
  name: 'LevelBuilderStepper',
  props: {
    steps: {
      type: Array,
      required: true
    },
    activeStepId: {
      type: String,
      required: true
    }
  },
  emits: ['step-change'],
  methods: {
    onSelect(stepId) {
      if (stepId === this.activeStepId) return
      this.$emit('step-change', stepId)
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.level-builder-stepper {
  width: 100%;

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__item {
    flex: 1 1 180px;
    min-width: 0;
  }

  &__step {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background-color: $surface-color;
    border: $border-width solid $border-color;
    border-radius: $border-radius;
    text-align: left;
    color: $text-primary;
    cursor: pointer;
    transition: background-color $transition-fast $transition-easing,
                border-color $transition-fast $transition-easing,
                box-shadow $transition-fast $transition-easing;

    &:hover {
      background-color: $primary-light;
      border-color: $primary-color;
    }

    &:focus-visible {
      outline: 2px solid $primary-color;
      outline-offset: 2px;
    }

    &--active {
      background-color: $primary-color;
      border-color: $primary-color;
      color: $surface-color;
      box-shadow: $panel-shadow;

      &:hover {
        background-color: $primary-hover;
        border-color: $primary-hover;
      }

      .level-builder-stepper__index {
        background-color: $surface-color;
        color: $primary-color-dark;
      }
    }
  }

  &__index {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: $primary-light;
    color: $primary-color-dark;
    font-weight: $font-weight-bold;
    font-size: $font-size-medium;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-size: $font-size-medium;
    font-weight: $font-weight-medium;
    line-height: 1.2;
  }

}
</style>
