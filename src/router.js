// src/router.js
import { createRouter, createWebHashHistory } from 'vue-router';
import MainPage from './pages/MainPage.vue';
import Playground from './pages/Playground.vue';
import LevelBuilder from './pages/LevelBuilder.vue';
import AutomatedPlayground from './pages/AutomatedPlayground.vue';

const routes = [
  { path: '/', component: MainPage },
  { path: '/LevelBuilder', component: LevelBuilder },
  { path: '/Playground', component: Playground },
  { path: '/AutomatedPlayground', component: AutomatedPlayground },
  // Preserve old `/HexMapPlayground` bookmarks: redirect to the renamed Playground page.
  { path: '/HexMapPlayground', redirect: '/Playground' },
  // Preserve old `/HexMapBuilder` bookmarks: redirect to the new Level Builder.
  { path: '/HexMapBuilder', redirect: '/LevelBuilder' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
