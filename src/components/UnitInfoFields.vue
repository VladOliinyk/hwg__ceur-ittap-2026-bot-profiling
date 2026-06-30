<template>
  <div
    v-if="unit"
    :class="['unit-info-fields', `unit-info-fields--${variant}`]"
  >
    <div
      v-for="row in displayRows"
      :key="row.key"
      class="unit-info-fields__row"
    >
      <span class="unit-info-fields__label">{{ row.label }}</span>
      <span
        v-if="row.kind === 'faction'"
        class="unit-info-fields__value unit-info-fields__value--faction"
        :class="factionClass"
      >{{ factionName }}</span>
      <span
        v-else-if="row.kind === 'progress'"
        class="unit-info-fields__value unit-info-fields__value--progress"
      >
        <span class="unit-progress" :aria-label="`Actions ${normalizedActionsRemaining}/${normalizedMovement}`">
          <span
            v-for="segment in progressSegmentCount"
            :key="segment"
            class="unit-progress__segment"
            :class="{ 'is-filled': segment <= filledSegmentCount }"
          ></span>
        </span>
        <span class="unit-progress__text">{{ normalizedActionsRemaining }}/{{ normalizedMovement }}</span>
      </span>
      <span
        v-else-if="row.kind === 'weapon'"
        class="unit-info-fields__value unit-info-fields__value--weapon"
        :class="isLoaded ? 'is-loaded' : 'is-empty'"
      >{{ isLoaded ? 'Loaded' : 'Empty' }}</span>
      <span
        v-else
        class="unit-info-fields__value"
      >{{ row.value }}</span>
    </div>
  </div>
</template>

<script>
import { computeProgressSegments } from '../utils/unitUiProgress'

/**
 * Single template for unit stats in SelectedHexDropdown and GameEngineBlock.
 *
 * Canonical row order:
 *   ID, Type, Position (when coordinates valid), Faction, Health, Facing,
 *   Movement Range, Terrain passability, Attack Range, Attack Power,
 *   [Can Move, Can Attack if showEngineExtras]
 *
 * Props:
 *   - showEngineExtras: default false for dropdown, true for engine (canMove/canAttack)
 */
export default {
  name: 'UnitInfoFields',
  props: {
    unit: {
      type: Object,
      default: null
    },
    variant: {
      type: String,
      default: 'engine',
      validator: (v) => v === 'dropdown' || v === 'engine'
    },
    /** When unset, true only for variant="engine". */
    showEngineExtras: {
      type: Boolean,
      default: undefined
    },
    actionsRemaining: {
      type: Number,
      default: null
    },
    isLoaded: {
      type: Boolean,
      default: null
    }
  },
  computed: {
    maxProgressSegments() {
      return 16
    },
    progressStats() {
      return computeProgressSegments(
        this.unit && this.unit.movement,
        this.actionsRemaining,
        this.maxProgressSegments
      )
    },
    normalizedMovement() {
      return this.progressStats.normalizedMovement
    },
    resolvedShowEngineExtras() {
      if (this.showEngineExtras !== undefined) return this.showEngineExtras
      return this.variant === 'engine'
    },
    factionName() {
      if (!this.unit) return ''
      const p = this.unit.player
      if (p === 'player1') return 'Player 1'
      if (p === 'player2') return 'Player 2'
      if (typeof p === 'string' && p.trim() !== '') return p.trim()
      return '—'
    },
    factionClass() {
      if (!this.unit) return ''
      const p = this.unit.player
      if (p === 'player1') return 'player1'
      if (p === 'player2') return 'player2'
      return 'faction-unknown'
    },
    hasActionBudget() {
      return (
        this.unit &&
        this.normalizedMovement > 0 &&
        Number.isFinite(this.actionsRemaining)
      )
    },
    normalizedActionsRemaining() {
      return this.progressStats.normalizedActions
    },
    progressSegmentCount() {
      if (!this.hasActionBudget) return 0
      return this.progressStats.segmentCount
    },
    filledSegmentCount() {
      if (!this.hasActionBudget) return 0
      return this.progressStats.filledCount
    },
    hasWeaponState() {
      return typeof this.isLoaded === 'boolean'
    },
    displayRows() {
      const u = this.unit
      if (!u) return []

      const rows = [
        { key: 'id', label: 'ID', kind: 'text', value: u.id },
        { key: 'type', label: 'Type', kind: 'text', value: u.type }
      ]

      if (this.hasValidUnitPosition(u)) {
        rows.push({
          key: 'position',
          label: 'Position',
          kind: 'text',
          value: `(${u.position.q}, ${u.position.r})`
        })
      }

      rows.push(
        { key: 'faction', label: 'Faction', kind: 'faction' },
        {
          key: 'health',
          label: 'Health',
          kind: 'text',
          value: this.formatHealthDisplay(u)
        },
        { key: 'facing', label: 'Facing', kind: 'text', value: u.facing },
        {
          key: 'movement',
          label: 'Movement range',
          kind: 'text',
          value: u.movement
        },
        {
          key: 'terrainPassability',
          label: 'Terrain passability',
          kind: 'text',
          value:
            u.maxTerrainDifficulty != null && Number.isFinite(Number(u.maxTerrainDifficulty))
              ? u.maxTerrainDifficulty
              : '—'
        },
        {
          key: 'attackRange',
          label: 'Attack range',
          kind: 'text',
          value: u.attackRange
        },
        {
          key: 'attackPower',
          label: 'Attack power',
          kind: 'text',
          value: u.attackPower
        }
      )

      if (this.hasActionBudget) {
        rows.push({
          key: 'actionsRemaining',
          label: 'Actions',
          kind: 'progress'
        })
      }

      if (this.hasWeaponState) {
        rows.push({
          key: 'weaponState',
          label: 'Weapon',
          kind: 'weapon'
        })
      }

      if (this.resolvedShowEngineExtras) {
        const canMove =
          typeof u.canMove === 'function' ? u.canMove() : !!u.canMove
        const canAttack =
          typeof u.canAttack === 'function' ? u.canAttack() : !!u.canAttack
        rows.push(
          { key: 'canMove', label: 'Can move', kind: 'text', value: canMove },
          {
            key: 'canAttack',
            label: 'Can attack',
            kind: 'text',
            value: canAttack
          }
        )
      }

      return rows
    }
  },
  methods: {
    hasValidUnitPosition(u) {
      if (!u || !u.position) return false
      const q = u.position.q
      const r = u.position.r
      return Number.isFinite(q) && Number.isFinite(r)
    },
    formatHealthDisplay(u) {
      if (!u) return '—'
      const h = Number(u.health)
      const m = Number(u.maxHealth)
      const hOk = Number.isFinite(h)
      const mOk = Number.isFinite(m)
      if (hOk && mOk) return `${h}/${m}`
      if (hOk) return `${h}/—`
      if (mOk) return `—/${m}`
      return '—'
    }
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/UnitInfoFields.scss' as *;
</style>
