import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { configBase } from './vite.base.config.js';

// API_PROXY (somente no servidor de desenvolvimento): encaminha /v1 para a API,
// ex.: http://backend:3000. Com VITE_API_URL vazia, o app chama a API pela mesma
// origem e funciona com qualquer hostname que o navegador use.
const apiProxy = process.env.API_PROXY;

// App (SPA) — app.listadecompras.net
export default defineConfig(
  configBase('app', {
    porta: 8080,
    plugins: [vue(), vuetify({ autoImport: true })],
    proxy: apiProxy ? { '/v1': { target: apiProxy, changeOrigin: true } } : undefined,
  }),
);
