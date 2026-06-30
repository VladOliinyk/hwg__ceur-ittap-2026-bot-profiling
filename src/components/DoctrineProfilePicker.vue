<template>
  <div class="doctrine-profile-picker" :aria-label="$t('gameplay.doctrine.title')">
    <label class="doctrine-profile-picker__field">
      <span>{{ $t('gameplay.doctrine.blueProfile') }}</span>
      <select
        class="doctrine-profile-picker__control"
        :value="profileFor('player1')"
        :disabled="disabled"
        @change="onChange('player1', $event.target.value)"
      >
        <option v-for="profile in profiles" :key="profile" :value="profile">
          {{ profileLabel(profile) }}
        </option>
      </select>
    </label>
    <label class="doctrine-profile-picker__field">
      <span>{{ $t('gameplay.doctrine.redProfile') }}</span>
      <select
        class="doctrine-profile-picker__control"
        :value="profileFor('player2')"
        :disabled="disabled"
        @change="onChange('player2', $event.target.value)"
      >
        <option v-for="profile in profiles" :key="profile" :value="profile">
          {{ profileLabel(profile) }}
        </option>
      </select>
    </label>
  </div>
</template>

<script>
/**
 * Two-doctrine profile picker (Blue = player1, Red = player2).
 *
 * Modeled on the Automated page's
 * `automated-playground__setup-grid / __timeline-config` block, but kept as
 * a separate, Playground-local control on purpose: the Playground configures
 * a single local match here, so a small functional duplicate is intentional
 * and the Automated page is left untouched. It reuses the shared `field-input`
 * SCSS mixin (not the markup). Seedless — the seed input stays owned by each
 * host page.
 *
 * Controlled component: the parent owns the `players` map; this only
 * emits `update:player` with `{ player, profile }`.
 */
import { STRATEGY_PROFILES } from '../domain/simulation/strategyProfiles.js'

export default {
  name: 'DoctrineProfilePicker',
  props: {
    /** `{ player1: { profile }, player2: { profile } }` */
    players: {
      type: Object,
      default: () => ({})
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:player'],
  computed: {
    profiles() {
      return Object.values(STRATEGY_PROFILES)
    }
  },
  methods: {
    profileFor(player) {
      const entry = this.players && this.players[player]
      return entry && entry.profile ? entry.profile : STRATEGY_PROFILES.BALANCED
    },
    profileLabel(profile) {
      return this.$t(`gameplay.doctrine.profiles.${profile}`)
    },
    onChange(player, profile) {
      this.$emit('update:player', { player, profile })
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/level-builder-action-controls' as actionControls;

// Same two-up grid the Automated page's doctrine block uses
// (`automated-playground__setup-grid` / `__timeline-config`).
.doctrine-profile-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
}

.doctrine-profile-picker__field {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.doctrine-profile-picker__control {
  @include actionControls.field-input;

  width: 100%;
  min-width: 0;
  font-family: inherit;
}

@media (max-width: 960px) {
  .doctrine-profile-picker {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
