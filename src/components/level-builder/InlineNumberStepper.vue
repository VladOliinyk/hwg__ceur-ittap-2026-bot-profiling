<template>
  <div
    v-bind="$attrs"
    class="inline-number-stepper"
    :class="{ 'inline-number-stepper--disabled': disabled }"
  >
    <input
      type="number"
      class="inline-number-stepper__input"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @input="onInput"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    />
    <span class="inline-number-stepper__buttons">
      <button
        type="button"
        class="inline-number-stepper__button"
        :aria-label="increaseLabel"
        :disabled="disabled || isAtMax"
        tabindex="-1"
        @mousedown.prevent
        @click="stepValue(1, $event)"
      >
        <PhCaretUp :size="10" weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-number-stepper__button"
        :aria-label="decreaseLabel"
        :disabled="disabled || isAtMin"
        tabindex="-1"
        @mousedown.prevent
        @click="stepValue(-1, $event)"
      >
        <PhCaretDown :size="10" weight="bold" aria-hidden="true" />
      </button>
    </span>
  </div>
</template>

<script>
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'

export default {
  name: 'InlineNumberStepper',
  components: {
    PhCaretDown,
    PhCaretUp
  },
  inheritAttrs: false,
  props: {
    modelValue: { type: [Number, String], default: '' },
    min: { type: [Number, String], default: null },
    max: { type: [Number, String], default: null },
    step: { type: [Number, String], default: 1 },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, required: true }
  },
  emits: ['update:modelValue', 'focus', 'blur'],
  computed: {
    numericValue() {
      return this.toNumberOrNull(this.modelValue)
    },
    numericMin() {
      return this.toNumberOrNull(this.min)
    },
    numericMax() {
      return this.toNumberOrNull(this.max)
    },
    numericStep() {
      const n = this.toNumberOrNull(this.step)
      return n && n > 0 ? n : 1
    },
    isAtMin() {
      return this.numericMin !== null && this.numericValue !== null && this.numericValue <= this.numericMin
    },
    isAtMax() {
      return this.numericMax !== null && this.numericValue !== null && this.numericValue >= this.numericMax
    },
    increaseLabel() {
      return `Increase ${this.ariaLabel}`
    },
    decreaseLabel() {
      return `Decrease ${this.ariaLabel}`
    }
  },
  methods: {
    onInput(event) {
      const raw = event && event.target ? event.target.value : ''
      const parsed = event && event.target ? event.target.valueAsNumber : NaN
      this.$emit('update:modelValue', raw === '' ? '' : (Number.isFinite(parsed) ? parsed : raw))
    },
    stepValue(direction, event) {
      if (this.disabled) return
      const multiplier = event && event.shiftKey ? 10 : 1
      const delta = direction * this.numericStep * multiplier
      const fallback = this.numericMin !== null ? this.numericMin : 0
      const current = this.numericValue !== null ? this.numericValue : fallback
      this.$emit('update:modelValue', this.clamp(current + delta))
    },
    clamp(value) {
      let next = value
      if (this.numericMin !== null) next = Math.max(this.numericMin, next)
      if (this.numericMax !== null) next = Math.min(this.numericMax, next)
      return next
    },
    toNumberOrNull(value) {
      if (value === '' || value === null || value === undefined) return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.inline-number-stepper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: stretch;
  overflow: hidden;

  &__input {
    width: 100%;
    min-width: 0;
    padding: 4px 8px 4px 6px;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: right;
    appearance: textfield;
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__buttons {
    display: grid;
    grid-template-rows: 1fr 1fr;
    border-left: $border-width solid $border-light;
  }

  &__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: $text-muted;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: $primary-color;
      background-color: rgba($primary-color, 0.08);
    }

    &:disabled {
      color: $disabled-color;
      cursor: not-allowed;
    }
  }

  &__button + &__button {
    border-top: $border-width solid $border-light;
  }
}
</style>
