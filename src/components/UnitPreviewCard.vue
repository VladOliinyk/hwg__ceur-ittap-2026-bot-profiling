<template>
  <button
    type="button"
    class="engine-unit-card"
    :class="{
      'is-selected': preview.isSelected,
      'is-depleted': preview.progress.filledCount === 0,
      'is-dead': !preview.isAlive
    }"
    :disabled="!preview.isAlive"
    :title="preview.title"
    :aria-label="preview.title"
    @mouseenter="$emit('hover', preview.id)"
    @mouseleave="$emit('hover', null)"
    @focus="$emit('hover', preview.id)"
    @blur="$emit('hover', null)"
    @click="onClick"
    @contextmenu.prevent="onContextmenu"
  >
    <span
      class="engine-unit-card__hex"
      :class="preview.playerClass"
    >
      <svg
        class="engine-unit-card__hex-svg"
        viewBox="0 0 78 90"
        focusable="false"
        aria-hidden="true"
      >
        <polygon
          class="engine-unit-card__hex-polygon"
          :points="hexPoints"
        />
      </svg>
      <img
        v-if="preview.bodyIcon"
        class="engine-unit-card__body"
        :src="preview.bodyIcon"
        alt=""
      />
      <img
        v-if="preview.arrowIcon"
        class="engine-unit-card__arrow"
        :src="preview.arrowIcon"
        alt=""
        :style="{ transform: preview.arrowTransform }"
      />
    </span>
    <span class="engine-unit-card__hp" :style="{ '--unit-hp-fill': preview.healthPercent + '%' }">
      {{ preview.healthLabel }}
    </span>
    <span
      class="engine-unit-card__progress"
      :aria-label="preview.progressLabel"
    >
      <span
        v-for="segment in preview.progress.segmentCount"
        :key="segment"
        class="engine-unit-card__dot"
        :class="{ 'is-filled': segment <= preview.progress.filledCount }"
      ></span>
    </span>
  </button>
</template>

<script>
/**
 * Shared unit-card button used by GameEngineBlock (interactive turn controls)
 * and AutomatedPlayground (trace playback). The two pages previously carried a
 * byte-for-byte copy of this markup that differed ONLY in the click/contextmenu
 * handlers and the card title (Finding #42).
 *
 * Data in: a fully-built `preview` object (see `computeUnitPreview` in
 * ../ui/unitPreview.js) plus the hex outline `hexPoints`. The title lives on the
 * preview and is INTENTIONALLY per-page (GEB: type+HP, AP: name+facing), so it
 * is rendered as-is here — no title logic in this component.
 *
 * Events out: `hover(unitId|null)`, `select({ unitId, unit, event })`,
 * `deselect({ event })`. Each parent wires its own handlers — GEB selects via
 * the inspector bridge and blurs the button; AP maps a click to the unit hex and
 * a right-click to clearing the frame selection. The native event is forwarded
 * so callers that need `event.currentTarget` (e.g. to blur the button) keep
 * working exactly as before.
 *
 * Styling: the unit-card rules live in this component's own scope-LESS style
 * block (`@use '../styles/unit-preview-card'`). They were moved out of the
 * parents' scoped `engine-turn-controls.scss` because Vue scoped CSS stamps the
 * parent's data-v attribute only on a child's ROOT element, leaving the nested
 * markup (hex, HP bar, dots) unstyled. Scope-less emits plain selectors that
 * match those descendants; the BEM names are owned solely by this component.
 */
export default {
  name: 'UnitPreviewCard',
  props: {
    preview: {
      type: Object,
      required: true
    },
    hexPoints: {
      type: String,
      default: ''
    }
  },
  emits: ['hover', 'select', 'deselect'],
  methods: {
    onClick(event) {
      this.$emit('select', { unitId: this.preview.id, unit: this.preview.unit, event })
    },
    onContextmenu(event) {
      this.$emit('deselect', { event })
    }
  }
}
</script>

<style lang="scss">
/* Scope-less on purpose: this component renders the moved unit-card markup whose
 * nested elements (hex, HP bar, progress dots) would NOT receive a parent's
 * scoped data-v attribute. These BEM classes are owned solely by this component. */
@use '../styles/unit-preview-card';
</style>
