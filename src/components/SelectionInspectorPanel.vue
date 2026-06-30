<template>
  <div
    v-if="selectedHex"
    class="selection-inspector"
    :class="{
      'selection-inspector--floating': variant === 'floating',
      'selection-inspector--engine': variant === 'engine'
    }"
  >
    <!-- Hex Information -->
    <section
      class="selection-inspector__section engine-section"
      :class="{ 'is-collapsed': collapsedSections.hex }"
    >
      <button
        type="button"
        class="engine-section__header"
        :aria-expanded="String(!collapsedSections.hex)"
        :aria-controls="ids.hexBody"
        @click="toggleSection('hex')"
      >
        <span class="engine-section__title">{{ $t('gameplay.inspector.hexInformation') }}</span>
        <PhCaretDown
          v-if="collapsedSections.hex"
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
        v-show="!collapsedSections.hex"
        :id="ids.hexBody"
        class="engine-section__body selection-inspector__body"
      >
        <div class="selection-inspector__row">
          <span class="selection-inspector__label">{{ $t('gameplay.inspector.coordinates') }}</span>
          <span class="selection-inspector__value">{{ selectedHex.q ?? '—' }}, {{ selectedHex.r ?? '—' }}</span>
        </div>
        <div class="selection-inspector__row">
          <span class="selection-inspector__label">{{ $t('gameplay.inspector.terrain') }}</span>
          <span class="selection-inspector__value">{{ selectedTerrainLabel }}</span>
        </div>
        <div class="selection-inspector__row">
          <span class="selection-inspector__label">{{ $t('gameplay.inspector.terrainDifficulty') }}</span>
          <span class="selection-inspector__value">{{ hexTerrainDifficultyDisplay }}</span>
        </div>
        <div v-if="overlayInfo" class="selection-inspector__row">
          <span class="selection-inspector__label">{{ $t('gameplay.inspector.overlay') }}</span>
          <span class="selection-inspector__value selection-inspector__value--overlay">{{ overlayInfo }}</span>
        </div>
      </div>
    </section>

    <!-- Unit Information -->
    <section
      v-if="hasUnit"
      class="selection-inspector__section engine-section"
      :class="{ 'is-collapsed': collapsedSections.unit }"
    >
      <button
        type="button"
        class="engine-section__header"
        :aria-expanded="String(!collapsedSections.unit)"
        :aria-controls="ids.unitBody"
        @click="toggleSection('unit')"
      >
        <span class="engine-section__title">{{ $t('gameplay.inspector.unitInformation') }}</span>
        <PhCaretDown
          v-if="collapsedSections.unit"
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
        v-show="!collapsedSections.unit"
        :id="ids.unitBody"
        class="engine-section__body selection-inspector__body"
      >
        <UnitInfoFields
          :unit="selectedUnit"
          :actions-remaining="actionsRemaining"
          :is-loaded="isLoaded"
          :variant="variant === 'floating' ? 'dropdown' : 'engine'"
        />
      </div>
    </section>

    <!-- Unit actions -->
    <section
      v-if="hasUnit && (showActions || showKeyboardHints)"
      class="selection-inspector__section engine-section"
      :class="{ 'is-collapsed': collapsedSections.actions }"
    >
      <button
        type="button"
        class="engine-section__header"
        :aria-expanded="String(!collapsedSections.actions)"
        :aria-controls="ids.actionsBody"
        @click="toggleSection('actions')"
      >
        <span class="engine-section__title">{{ $t('gameplay.inspector.unitActions') }}</span>
        <PhCaretDown
          v-if="collapsedSections.actions"
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
        v-show="!collapsedSections.actions"
        :id="ids.actionsBody"
        class="engine-section__body selection-inspector__body"
      >
        <!-- MANOEUVRE -->
        <div v-if="showActions" class="selection-inspector__subsection">
          <h6 class="selection-inspector__subsection-title">{{ $t('gameplay.inspector.manoeuvre') }}</h6>
          <div class="selection-inspector__action-buttons">
            <button
              type="button"
              class="action-btn"
              :disabled="actionsDisabled || !canMoveForward"
              @click="$emit('move-unit-forward')"
            >
              <span aria-hidden="true">&uarr;</span>
              {{ $t('gameplay.inspector.moveForward') }}
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="actionsDisabled || !canMoveReverse"
              @click="$emit('move-unit-reverse')"
            >
              <span aria-hidden="true">&darr;</span>
              {{ $t('gameplay.inspector.reverse') }}
            </button>
          </div>
          <div class="selection-inspector__rotation-controls">
            <button
              type="button"
              class="action-btn"
              :disabled="actionsDisabled"
              @click="$emit('rotate-unit-counterclockwise')"
            >
              {{ $t('gameplay.inspector.ccw') }}
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="actionsDisabled"
              @click="$emit('rotate-unit-clockwise')"
            >
              {{ $t('gameplay.inspector.cw') }}
            </button>
          </div>
        </div>

        <!-- ATTACK -->
        <div v-if="showActions" class="selection-inspector__subsection">
          <h6 class="selection-inspector__subsection-title">{{ $t('gameplay.inspector.attack') }}</h6>
          <div
            v-if="validAttackTargets.length && currentAttackTarget"
            class="attack-target-highlight"
          >
            {{ targetStatusLabel }}
          </div>
          <div
            v-else-if="validAttackTargets.length"
            class="attack-target-highlight attack-target-highlight--empty"
          >
            {{ $t('gameplay.inspector.fireTargetsInconsistent') }}
          </div>
          <div v-else class="attack-target-highlight attack-target-highlight--empty">
            {{ $t('gameplay.inspector.noValidFireTargets') }}
          </div>

          <div class="selection-inspector__action-buttons selection-inspector__attack-actions">
            <button
              type="button"
              class="action-btn action-btn--danger"
              :disabled="actionsDisabled || !canFire"
              @click="$emit('fire')"
            >
              {{ $t('gameplay.inspector.fire') }}
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="actionsDisabled || !canReload"
              @click="$emit('reload')"
            >
              {{ $t('gameplay.inspector.reload') }}
            </button>
          </div>
          <div class="selection-inspector__attack-switch">
            <span class="selection-inspector__attack-switch-label">{{ $t('gameplay.inspector.switchTarget') }}</span>
            <div class="selection-inspector__attack-switch-buttons">
              <button
                type="button"
                class="action-btn action-btn--compact"
                :disabled="actionsDisabled || validAttackTargets.length === 0"
                :title="$t('gameplay.inspector.previousTarget')"
                @click="$emit('attack-target-shift', -1)"
              >
                ◀
              </button>
              <button
                type="button"
                class="action-btn action-btn--compact"
                :disabled="actionsDisabled || validAttackTargets.length === 0"
                :title="$t('gameplay.inspector.nextTarget')"
                @click="$emit('attack-target-shift', 1)"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        <!-- Keyboard Controls -->
        <div
          v-if="showKeyboardHints"
          class="selection-inspector__subsection selection-inspector__subsection--keyboard"
        >
          <h6 class="selection-inspector__subsection-title">{{ $t('gameplay.inspector.keyboardControls') }}</h6>
          <div class="selection-inspector__keyboard-block">
            <p class="selection-inspector__keyboard-caption">{{ $t('gameplay.inspector.manoeuvre') }}</p>
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
          </div>
          <div class="selection-inspector__keyboard-block">
            <p class="selection-inspector__keyboard-caption">{{ $t('gameplay.inspector.attack') }}</p>
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

    <!-- Extra -->
    <section
      class="selection-inspector__section engine-section"
      :class="{ 'is-collapsed': collapsedSections.extra }"
    >
      <button
        type="button"
        class="engine-section__header"
        :aria-expanded="String(!collapsedSections.extra)"
        :aria-controls="ids.extraBody"
        @click="toggleSection('extra')"
      >
        <span class="engine-section__title">{{ $t('gameplay.inspector.extra') }}</span>
        <PhCaretDown
          v-if="collapsedSections.extra"
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
        v-show="!collapsedSections.extra"
        :id="ids.extraBody"
        class="engine-section__body selection-inspector__body"
      >
        <div class="selection-inspector__extra-actions">
          <button type="button" class="action-btn deselect" @click="$emit('deselect')">{{ $t('gameplay.inspector.deselect') }}</button>
          <div class="selection-inspector__extra-caption">{{ $t('gameplay.inspector.rightClickDeselect') }}</div>
        </div>
        <label v-if="showFloatingToggle" class="selection-inspector__floating-toggle">
          <input
            type="checkbox"
            class="selection-inspector__floating-checkbox"
            :checked="showFloatingPanel"
            @change="onFloatingToggle"
          />
          <span>{{ $t('gameplay.inspector.showDetachedPanel') }}</span>
        </label>
      </div>
    </section>
  </div>
