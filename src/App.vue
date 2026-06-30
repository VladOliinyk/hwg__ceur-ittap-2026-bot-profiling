<template>
  <router-view v-slot="{ Component }">
    <KeepAlive include="LevelBuilder">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
  <NotificationSystem />
</template>

<script>
import NotificationSystem from './components/NotificationSystem.vue'

export default {
  name: 'App',
  components: {
    NotificationSystem
  }
}
</script>

<style lang="scss">
html {
  scrollbar-gutter: stable;
}

@supports not (scrollbar-gutter: stable) {
  html {
    overflow-y: scroll;
  }
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
/*  text-align: center;*/
  color: #2c3e50;
/*  margin-top: 60px;*/
}

/* Global CSS variables for overlay system (spawns & bases) */
:root {
  /* Player 1 overlay color (default: dark blue) */
  --overlay-player1-color: #203e57;
  
  /* Player 2 overlay color (default: red) */
  --overlay-player2-color: #F44336;
  
  /* Border thickness around hexes with overlays (in pixels, without 'px') */
  --overlay-border-width: 2;
  
  /* Player 1 border stroke opacity (0.0 - 1.0) */
  --overlay-player1-stroke-opacity: 0.5;
  
  /* Player 2 border stroke opacity (0.0 - 1.0) */
  --overlay-player2-stroke-opacity: 0.5;

  /* Player 1 border fill opacity (0.0 - 1.0) */
  --overlay-player1-fill-opacity: 0.35;

  /* Player 2 border fill opacity (0.0 - 1.0) */
  --overlay-player2-fill-opacity: 0.55;
  
  /* Size of overlay icons (spawn/base markers) */
  --overlay-icon-size: 24px;
}

/* Global overlay styles (used in LevelBuilder & GameMapBlock) */
.hex-overlay-border {
  pointer-events: none;
  fill: none;
  
  &.hex-overlay-border-p1 {
    fill: url(#diagonal-stripes-p1);
    stroke: var(--overlay-player1-color);
    stroke-width: var(--overlay-border-width);
    stroke-opacity: var(--overlay-player1-stroke-opacity);
  }
  
  &.hex-overlay-border-p2 {
    fill: url(#diagonal-stripes-p2);
    stroke: var(--overlay-player2-color);
    stroke-width: var(--overlay-border-width);
    stroke-opacity: var(--overlay-player2-stroke-opacity);
  }
}

.overlay-icon {
  pointer-events: none;
  user-select: none;
  width: var(--overlay-icon-size);
  height: var(--overlay-icon-size);
}
</style>
