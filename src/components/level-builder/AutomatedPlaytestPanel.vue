<template>
  <section class="automated-playtest" :aria-label="$t('levelBuilder.automatedPlaytest.title')">
    <header class="automated-playtest__header">
      <h3 class="automated-playtest__title">{{ $t('levelBuilder.automatedPlaytest.title') }}</h3>
      <span v-if="result" class="automated-playtest__status">{{ resultLabel }}</span>
    </header>

    <div class="automated-playtest__grid">
      <label class="automated-playtest__field">
        <span>{{ $t('levelBuilder.automatedPlaytest.blueProfile') }}</span>
        <select :value="playerProfile('player1')" @change="updatePlayer('player1', $event.target.value)">
          <option v-for="profile in profiles" :key="profile" :value="profile">{{ profileLabel(profile) }}</option>
        </select>
      </label>
      <label class="automated-playtest__field">
        <span>{{ $t('levelBuilder.automatedPlaytest.redProfile') }}</span>
        <select :value="playerProfile('player2')" @change="updatePlayer('player2', $event.target.value)">
          <option v-for="profile in profiles" :key="profile" :value="profile">{{ profileLabel(profile) }}</option>
        </select>
      </label>
      <label class="automated-playtest__field automated-playtest__field--seed">
        <span>{{ $t('levelBuilder.automatedPlaytest.seed') }}</span>
        <div class="automated-playtest__seed-row">
          <input
            class="automated-playtest__seed-input"
            type="text"
            :value="config.seed"
            :readonly="seedLocked"
            @input="updateField('seed', $event.target.value)"
            @change="$emit('commit-seed', $event.target.value)"
            @keydown.enter.prevent="$emit('commit-seed', $event.target.value)"
          />
          <button
            type="button"
            class="automated-playtest__seed-lock"
            :class="{ 'automated-playtest__seed-lock--locked': seedLocked }"
            :aria-pressed="String(seedLocked)"
            :aria-label="seedLockButtonLabel"
            :title="seedLockButtonLabel"
            @click="$emit('toggle-seed-lock')"
          >
            <PhLockKey v-if="seedLocked" :size="17" weight="bold" aria-hidden="true" />
            <PhLockKeyOpen v-else :size="17" weight="bold" aria-hidden="true" />
          </button>
        </div>
      </label>
      <label class="automated-playtest__field">
        <span>{{ $t('levelBuilder.automatedPlaytest.maxTurns') }}</span>
        <input type="number" min="1" max="999" :value="config.maxTurns" @input="updateField('maxTurns', $event.target.valueAsNumber)" />
      </label>
    </div>

    <div class="automated-playtest__actions">
      <button type="button" :disabled="running" @click="$emit('run-match')">
        {{ running ? $t('levelBuilder.automatedPlaytest.running') : $t('levelBuilder.automatedPlaytest.run') }}
      </button>
      <button type="button" :disabled="!traceAvailable" @click="$emit('open-playback')">
        {{ $t('levelBuilder.automatedPlaytest.openPlayback') }}
      </button>
    </div>

    <p v-if="error" class="automated-playtest__error">{{ error }}</p>
    <dl v-if="result" class="automated-playtest__result">
      <div><dt>{{ $t('levelBuilder.automatedPlaytest.winner') }}</dt><dd>{{ result.winner }}</dd></div>
      <div><dt>{{ $t('levelBuilder.automatedPlaytest.reason') }}</dt><dd>{{ result.reason }}</dd></div>
      <div><dt>{{ $t('levelBuilder.automatedPlaytest.turns') }}</dt><dd>{{ result.turns }}</dd></div>
    </dl>
  </section>
</template>

<script>
import { PhLockKey, PhLockKeyOpen } from '@phosphor-icons/vue'
import { STRATEGY_PROFILES } from '../../domain/simulation/strategyProfiles.js'

