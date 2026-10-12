import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { criarRouter } from './router/index.js';
import { criarVuetify } from './plugins/vuetify.js';

createApp(App).use(createPinia()).use(criarRouter()).use(criarVuetify()).mount('#app');
