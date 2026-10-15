import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { criarRouter } from './router/index.js';
import { criarVuetify } from './plugins/vuetify.js';

const pinia = createPinia();
createApp(App).use(pinia).use(criarRouter(undefined, pinia)).use(criarVuetify()).mount('#app');