export default {
  name: 'AutomatedPlaytestPanel',
  components: {
    PhLockKey,
    PhLockKeyOpen
  },
  props: {
    config: { type: Object, required: true },
    result: { type: Object, default: null },
    error: { type: String, default: '' },
    running: { type: Boolean, default: false },
    traceAvailable: { type: Boolean, default: false },
    seedLocked: { type: Boolean, default: false }
  },
  emits: ['update-config', 'run-match', 'open-playback', 'toggle-seed-lock', 'commit-seed'],
  computed: {
    profiles() {
      return Object.values(STRATEGY_PROFILES)
    },
    resultLabel() {
      return `${this.result.winner} / ${this.result.reason}`
    },
    seedLockButtonLabel() {
      return this.seedLocked
        ? this.$t('levelBuilder.automatedPlaytest.unlockSeed')
        : this.$t('levelBuilder.automatedPlaytest.lockSeed')
    }
  },
  methods: {
    playerProfile(player) {
      const players = this.config && this.config.players ? this.config.players : {}
      return players[player] && players[player].profile
        ? players[player].profile
        : STRATEGY_PROFILES.BALANCED
    },
    profileLabel(profile) {
      return this.$t(`levelBuilder.automatedPlaytest.profiles.${profile}`)
    },
    updatePlayer(player, profile) {
      const players = this.config && this.config.players ? this.config.players : {}
      this.$emit('update-config', {
        players: {
          ...players,
          [player]: { profile }
        }
      })
    },
    updateField(key, value) {
      const nextValue = key === 'maxTurns'
        ? Math.max(1, Math.min(999, Math.trunc(Number(value) || this.config.maxTurns || 1)))
        : value
      this.$emit('update-config', { [key]: nextValue })
    }
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/level-builder-action-controls' as actionControls;
@use '@/styles/variables' as *;

.automated-playtest {
  display: grid;
  gap: 12px;
  // The panel is rendered inside the Review & Export "Test" block slot, which
  // already gaps its children. A light inset rule (no extra margin — the block
  // gap supplies the spacing) marks the panel as its own section within the
  // block without the heavier sibling-divider look it had as a flat sibling.
  padding-top: 16px;
  border-top: $border-width solid $border-light;
}

.automated-playtest__header,
.automated-playtest__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.automated-playtest__title {
  margin: 0;
  font-size: $font-size-xlarge;
}

.automated-playtest__status {
  color: $text-secondary;
  font-size: $font-size-normal;
}

.automated-playtest__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.automated-playtest__field {
  display: grid;
  gap: 4px;
  color: $text-secondary;
  font-size: $font-size-normal;
}

.automated-playtest__field input:not(.automated-playtest__seed-input),
.automated-playtest__field select {
  @include actionControls.field-input;

  min-width: 0;
}

.automated-playtest__field--seed {
  grid-column: 1 / -1;
}

.automated-playtest__seed-row {
  // Flex (not grid) so the shared seed-input (`flex: 1 1 auto`) and
  // seed-lock-button (`flex: 0 0 38px`) mixins size as designed — same layout
  // model the mixins were written for in AutomatedPlayground.
  display: flex;
  align-items: center;
  gap: 6px;
}

.automated-playtest__seed-input {
  @include actionControls.seed-input;
}

.automated-playtest__seed-lock {
  @include actionControls.seed-lock-button;

  padding: 0;
}

.automated-playtest__seed-lock--locked {
  @include actionControls.seed-lock-button-locked;
}

.automated-playtest__actions {
  justify-content: flex-start;
}

.automated-playtest__actions button {
  @include actionControls.action-button;
}

.automated-playtest__error {
  margin: 0;
  color: $error-color;
}

.automated-playtest__result {
  display: flex;
  gap: 16px;
  margin: 0;
}

.automated-playtest__result div {
  display: grid;
  gap: 2px;
}

.automated-playtest__result dt {
  color: $text-muted;
  font-size: $font-size-small;
}

.automated-playtest__result dd {
  margin: 0;
  font-weight: $font-weight-bold;
}

@media (max-width: 960px) {
  .automated-playtest__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