</template>

<script>
import { clampTargetIndex } from '../constants/combat.js'
import UnitInfoFields from './UnitInfoFields.vue'
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import { resolvePackageEntryLabel } from '../utils/packageLabels.js'
import { i18nTextMixin } from '../ui/i18nTextMixin.js'

export default {
  name: 'SelectionInspectorPanel',
  mixins: [i18nTextMixin],
  components: { UnitInfoFields, PhCaretDown, PhCaretUp },
  props: {
    /** Вибраний гекс (обов’язковий для відображення панелі). */
    selectedHex: {
      type: Object,
      default: null,
      validator: v => v == null || (typeof v === 'object' && !Array.isArray(v))
    },
    /** Юніт на гексі; якщо відсутній — показуються лише Hex + Extra. */
    selectedUnit: {
      type: Object,
      default: null,
      validator: v => v == null || (typeof v === 'object' && !Array.isArray(v))
    },
    /** Суфікс для унікальних id секцій (a11y), якщо на сторінці кілька інспекторів. За замовчуванням — `variant`. */
    a11yInstanceId: {
      type: String,
      default: null
    },
    /** Стан перемикача плаваючої панелі (секція Extra). */
    showFloatingPanel: {
      type: Boolean,
      default: true
    },
    /** Мінімальні стилістичні відмінності між плаваючою та engine-панеллю. */
    variant: {
      type: String,
      default: 'floating',
      validator: v => v === 'floating' || v === 'engine'
    },
    /** Паритет з `GameEngineBlock` / floating: `gameState.turnState[unitId]`. */
    actionsRemaining: {
      type: Number,
      default: null
    },
    isLoaded: {
      type: Boolean,
      default: null
    },
    canMoveForward: {
      type: Boolean,
      default: false
    },
    canMoveReverse: {
      type: Boolean,
      default: true
    },
    validAttackTargets: {
      type: Array,
      default: () => []
    },
    selectedTargetIndex: {
      type: Number,
      default: 0
    },
    canFire: {
      type: Boolean,
      default: false
    },
    canReload: {
      type: Boolean,
      default: false
    },
    actionsDisabled: {
      type: Boolean,
      default: false
    },
    showActions: {
      type: Boolean,
      default: true
    },
    showKeyboardHints: {
      type: Boolean,
      default: true
    },
    showFloatingToggle: {
      type: Boolean,
      default: true
    }
  },
  emits: [
    'deselect',
    'update:showFloatingPanel',
    'move-unit-forward',
    'move-unit-reverse',
    'rotate-unit-clockwise',
    'rotate-unit-counterclockwise',
    'fire',
    'reload',
    'attack-target-shift'
  ],
  data() {
    return {
      collapsedSections: {
        hex: false,
        unit: false,
        actions: false,
        extra: false
      }
    }
  },
  computed: {
    hexTerrainDifficultyDisplay() {
      const d =
        this.selectedHex &&
        this.selectedHex.terrain &&
        this.selectedHex.terrain.terrainDifficulty
      return Number.isFinite(Number(d)) ? Number(d) : '—'
    },
    selectedTerrainLabel() {
      const terrain = this.selectedHex && this.selectedHex.terrain
      if (!terrain) return '—'
      const locale = this.$i18n && this.$i18n.locale ? this.$i18n.locale : undefined
      if (typeof this.$localizedLabel === 'function') {
        return this.$localizedLabel(terrain, locale, terrain.name || terrain.id || '—')
      }
      return resolvePackageEntryLabel(terrain, locale, '—')
    },
    instanceIdSafe() {
      const raw =
        this.a11yInstanceId != null && String(this.a11yInstanceId).trim() !== ''
          ? String(this.a11yInstanceId).trim()
          : this.variant
      const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '-')
      return safe || 'panel'
    },
    ids() {
      const b = this.instanceIdSafe
      return {
        hexBody: `selection-inspector-hex-${b}`,
        unitBody: `selection-inspector-unit-${b}`,
        actionsBody: `selection-inspector-actions-${b}`,
        extraBody: `selection-inspector-extra-${b}`
      }
    },
    hasUnit() {
      const u = this.selectedUnit
      if (u == null || typeof u !== 'object' || Array.isArray(u)) return false
      const id = u.id
      if (id == null) return false
      if (typeof id === 'number') return Number.isFinite(id)
      if (typeof id === 'string') return id.trim() !== ''
      return false
    },
    overlayInfo() {
      if (!this.selectedHex) return null
      const overlays = []
      if (this.selectedHex.player1Spawn) overlays.push('Player 1 spawn')
      if (this.selectedHex.player1Base) overlays.push('Player 1 base')
      if (this.selectedHex.player2Spawn) overlays.push('Player 2 spawn')
      if (this.selectedHex.player2Base) overlays.push('Player 2 base')
      return overlays.length > 0 ? overlays.join(', ') : null
    },
    displayTargetOrdinal() {
      const len = this.validAttackTargets.length
      if (len <= 0) return 0
      return clampTargetIndex(this.selectedTargetIndex, len) + 1
    },
    currentAttackTarget() {
      const list = this.validAttackTargets
      if (!list.length) return null
      const idx = clampTargetIndex(this.selectedTargetIndex, list.length)
      const t = list[idx]
      if (t && Number.isFinite(t.q) && Number.isFinite(t.r)) return t
      return null
    },
    attackTargetCoordsText() {
      const t = this.currentAttackTarget
      if (!t) return '—, —'
      return `${t.q}, ${t.r}`
    },
    targetStatusLabel() {
      return this.uiText(
        'gameplay.inspector.targetStatus',
        `[Target ${this.displayTargetOrdinal} / ${this.validAttackTargets.length} (${this.attackTargetCoordsText})]`,
        {
          current: this.displayTargetOrdinal,
          total: this.validAttackTargets.length,
          coords: this.attackTargetCoordsText
        }
      )
    }
  },
  methods: {
    toggleSection(key) {
      if (!this.collapsedSections || typeof this.collapsedSections[key] === 'undefined') return
      this.collapsedSections[key] = !this.collapsedSections[key]
    },
    onFloatingToggle(event) {
      const el = event.target
      if (!(el instanceof HTMLInputElement)) return
      this.$emit('update:showFloatingPanel', el.checked)
    }
  }
}
</script>

