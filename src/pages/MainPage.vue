<template>
  <HeaderComponent />
  <div class="main-page">
    <div class="main-shell">
      <header class="main-hero">
        <img
          class="main-hero__logo"
          src="../assets/hwg_icon.webp"
          :alt="$t('pages.main.logoAlt')"
          width="90"
          height="90"
        >
        <h1 class="main-hero__title">{{ $t('pages.main.title') }}</h1>
        <p class="main-hero__subtitle">{{ $t('pages.main.subtitle') }}</p>
        <p class="main-hero__lead">{{ $t('pages.main.lead') }}</p>
      </header>

      <div class="feature-cards">
        <router-link
          v-for="card in cards"
          :key="card.href"
          :to="card.href"
          class="feature-card"
        >
          <span class="feature-card__icon">
            <component
              v-if="card.iconComponent"
              :is="card.iconComponent"
              :size="28"
              weight="regular"
              aria-hidden="true"
            />
            <span v-else v-html="card.icon" />
          </span>
          <h2 class="feature-card__title">{{ $t(card.titleKey) }}</h2>
          <p class="feature-card__text">{{ $t(card.textKey) }}</p>
          <ul class="feature-card__features">
            <li v-for="key in card.featureKeys" :key="key">{{ $t(key) }}</li>
          </ul>
          <span class="feature-card__action">
            {{ $t(card.actionKey) }}
            <PhArrowRight
              class="feature-card__arrow"
              :size="16"
              weight="bold"
              aria-hidden="true"
            />
          </span>
        </router-link>
      </div>

      <p class="main-flow">{{ $t('pages.main.flow') }}</p>
    </div>
  </div>
</template>

<script>
import { PhArrowRight, PhHexagon } from '@phosphor-icons/vue'
import HeaderComponent from '../components/HeaderComponent'

const TARGET_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>'

export default {
  name: 'MainPage',
  components: {
    HeaderComponent,
    PhArrowRight,
    PhHexagon,
  },
  data() {
    return {
      cards: [
        {
          href: '/LevelBuilder',
          iconComponent: 'PhHexagon',
          titleKey: 'pages.main.cards.levelBuilder.title',
          textKey: 'pages.main.cards.levelBuilder.text',
          actionKey: 'pages.main.cards.levelBuilder.action',
          featureKeys: [
            'pages.main.cards.levelBuilder.features.map',
            'pages.main.cards.levelBuilder.features.units',
            'pages.main.cards.levelBuilder.features.rules',
          ],
        },
        {
          href: '/Playground',
          icon: TARGET_ICON,
          titleKey: 'pages.main.cards.playground.title',
          textKey: 'pages.main.cards.playground.text',
          actionKey: 'pages.main.cards.playground.action',
          featureKeys: [
            'pages.main.cards.playground.features.load',
            'pages.main.cards.playground.features.play',
            'pages.main.cards.playground.features.state',
          ],
        },
      ],
    }
  },
}
</script>

<style scoped>
.main-page {
  min-height: 100vh;
}

.main-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.main-hero {
  text-align: center;
  margin-bottom: 32px;
}

.main-hero__logo {
  display: block;
  width: 90px;
  height: 90px;
  object-fit: contain;
  margin: 0 auto 14px;
}

.main-hero__title {
  margin: 0;
  font-size: 2.5rem;
  font-weight: 700;
  color: #0f172a;
}

.main-hero__subtitle {
  margin: 4px 0 0;
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.25;
  color: #334155;
}

.main-hero__lead {
  margin: 12px auto 0;
  max-width: 640px;
  font-size: 1.0625rem;
  line-height: 1.55;
  color: #475569;
}

.feature-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px solid #dee2e6;
  border-radius: 12px;
  background: #ffffff;
  color: #334155;
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.feature-card:hover {
  border-color: #4CAF50;
  box-shadow: 0 8px 24px rgba(76, 175, 80, 0.16);
  transform: translateY(-3px);
}

.feature-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #4CAF50;
}

.feature-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: #E8F5E8;
  color: #4CAF50;
}

.feature-card__title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  color: #0f172a;
}

.feature-card__text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #475569;
}

.feature-card__features {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feature-card__features li {
  position: relative;
  padding-left: 22px;
  font-size: 0.9rem;
  line-height: 1.4;
  color: #475569;
}

.feature-card__features li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 0.45em;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: #4CAF50;
  transform: rotate(45deg);
}

.feature-card__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #4CAF50;
}

.feature-card__arrow {
  transition: transform 0.15s ease;
}

.feature-card:hover .feature-card__arrow {
  transform: translateX(3px);
}

.main-flow {
  margin: 28px 0 0;
  text-align: center;
  font-size: 0.95rem;
  color: #64748b;
}

@media (max-width: 720px) {
  .feature-cards {
    grid-template-columns: 1fr;
  }
}
</style>
