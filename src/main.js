import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import Vue3Lottie from 'vue3-lottie';
import 'bootstrap/dist/css/bootstrap.min.css'; // Bootstrap CSS only — no JS/Popper or bootstrap-vue-next (unused)
import { installI18n } from './i18n';

// createApp(App).mount('#app')
const app = createApp(App);
app.use(router);
app.use(Vue3Lottie);
installI18n(app);
app.mount('#app');