<style scoped lang="scss">
@use '../styles/components.scss' as *;
@use '../styles/engine-sections';

.selection-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.selection-inspector--floating {
  padding: 0;
}

.selection-inspector--engine {
  padding: 0;
}

.selection-inspector--engine .selection-inspector__section {
  border-radius: 8px;
}

.selection-inspector__body {
  padding-top: 4px;
}

.selection-inspector__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
}

.selection-inspector__label {
  font-weight: 600;
  color: var(--text-secondary, #555);
  min-width: 7rem;
}

.selection-inspector__value {
  color: var(--text-primary, #333);

  &--overlay {
    color: var(--primary-color, #4CAF50);
  }
}

.selection-inspector__subsection {
  margin-bottom: 14px;

  &:last-child {
    margin-bottom: 0;
  }

  &--keyboard {
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--border-color, #e9ecef);
  }
}

.selection-inspector__subsection-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-muted, #666);
}

.selection-inspector__action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.selection-inspector__rotation-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 0;
}

.selection-inspector__attack-actions {
  margin-bottom: 8px;
}

.selection-inspector__attack-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.selection-inspector__attack-switch-label {
  font-size: 13px;
  font-weight: 500;
}

.selection-inspector__attack-switch-buttons {
  display: flex;
  gap: 6px;
}

.selection-inspector__keyboard-block {
  margin-bottom: 10px;

  &:last-child {
    margin-bottom: 0;
  }
}

.selection-inspector__keyboard-caption {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.selection-inspector__extra-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.selection-inspector__extra-caption {
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.selection-inspector__floating-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.selection-inspector__floating-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.action-btn {
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  background: var(--surface-color, #fff);
  cursor: pointer;
  color: var(--text-primary, #333);

  &:hover:not(:disabled) {
    background: #eee;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &.deselect {
    width: 100%;
    justify-content: center;
  }
}

.action-btn--danger {
  background: #c62828;
  color: #fff;
  border-color: transparent;

  &:hover:not(:disabled) {
    background: #b71c1c;
  }
}

.action-btn--compact {
  min-width: 40px;
  padding: 6px 10px;
}

.keyboard-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-primary, #333);

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    padding: 2px 6px;
    border: 1px solid var(--border-color, #ccc);
    border-radius: 4px;
    background: #f0f0f0;
    font-size: 11px;
    font-family: inherit;
  }
}

/* Виділений блок цілі (не plain text) */
.attack-target-highlight {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #c5ccd3);
  border-radius: 8px;
  background: linear-gradient(180deg, #f0f4f8 0%, #e8eef4 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-primary, #222);

  &--empty {
    font-style: italic;
    color: var(--text-muted, #666);
    justify-content: center;
  }
}

.attack-target-highlight__coords {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.75);
}
</style>
