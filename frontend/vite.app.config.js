import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { configBase } from './vite.base.config.js';

// App (SPA) — app.listadecompras.net
export default defineConfig(
  configBase('app', {
    porta: 8080,
    plugins: [vue(), vuetify({ autoImport: true })],
  }),
);
